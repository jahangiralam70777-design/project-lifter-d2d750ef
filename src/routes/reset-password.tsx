import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { KeyRound, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import {
  PasswordInput,
  NeonButton,
  FieldLabel,
  StrengthMeter,
  Requirements,
} from "@/components/auth/AuthPrimitives";
import { updatePassword } from "@/lib/auth-client";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/app-store";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: () => ({
    meta: [
      { title: "Create New Password · CA Aspire BD" },
      { name: "description", content: "Set a new password and secure your CA Aspire BD account." },
      { property: "og:title", content: "Create New Password · CA Aspire BD" },
      {
        property: "og:description",
        content: "Strong password requirements with real-time strength feedback.",
      },
    ],
  }),
});

type Phase = "checking" | "ready" | "invalid";

function parseRecoveryState(url: URL) {
  const hash = url.hash || "";
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const queryType = (url.searchParams.get("type") || "").toLowerCase();
  const hashType = (hashParams.get("type") || "").toLowerCase();
  const hasRecoveryType = queryType === "recovery" || hashType === "recovery";
  const hasCode = url.searchParams.has("code");
  const hasTokenHash = url.searchParams.has("token_hash");
  const hasImplicitTokens = hash.includes("access_token=") || hash.includes("refresh_token=");

  return {
    hash,
    hashParams,
    hasCode,
    hasTokenHash,
    hasImplicitTokens,
    hasRecoveryType,
    // Supabase PKCE recovery callbacks often arrive as /reset-password?code=...
    // without an explicit type. Because this route is only used for password
    // recovery, a code on this path is treated as recovery, but a plain existing
    // session with no recovery URL markers is not.
    hasRecoveryCallback: hasRecoveryType || hasCode || hasTokenHash || hasImplicitTokens,
  };
}

function ResetPassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("checking");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const navigate = useNavigate();
  const refreshAuth = useAppStore((s) => s.refreshAuth);
  const match = pw.length > 0 && pw === pw2;
  const handled = useRef(false);

  // ---------------------------------------------------------------------------
  // Recovery URL handling — supports ALL Supabase email-link formats:
  //   1. PKCE flow: ?code=<auth_code>          → exchangeCodeForSession
  //   2. OTP flow:  ?token_hash=<hash>&type=recovery → verifyOtp
  //   3. Implicit:  #access_token=...&type=recovery  → auto-detected by supabase-js
  //   4. PASSWORD_RECOVERY auth event           → already signed in for recovery
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (handled.current) return;
    handled.current = true;

    let cancelled = false;
    let recoveryCallbackSeen = false;

    const showInvalid = (msg: string) => {
      if (cancelled) return;
      console.warn("[reset-password] recovery link invalid:", msg);
      setErrorMsg(msg);
      setPhase("invalid");
    };

    const markReady = () => {
      if (cancelled) return;
      console.log("[reset-password] recovery session ready");
      setPhase("ready");
    };

    // Listen for the PASSWORD_RECOVERY event — fires when supabase-js
    // auto-detects a recovery token in the URL (implicit or PKCE).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[reset-password] auth event:", event, !!session);
      if (event === "PASSWORD_RECOVERY" && session) {
        recoveryCallbackSeen = true;
        markReady();
        return;
      }
      // PKCE exchange emits SIGNED_IN, not PASSWORD_RECOVERY, in some Supabase
      // configurations. Only accept SIGNED_IN when this page has already seen a
      // recovery callback URL. A normal existing session must not unlock the
      // reset form or trigger root/dashboard redirects.
      if (event === "SIGNED_IN" && session && recoveryCallbackSeen) {
        markReady();
      }
    });

    (async () => {
      try {
        const url = new URL(window.location.href);
        const recoveryState = parseRecoveryState(url);
        const hash = recoveryState.hash;
        recoveryCallbackSeen = recoveryState.hasRecoveryCallback;
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");
        const errParam = url.searchParams.get("error") || url.searchParams.get("error_description");

        if (errParam) {
          showInvalid(decodeURIComponent(errParam));
          return;
        }

        // 1) PKCE flow — exchange ?code= for a session.
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) return showInvalid(error.message);
          // Clean the URL so a refresh won't try to re-exchange a used code.
          window.history.replaceState({}, "", window.location.pathname);
          markReady();
          return;
        }

        // 2) Token-hash OTP flow.
        if (tokenHash && (type === "recovery" || !type)) {
          const { error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
          });
          if (error) return showInvalid(error.message);
          window.history.replaceState({}, "", window.location.pathname);
          markReady();
          return;
        }

        // 3) Implicit flow — supabase-js with detectSessionInUrl auto-parses
        //    the hash. Just check whether a session is now present.
        if (recoveryState.hasImplicitTokens || recoveryState.hasRecoveryType) {
          // Give supabase-js a tick to detect & persist the hash session.
          await new Promise((r) => setTimeout(r, 100));
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            window.history.replaceState({}, "", window.location.pathname);
            markReady();
            return;
          }
        }

        // 4) Plain existing sessions are intentionally NOT accepted here. The
        // app may already have a user signed in, but /reset-password must only
        // show the form after a real recovery callback or PASSWORD_RECOVERY
        // event. Otherwise a normal session can masquerade as a reset session.

        // Nothing usable in the URL — wait briefly for PASSWORD_RECOVERY event,
        // then fail.
        setTimeout(() => {
          if (!cancelled && phase === "checking") {
            showInvalid(
              "This password reset link is invalid or has expired. Please request a new one.",
            );
          }
        }, 1000);
      } catch (err) {
        showInvalid((err as Error).message || "Could not process recovery link.");
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (!match) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      await updatePassword(pw);
      // Keep the recovery session — Supabase upgrades it to a full session
      // on updateUser, so the user is now signed in. Hydrate the app store
      // and send them straight to the dashboard. No re-login required.
      try {
        await refreshAuth({ force: true });
      } catch {
        /* non-fatal — root listener will reconcile shortly */
      }
      toast.success("Password updated. Welcome back!");
      navigate({ to: "/dashboard" as never, replace: true });
    } catch (err) {
      const msg = (err as Error).message ?? "Could not update password";
      console.error("[reset-password] updatePassword failed:", err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (phase === "checking") {
    return (
      <AuthShell>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--neon-purple)]" />
          <p className="mt-4 text-sm text-muted-foreground">Verifying recovery link…</p>
        </div>
      </AuthShell>
    );
  }

  if (phase === "invalid") {
    return (
      <AuthShell>
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-[0_0_30px_rgba(244,63,94,0.4)]">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-center font-display text-2xl font-bold tracking-tight">
          Reset link unavailable
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {errorMsg ||
            "This password reset link is invalid or has expired. Please request a new one."}
        </p>
        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/forgot-password" })}
            className="w-full rounded-xl bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_var(--neon-purple)] hover:opacity-90"
          >
            Request new reset link
          </button>
          <Link
            to="/login"
            className="block text-center text-xs font-semibold text-[var(--neon-blue)] hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-[0_0_30px_var(--neon-purple)]">
        <KeyRound className="h-6 w-6" />
      </div>
      <h2 className="text-center font-display text-3xl font-bold tracking-tight">
        Create new password
      </h2>
      <p className="mt-1.5 text-center text-sm text-muted-foreground">
        Choose a strong password to re-secure your account.
      </p>

      <form className="mt-7 space-y-4" onSubmit={onSubmit}>
        <div>
          <FieldLabel htmlFor="reset-password-new">New password</FieldLabel>
          <PasswordInput
            id="reset-password-new"
            name="new-password"
            autoComplete="new-password"
            value={pw}
            onChange={setPw}
          />
          <StrengthMeter value={pw} />
        </div>
        <div>
          <FieldLabel htmlFor="reset-password-confirm">Confirm password</FieldLabel>
          <PasswordInput
            id="reset-password-confirm"
            name="confirm-password"
            autoComplete="new-password"
            value={pw2}
            onChange={setPw2}
          />
          {pw2.length > 0 && (
            <p
              id="reset-password-match"
              aria-live="polite"
              className={`mt-1 text-[11px] ${match ? "text-emerald-400" : "text-rose-400"}`}
            >
              {match ? "Passwords match." : "Passwords do not match."}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3 w-3 text-[var(--neon-purple)]" /> Security checklist
          </div>
          <Requirements value={pw} />
        </div>

        <NeonButton type="submit" disabled={loading || !match || pw.length < 8}>
          {loading ? "Updating…" : "Reset password"}
        </NeonButton>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Remembered it?{" "}
        <Link to="/login" className="font-semibold text-[var(--neon-blue)] hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
