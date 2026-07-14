// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function parseUserAgent(ua: string | null | undefined) {
  const s = ua ?? "";
  let browser = "Unknown";
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/Chrome\//.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s)) browser = "Safari";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  let device = "Desktop";
  if (/Mobile|Android|iPhone/.test(s)) device = "Mobile";
  else if (/iPad|Tablet/.test(s)) device = "Tablet";
  return { browser, device };
}

const loginInput = z.object({ user_agent: z.string().max(500).optional() });

export const recordLoginEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof loginInput>) => loginInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ua = data.user_agent ?? "";
    const { browser, device } = parseUserAgent(ua);
    const { data: row, error } = await supabase
      .from("user_login_events")
      .insert({ user_id: userId, user_agent: ua, browser, device })
      .select("id")
      .single();
    if (error) throw error;
    // Bump profile counters
    const { data: prof } = await supabase
      .from("profiles")
      .select("total_login_count")
      .eq("id", userId)
      .maybeSingle();
    await supabase
      .from("profiles")
      .update({
        last_login_at: new Date().toISOString(),
        total_login_count: (prof?.total_login_count ?? 0) + 1,
      })
      .eq("id", userId);
    return { event_id: row.id };
  });

const logoutInput = z.object({ event_id: z.string().uuid() });

export const recordLogoutEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof logoutInput>) => logoutInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date();
    const { data: existing } = await supabase
      .from("user_login_events")
      .select("login_at,logout_at")
      .eq("id", data.event_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!existing || existing.logout_at) return { ok: true };
    const startedAt = new Date(existing.login_at).getTime();
    const duration = Math.max(0, Math.round((now.getTime() - startedAt) / 1000));
    const { error } = await supabase
      .from("user_login_events")
      .update({ logout_at: now.toISOString(), duration_seconds: duration })
      .eq("id", data.event_id)
      .eq("user_id", userId);
    if (error) throw error;
    const { data: prof } = await supabase
      .from("profiles")
      .select("total_usage_seconds")
      .eq("id", userId)
      .maybeSingle();
    await supabase
      .from("profiles")
      .update({ total_usage_seconds: (prof?.total_usage_seconds ?? 0) + duration })
      .eq("id", userId);
    return { ok: true, duration };
  });