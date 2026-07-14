import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, RotateCcw, Loader2, Inbox, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AuthShell } from "@/components/auth/AuthShell";
import { supabase } from "@/integrations/supabase/client";

const RESEND_COOLDOWN_SECONDS = 60;

const searchSchema = z.object({
  email: z.string().email().optional().catch(undefined),
});

export const Route = createFileRoute("/check-email")({
  component: CheckEmail,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Verify your email · CA Aspire BD" },
      { name: "description", content: "We sent you a verification link. Confirm your email to activate your account." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function CheckEmail() {
  const { email } = useSearch({ from: "/check-email" });
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    const target = email || window.prompt("Enter your email address:");
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
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const m = (err as Error).message || "Failed to resend.";
      toast.error(/rate|too many/i.test(m) ? "Too many requests. Please wait a minute." : m);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell>
      <div className="relative text-center py-2">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-[var(--neon-blue)] to-[var(--neon-purple)] shadow-[0_0_40px_var(--neon-purple)]">
          <Mail className="h-9 w-9 text-white" />
        </div>
        <h2 className="mt-6 font-display text-3xl font-bold tracking-tight">Verify your email</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          We've sent a verification link {email ? <>to <span className="font-semibold text-foreground">{email}</span></> : "to your inbox"}.
          Click the link to activate your account.
        </p>

        <div className="mt-6 space-y-3 text-left">
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-3">
            <Inbox className="mt-0.5 h-4 w-4 text-[var(--neon-blue)]" />
            <p className="text-xs text-muted-foreground">
              Don't see it? Check your <span className="font-semibold text-foreground">spam</span> or <span className="font-semibold text-foreground">junk</span> folder.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-[var(--neon-purple)]" />
            <p className="text-xs text-muted-foreground">
              The link expires in <span className="font-semibold text-foreground">30 minutes</span> and can be used once.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--neon-blue)] to-[var(--neon-purple)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_var(--neon-purple)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            {resending
              ? "Sending…"
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : "Resend verification email"}
          </button>
          <Link
            to="/login"
            className="block text-center text-xs font-semibold text-muted-foreground hover:text-[var(--neon-blue)]"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
