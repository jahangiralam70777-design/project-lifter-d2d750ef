import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, ShieldCheck, Lock, Activity } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { NeoInput, PasswordInput, NeonButton, FieldLabel } from "@/components/auth/AuthPrimitives";
import { useAppStore } from "@/stores/app-store";
import { signInWithEmail, signOut } from "@/lib/auth-client";
import { setRememberMe } from "@/lib/session-timeout";
import { supabase } from "@/integrations/supabase/client";
import {
  syncCurrentUserRoleMetadata,
  verifyAdminAccess,
  type VerifyAdminAccessResult,
} from "@/lib/admin-verify.functions";

export const Route = createFileRoute("/admin/login")({
  component: AdminLogin,
  head: () => ({
    meta: [
      { title: "Admin Secure Access · CA Aspire BD" },
      { name: "description", content: "Secure sign-in for CA Aspire BD administrators." },
      { property: "og:title", content: "Admin Secure Access · CA Aspire BD" },
      { property: "og:description", content: "Authorized personnel only." },
    ],
  }),
});

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const refreshAuth = useAppStore((s) => s.refreshAuth);
  const navigate = useNavigate();

  const handleSignIn = async (emailVal: string, pwVal: string) => {
    setLoading(true);
    try {
      // Admin sessions are never "remembered" — they must die with the tab.
      setRememberMe(false);
      await signInWithEmail(emailVal, pwVal, { intent: "admin" });
      await syncCurrentUserRoleMetadata();
      await supabase.auth.refreshSession().catch(() => undefined);
      const user = await refreshAuth({ force: true });
      if (!user) throw new Error("Session not found");
      const verified = (await verifyAdminAccess()) as VerifyAdminAccessResult;
      console.info("[admin-login] verified role sources", {
        sessionRole: user.role,
        serverRole: verified.role,
        sources: verified.sources,
      });
      if (!verified.isAdmin && !verified.isModerator) {
        // Strict separation: only admin-role accounts may use /admin/login.
        // Sign non-admins out and STAY on /admin/login (no cross-redirect).
        await signOut().catch(() => undefined);
        await refreshAuth({ force: true });
        toast.error("Access Denied. Student accounts cannot access the Admin Portal.");
        return;
      }
      toast.success("Admin verified. Welcome.");
      try {
        window.sessionStorage.setItem("admin-verified-at", String(Date.now()));
      } catch {
        /* ignore storage errors */
      }
      navigate({ to: "/admin", replace: true }); // admin dashboard
    } catch (err) {
      toast.error((err as Error).message ?? "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSignIn(email, pw);
  };

  return (
    <AuthShell variant="admin">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--neon-purple)]">
          <ShieldCheck className="h-3 w-3" /> Secure Tier · L4
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          All systems nominal
        </span>
      </div>

      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Admin secure access</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">Authorized personnel only.</p>

      <form className="mt-4 space-y-4" onSubmit={onSubmit}>
        <div>
          <FieldLabel>Admin email</FieldLabel>
          <NeoInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            icon={<Mail className="h-4 w-4" />}
          />
        </div>
        <div>
          <FieldLabel>Password</FieldLabel>
          <PasswordInput value={pw} onChange={setPw} />
        </div>

        <NeonButton type="submit" disabled={loading}>
          <Lock className="h-4 w-4" /> {loading ? "Signing in…" : "Secure login"}
        </NeonButton>
      </form>

      <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-muted/30 p-3 text-[11px]">
        <div>
          <p className="uppercase tracking-wider text-muted-foreground">Server</p>
          <p className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <Activity className="h-3 w-3" /> 38 ms
          </p>
        </div>
        <div>
          <p className="uppercase tracking-wider text-muted-foreground">Threats</p>
          <p className="font-semibold text-foreground">0 active</p>
        </div>
        <div>
          <p className="uppercase tracking-wider text-muted-foreground">Last login</p>
          <p className="font-semibold text-foreground">2 h · Mumbai</p>
        </div>
      </div>
    </AuthShell>
  );
}
