// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";

export type AuthControls = {
  id: number;
  login_enabled: boolean;
  signup_enabled: boolean;
  login_message_title: string;
  login_message_subtitle: string;
  login_message_description: string;
  login_message_footer: string;
  signup_message_title: string;
  signup_message_subtitle: string;
  signup_message_description: string;
  signup_message_footer: string;
  login_auto_enable_at: string | null;
  signup_auto_enable_at: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
};

const FAILSAFE: AuthControls = {
  id: 1,
  login_enabled: true,
  signup_enabled: true,
  login_message_title: "System Maintenance",
  login_message_subtitle: "Login Temporarily Disabled",
  login_message_description:
    "Login is temporarily unavailable due to maintenance. Please try again later.",
  login_message_footer: "Please check back later.",
  signup_message_title: "System Maintenance",
  signup_message_subtitle: "Signup Temporarily Disabled",
  signup_message_description:
    "New registrations are temporarily unavailable. Please try again later.",
  signup_message_footer: "Please check back later.",
  login_auto_enable_at: null,
  signup_auto_enable_at: null,
  updated_by: null,
  updated_at: new Date(0).toISOString(),
  created_at: new Date(0).toISOString(),
};

/**
 * Public read — uses the admin client so anonymous visitors on
 * /login and /signup can still render the maintenance screen.
 * The RPC also auto-flips when an auto-enable timestamp has passed.
 * Failsafe: any error returns login+signup ENABLED so admins are
 * never locked out by a broken backend.
 */
export const getAuthControls = createServerFn({ method: "GET" }).handler(async () => {
  try {
    // A-1: read with the anon (publishable) client — no service-role exposure
    // on an unauthenticated public endpoint. RLS allows anon SELECT on
    // auth_access_controls and the RPC is GRANTed to anon, authenticated.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.rpc("get_auth_access_controls" as never);
    if (error || !data) return FAILSAFE;
    return data as unknown as AuthControls;
  } catch (err) {
    console.error("[auth-controls] read failed; failing open", err);
    return FAILSAFE;
  }
});

export type AuthControlsPatch = Partial<
  Pick<
    AuthControls,
    | "login_enabled"
    | "signup_enabled"
    | "login_message_title"
    | "login_message_subtitle"
    | "login_message_description"
    | "login_message_footer"
    | "signup_message_title"
    | "signup_message_subtitle"
    | "signup_message_description"
    | "signup_message_footer"
    | "login_auto_enable_at"
    | "signup_auto_enable_at"
  >
>;

/**
 * Admin-only mutation. Authorisation is enforced inside the
 * SECURITY DEFINER RPC (has_role(...,'admin')); we attach
 * requireSupabaseAuth so a bearer is always present.
 */
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const updateAuthControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: AuthControlsPatch) => input ?? {})
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    console.info("[auth-controls.update] payload", { userId: context.userId, data });
    const { data: row, error } = await sb.rpc("update_auth_access_controls", {
      _payload: data,
    });
    if (error) {
      console.error("[auth-controls.update] rpc error", error);
      throw new Error(error.message ?? "Update failed");
    }
    console.info("[auth-controls.update] persisted row", row);
    return row as AuthControls;
  });

/**
 * Lightweight pre-check used by sign-in / sign-up flows.
 * Always resolves; failsafe to allowed=true on any error.
 */
export const checkAuthAllowed = createServerFn({ method: "GET" })
  .validator((input: { kind: "login" | "signup" }) => input)
  .handler(async ({ data }) => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: row, error } = await supabase.rpc(
        "get_auth_access_controls" as never,
      );
      if (error || !row) return { allowed: true, message: null as string | null };
      const r = row as unknown as AuthControls;
      if (data.kind === "login") {
        return {
          allowed: r.login_enabled,
          message: r.login_enabled ? null : r.login_message_description,
        };
      }
      return {
        allowed: r.signup_enabled,
        message: r.signup_enabled ? null : r.signup_message_description,
      };
    } catch (err) {
      console.error("[auth-controls] pre-check failed; failing open", err);
      return { allowed: true, message: null };
    }
  });