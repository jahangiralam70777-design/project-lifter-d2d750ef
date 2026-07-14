// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { noInput } from "@/lib/validate";
const updateSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  bio: z.string().max(500).nullable().optional(),
  avatar_url: z.string().url().max(1024).nullable().optional(),
  // M-1: `level` intentionally NOT user-editable. A student must not be able
  // to self-promote their academic tier and unlock gated content. Level is
  // assigned by admins via the user-management flow or by enrollment.
});


export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, bio, level, created_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("profiles").update(data).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });