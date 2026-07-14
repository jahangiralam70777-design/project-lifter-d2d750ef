import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, ArrowRight, MailCheck, AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { NeonButton } from "@/components/auth/AuthPrimitives";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/email-verified")({
  component: EmailVerified,
  head: () => ({
    meta: [
      { title: "Verifying Email · CA Aspire BD" },
      { name: "description", content: "Confirming your email and signing you in." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

type Phase = "verifying" | "success" | "expired" | "error";

function Confetti() {
  const pieces = Array.from({ length: 24 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const left = (i * 41) % 100;
        const delay = (i % 7) * 0.4;
        const colors = [
          "var(--neon-purple)",
          "var(--neon-blue)",
          "var(--neon-pink)",
          "#34d399",
          "#fbbf24",
        ];
        return (
          <span
            key={i}
            className="absolute h-2 w-2 rounded-sm animate-float"
            style={{
              left: `${left}%`,
              top: `${(i * 23) % 80}%`,
              background: colors[i % colors.length],
              boxShadow: `0 0 10px ${colors[i % colors.length]}`,
              animationDelay: `${delay}s`,
              transform: `rotate(${(i * 37) % 360}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}

function EmailVerified() {
  const [phase, setPhase] = useState<Phase>("verifying");
  const [email, setEmail] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [resending, setResending] = useState(false);
  const handled = useRef(false);
  const navigate = useNavigate();

  // ============================================================
  // VERIFICATION CALLBACK HANDLER
  // ------------------------------------------------------------
  // Supabase delivers the email-confirmation link in one of three
  // formats depending on the project's auth flow setting:
  //
  //   1. PKCE flow:    ?code=<auth_code>
  //   2. OTP/Hash flow: ?token_hash=<hash>&type=signup|email|invite|magiclink
  //   3. Legacy hash:  #access_token=…&refresh_token=…&type=signup
  //
  // We must support ALL of them. After a successful exchange we
  // create the session, strip tokens from the URL (anti-replay /
  // anti-leak), and redirect to the user's dashboard.
  // ============================================================
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (handled.current) return;
    handled.current = true;

    // Safety net: if a password-recovery link landed here (because of an old
    // email template or a third-party forwarder), bounce to /reset-password
    // BEFORE exchanging the token. Exchanging here would sign the user in
    // and skip the new-password form.
    {
      const url = new URL(window.location.href);
      const type = (url.searchParams.get("type") || "").toLowerCase();
      const hash = window.location.hash || "";
      const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
      const hashType = (hashParams.get("type") || "").toLowerCase();
      if (type === "recovery" || hashType === "recovery") {
        const search = window.location.search || "";
        window.location.replace(`/reset-password${search}${hash}`);
        return;
      }
    }

    let cancelled = false;

    const fail = (msg: string, expired = false) => {
      if (cancelled) return;
      console.warn("[email-verified] verification failed:", msg);
      setErrorMsg(msg);
      setPhase(expired ? "expired" : "error");
    };

    const success = async () => {
      if (cancelled) return;
      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user?.email) setEmail(data.user.email);
      } catch {
        /* ignore */
      }
      console.warn("[email-verified] verification succeeded");
      setPhase("success");
      // Auto-forward to dashboard after a short success flash. Keeps the
      // confirmation visible long enough to feel intentional without
      // adding noticeable latency.
      window.setTimeout(() => {
        if (!cancelled) navigate({ to: "/dashboard" as never, replace: true });
      }, 600);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.warn("[email-verified] auth event:", event, !!session);
      if (event === "SIGNED_IN" && session && phase === "verifying") {
        void success();
      }
    });

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const type = (url.searchParams.get("type") || "").toLowerCase();
        const hash = window.location.hash || "";
        const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
        const errParam =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error") ||
          hashParams.get("error_description") ||
          hashParams.get("error");

        console.warn("[email-verified] callback diagnostics", {
          path: url.pathname,
          searchKeys: Array.from(url.searchParams.keys()),
          hashKeys: Array.from(hashParams.keys()),
          hasCode: Boolean(code),
          hasTokenHash: Boolean(tokenHash),
          type,
        });

        // Recovery (password-reset) tokens MUST go to /reset-password —
        // exchanging them here would log the user in and skip the password
        // change step entirely.
        const isRecovery =
          type === "recovery" ||
          hashParams.get("type") === "recovery";
        if (isRecovery) {
          window.location.replace(`/reset-password${window.location.search}${hash}`);
          return;
        }

        if (errParam) {
          const decoded = decodeURIComponent(errParam);
          const expired = /expired|otp_expired|invalid/i.test(decoded);
          window.history.replaceState({}, "", window.location.pathname);
          return fail(decoded, expired);
        }

        // --- 1. PKCE flow --------------------------------------
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          console.warn("[email-verified] exchangeCodeForSession result", {
            ok: !error,
            hasSession: Boolean(data?.session),
            hasUser: Boolean(data?.user),
            error: error?.message,
          });
          if (error) {
            const expired = /expired|invalid|used/i.test(error.message);
            return fail(error.message, expired);
          }
          window.history.replaceState({}, "", window.location.pathname);
          return success();
        }

        // --- 2. OTP / token_hash flow --------------------------
        if (tokenHash) {
          // Supabase signup confirmations use type=signup, magic links use
          // type=magiclink, invites use type=invite, email-change confirms
          // use type=email_change. Default to "signup" when missing.
          const otpType = (type || "signup") as
            | "signup"
            | "magiclink"
            | "invite"
            | "email"
            | "email_change"
            | "recovery";
          const { data, error } = await supabase.auth.verifyOtp({
            type: otpType,
            token_hash: tokenHash,
          });
          console.warn("[email-verified] verifyOtp result", {
            ok: !error,
            hasSession: Boolean(data?.session),
            hasUser: Boolean(data?.user),
            error: error?.message,
          });
          if (error) {
            const expired = /expired|invalid|used/i.test(error.message);
            return fail(error.message, expired);
          }
          window.history.replaceState({}, "", window.location.pathname);
          return success();
        }

        // --- 3. Legacy implicit hash flow ----------------------
        if (hash.includes("access_token") || hash.includes("type=signup")) {
          // detectSessionInUrl on the supabase client handles this; just
          // wait briefly and check for a session.
          await new Promise((r) => setTimeout(r, 120));
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            window.history.replaceState({}, "", window.location.pathname);
            return success();
          }
        }

        // --- 4. Already verified (user opened link twice) ------
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          return success();
        }

        // --- 5. No recognizable token on URL -------------------
        // Give onAuthStateChange a brief window to fire before declaring
        // the link invalid (e.g. detectSessionInUrl still in flight).
        window.setTimeout(() => {
          if (!cancelled && phase === "verifying") {
            fail(
              "We couldn't find a valid verification token in this link. It may have been opened in a different browser or already used.",
            );
          }
        }, 1200);
      } catch (err) {
        fail((err as Error).message || "Unable to verify email.");
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResend = async () => {
    const target = email || window.prompt("Enter the email address to resend verification to:");
    if (!target) return;
    setResending(true);
    try {
      const redirectTo = `${window.location.origin}/email-verified`;
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: target,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      toast.success("Verification email sent. Please check your inbox.");
    } catch (err) {
      const m = (err as Error).message || "Failed to resend verification email.";
      toast.error(/rate|too many/i.test(m) ? "Too many requests. Please wait a minute." : m);
    } finally {
      setResending(false);
    }
  };

  // ===== RENDER =====
  if (phase === "verifying") {
    return (
      <AuthShell>
        <div className="relative py-10 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-[var(--neon-blue)] to-[var(--neon-purple)] shadow-[0_0_40px_var(--neon-purple)]">
            <Loader2 className="h-9 w-9 animate-spin text-white" />
          </div>
          <h2 className="mt-6 font-display text-2xl font-bold">Verifying your email…</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Hang tight — confirming your account and signing you in.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (phase === "expired" || phase === "error") {
    const isExpired = phase === "expired";
    return (
      <AuthShell>
        <div className="relative py-6 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.5)]">
            <AlertTriangle className="h-9 w-9 text-white" />
          </div>
          <h2 className="mt-6 font-display text-2xl font-bold">
            {isExpired ? "Link expired" : "Verification failed"}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            {isExpired
              ? "This verification link has expired or already been used. Request a fresh one below."
              : errorMsg || "We couldn't verify this email. Please request a new link."}
          </p>
          <div className="mt-6 space-y-3">
            <button
              onClick={handleResend}
              disabled={resending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--neon-blue)] to-[var(--neon-purple)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_var(--neon-purple)] transition hover:opacity-95 disabled:opacity-60"
            >
              {resending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {resending ? "Sending…" : "Resend verification email"}
            </button>
            <Link
              to="/login"
              className="block text-xs font-semibold text-muted-foreground hover:text-[var(--neon-blue)]"
            >
              Back to sign in
            </Link>
            <Link
              to="/signup"
              className="block text-xs font-semibold text-muted-foreground hover:text-[var(--neon-blue)]"
            >
              Create a new account
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  // Success
  return (
    <AuthShell>
      <div className="relative py-4 text-center">
        <Confetti />
        <div className="relative mx-auto grid h-24 w-24 place-items-center">
          <div
            className="absolute inset-0 rounded-full opacity-70 blur-2xl animate-pulse-glow"
            style={{ background: "var(--neon-purple)" }}
          />
          <div className="absolute inset-2 rounded-full border-2 border-[var(--neon-blue)]/40" />
          <div className="absolute inset-5 rounded-full border-2 border-[var(--neon-purple)]/60" />
          <div className="relative grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 via-[var(--neon-blue)] to-[var(--neon-purple)] text-white shadow-[0_0_40px_var(--neon-purple)] animate-scale-in">
            <Check className="h-8 w-8" strokeWidth={3} />
          </div>
        </div>

        <h2 className="mt-6 font-display text-3xl font-bold tracking-tight">Email verified!</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          Your account is now active. Step into your AI-personalized learning command deck.
        </p>

        {email ? (
          <div className="mx-auto mt-5 flex items-center justify-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400">
            <MailCheck className="h-3.5 w-3.5" /> {email} · confirmed
          </div>
        ) : null}

        <div className="mt-7 space-y-3">
          <Link to="/dashboard">
            <NeonButton>
              Continue to dashboard <ArrowRight className="h-4 w-4" />
            </NeonButton>
          </Link>
          <Link
            to="/login"
            className="block text-xs font-semibold text-muted-foreground hover:text-[var(--neon-blue)]"
          >
            or return to sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
