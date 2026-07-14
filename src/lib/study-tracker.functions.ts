// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// H-3 fix: the client no longer dictates how many seconds are added per
// heartbeat. The server computes the delta from the previous
// `last_heartbeat_at` and clamps it to a sane window so a malicious client
// cannot inflate study time by calling pingStudySession in a tight loop.
const PingSchema = z.object({
  module: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_/-]+$/)
    .default("dashboard"),
});

const MAX_DELTA_SECONDS = 120; // ≤ heartbeat interval cap
const SESSION_GAP_SECONDS = 5 * 60;

/** Heartbeat: extends the current open session for this module, or opens a new one. */
export const pingStudySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => PingSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = Date.now();
    const cutoff = new Date(now - SESSION_GAP_SECONDS * 1000).toISOString();

    const { data: open } = await supabase
      .from("study_sessions")
      .select("id,duration_seconds,last_heartbeat_at")
      .eq("user_id", userId)
      .eq("module", data.module)
      .is("ended_at", null)
      .gte("last_heartbeat_at", cutoff)
      .order("last_heartbeat_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (open) {
      const lastTs = open.last_heartbeat_at ? new Date(open.last_heartbeat_at).getTime() : now;
      const elapsedSec = Math.max(0, Math.round((now - lastTs) / 1000));
      const delta = Math.min(MAX_DELTA_SECONDS, elapsedSec);
      await supabase
        .from("study_sessions")
        .update({
          last_heartbeat_at: new Date(now).toISOString(),
          duration_seconds: (open.duration_seconds ?? 0) + delta,
        })
        .eq("id", open.id);
      return { id: open.id, ok: true };
    }

    const { data: row } = await supabase
      .from("study_sessions")
      .insert({
        user_id: userId,
        module: data.module,
        duration_seconds: 0,
      })
      .select("id")
      .single();
    return { id: row?.id, ok: true };
  });