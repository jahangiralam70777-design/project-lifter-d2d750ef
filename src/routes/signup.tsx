import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, User, Phone, Sparkles, GraduationCap, Trophy, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import {
  NeoInput,
  PasswordInput,
  NeonButton,
  FieldLabel,
  StrengthMeter,
} from "@/components/auth/AuthPrimitives";
import { useAppStore } from "@/stores/app-store";
import { signUpWithEmail } from "@/lib/auth-client";
import { useAuthControls } from "@/hooks/use-auth-controls";
import { MaintenanceScreen } from "@/components/auth/MaintenanceScreen";

export const Route = createFileRoute("/signup")({
  component: StudentSignup,
  head: () => ({
    meta: [
      { title: "Sign Up · CA Aspire BD" },
      {
        name: "description",
        content: "Create your CA Aspire BD account and start learning smarter today.",
      },
      { property: "og:title", content: "Sign Up · CA Aspire BD" },
      {
        property: "og:description",
        content: "AI-personalized study paths, mock tests and adaptive practice.",
      },
    ],
  }),
});

const LEVELS = [
  { key: "certificate", label: "Certificate", desc: "Foundation track" },
  { key: "professional", label: "Professional", desc: "Career-ready" },
  { key: "advanced", label: "Advanced", desc: "Mastery tier" },
];

export const REFERRAL_SOURCES = [
  "Facebook",
  "YouTube",
  "Friend/Referral",
  "Teacher",
  "Google Search",
  "WhatsApp",
  "Instagram",
  "Other",
] as const;

function StudentSignup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState("professional");
  const [referral, setReferral] = useState<string>("");
  const refreshAuth = useAppStore((s) => s.refreshAuth);
  const syncAuthSession = useAppStore((s) => s.syncAuthSession);
  const navigate = useNavigate();
  const controlsQ = useAuthControls();
  const blocked = controlsQ.data ? controlsQ.data.signup_enabled === false : false;

  const extractErrorMessage = (err: unknown): string => {
    if (!err) return "Sign-up failed. Please try again.";
    if (typeof err === "string") {
      const t = err.trim();
      if (!t || t === "{}" || t === "[]") return "Sign-up failed. Please try again.";
      return t;
    }
    if (err instanceof Error) {
      const msg = (err.message ?? "").trim();
      if (msg && msg !== "{}" && msg !== "[]") return msg;
    }
    if (typeof err === "object") {
      const anyErr = err as Record<string, unknown>;
      const candidate =
        (typeof anyErr.message === "string" && anyErr.message) ||
        (typeof anyErr.msg === "string" && anyErr.msg) ||
        (typeof anyErr.error_description === "string" && anyErr.error_description) ||
        (typeof anyErr.error === "string" && anyErr.error) ||
        "";
      const t = String(candidate).trim();
      if (t) return t;
    }
    return "Sign-up failed. Please try again.";
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) {
      toast.error(
        controlsQ.data?.signup_message_description ??
          "New registrations are temporarily unavailable.",
      );
      return;
    }
    if (!name.trim()) return toast.error("Please enter your full name");
    if (!email.trim()) return toast.error("Please enter your email");
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (!referral) return toast.error("Please tell us how you heard about CA Aspire BD");
    setLoading(true);
    console.info("[signup] submit start", { email: email.trim(), url: window.location.href });
    try {
      const result = await signUpWithEmail({
        email: email.trim(),
        password: pw,
        displayName: name.trim(),
        phone: phone.trim() || undefined,
        level,
        referralSource: referral,
      });
      console.info("[signup] result", {
        hasSession: Boolean(result?.session),
        hasUser: Boolean(result?.user),
        needsConfirmation: !result?.session && Boolean(result?.user),
      });
      if (result?.session?.user) {
        // Optimistic user so UI updates immediately on /dashboard.
        syncAuthSession(result.session, {
          id: result.session.user.id,
          name: name.trim() || email.split("@")[0] || "Learner",
          email: result.session.user.email ?? email.trim(),
          role: "student",
        });
        toast.success("Account created. Welcome aboard!");
        navigate({ to: "/dashboard", replace: true });
        void refreshAuth({ force: true });
      } else if (result?.user) {
        navigate({ to: "/check-email" as never, search: { email: email.trim() } as never, replace: true });
      } else {
        // Defensive: signUp returned no error but also no user/session. Treat
        // as a transient failure so the user gets actionable feedback instead
        // of a blank screen or raw JSON.
        toast.error("Sign-up did not complete. Please try again in a moment.");
      }
    } catch (err) {
      console.error("[signup] error", err);
      const raw = extractErrorMessage(err);
      // Translate common Supabase / SMTP failure modes into friendly copy.
      let friendly = raw;
      if (/sending.*confirmation.*email|smtp|email.*rate.*limit/i.test(raw)) {
        friendly =
          "We couldn't send the confirmation email right now. Please try again in a few minutes or contact support.";
      } else if (/already.*registered|already.*exists|user.*exists/i.test(raw)) {
        friendly = raw; // already user-friendly from auth-client
      } else if (/network|fetch failed|load failed/i.test(raw)) {
        friendly = "Network error. Please check your connection and try again.";
      }
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  if (blocked && controlsQ.data) {
    return (
      <MaintenanceScreen
        title={controlsQ.data.signup_message_title}
        subtitle={controlsQ.data.signup_message_subtitle}
        description={controlsQ.data.signup_message_description}
        footer={controlsQ.data.signup_message_footer}
        autoEnableAt={controlsQ.data.signup_auto_enable_at}
      />
    );
  }

  return (
    <AuthShell variant="student">
      <h2 className="font-display text-3xl font-bold tracking-tight">Create your account</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Join CA Aspire BD and start your CA journey today.
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <FieldLabel htmlFor="signup-name">Full name</FieldLabel>
          <NeoInput
            id="signup-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your full name"
            autoComplete="name"
            icon={<User className="h-4 w-4" />}
          />
        </div>
        <div>
          <FieldLabel htmlFor="signup-email">Email</FieldLabel>
          <NeoInput
            id="signup-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            autoComplete="email"
            icon={<Mail className="h-4 w-4" />}
          />
        </div>
        <div>
          <FieldLabel htmlFor="signup-phone">Phone (optional)</FieldLabel>
          <NeoInput
            id="signup-phone"
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Enter your phone number"
            autoComplete="tel"
            icon={<Phone className="h-4 w-4" />}
          />
        </div>

        <div>
          <FieldLabel htmlFor="signup-password">Password</FieldLabel>
          <PasswordInput
            id="signup-password"
            name="new-password"
            autoComplete="new-password"
            value={pw}
            onChange={setPw}
            placeholder="Enter your password"
          />
          <StrengthMeter value={pw} />
        </div>

        <div>
          <FieldLabel htmlFor="signup-level">Select level</FieldLabel>
          <div id="signup-level" className="grid grid-cols-3 gap-2">
            {LEVELS.map((l) => {
              const active = level === l.key;
              return (
                <button
                  type="button"
                  key={l.key}
                  onClick={() => setLevel(l.key)}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-[var(--neon-purple)] bg-gradient-to-br from-[var(--neon-purple)]/15 to-[var(--neon-blue)]/10 shadow-[0_0_24px_-6px_var(--neon-purple)]"
                      : "border-border bg-background/40 hover:border-[var(--neon-blue)]"
                  }`}
                >
                  <p className="text-xs font-semibold">{l.label}</p>
                  <p className="text-[10px] text-muted-foreground">{l.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="signup-referral">How did you hear about CA Aspire BD?</FieldLabel>
          <div className="relative">
            <Megaphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              id="signup-referral"
              name="referral"
              value={referral}
              onChange={(e) => setReferral(e.target.value)}
              required
              className="h-11 w-full appearance-none rounded-xl border border-border bg-background/40 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--neon-purple)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon-purple)_25%,transparent)]"
            >
              <option value="" disabled>
                Select an option…
              </option>
              {REFERRAL_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <NeonButton type="submit" disabled={loading}>
          <Sparkles className="h-4 w-4" /> {loading ? "Creating account…" : "Create account"}
        </NeonButton>
      </form>

      <div className="mt-5 flex gap-2">
        {[
          { icon: GraduationCap, t: "ICAB-aligned curriculum" },
          { icon: Trophy, t: "Adaptive mock tests" },
        ].map((b, i) => (
          <div
            key={i}
            className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2"
          >
            <b.icon className="h-4 w-4 text-[var(--neon-purple)]" />
            <span className="text-[11px] font-medium">{b.t}</span>
          </div>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-[var(--neon-blue)] hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
