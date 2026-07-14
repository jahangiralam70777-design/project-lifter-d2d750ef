import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Lock, Send, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { NeoInput, NeonButton, FieldLabel } from "@/components/auth/AuthPrimitives";
import { resetPasswordForEmail } from "@/lib/auth-client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
  head: () => ({
    meta: [
      { title: "Forgot Password · CA Aspire BD" },
      { name: "description", content: "Recover your CA Aspire BD account securely." },
      { property: "og:title", content: "Forgot Password · CA Aspire BD" },
      { property: "og:description", content: "Send a recovery link to your inbox in seconds." },
    ],
  }),
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error("Please enter your email");
    setLoading(true);
    try {
      await resetPasswordForEmail(email.trim());
      setSent(true);
      toast.success("Recovery link sent. Check your inbox.");
    } catch (err) {
      toast.error((err as Error).message ?? "Could not send recovery link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-[0_0_30px_var(--neon-purple)]">
        <Lock className="h-6 w-6" />
      </div>
      <h2 className="text-center font-display text-3xl font-bold tracking-tight">
        Forgot password?
      </h2>
      <p className="mt-1.5 text-center text-sm text-muted-foreground">
        Recover your account securely — we'll email you a one-time link.
      </p>

      <form className="mt-7 space-y-4" onSubmit={onSubmit}>
        <div>
          <FieldLabel htmlFor="forgot-email">Account email</FieldLabel>
          <NeoInput
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@school.edu"
            icon={<Mail className="h-4 w-4" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <NeonButton type="submit" disabled={loading}>
          <Send className="h-4 w-4" />{" "}
          {loading ? "Sending…" : sent ? "Resend recovery link" : "Send recovery link"}
        </NeonButton>
      </form>

      {sent && (
        <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs text-emerald-300">
          If an account exists for <span className="font-semibold">{email}</span>, a reset link is
          on its way.
        </p>
      )}

      <button
        type="button"
        onClick={() => navigate({ to: "/login" })}
        className="mt-6 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-[var(--neon-blue)] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </button>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Don't have an account?{" "}
        <Link to="/signup" className="font-semibold text-[var(--neon-blue)] hover:underline">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
