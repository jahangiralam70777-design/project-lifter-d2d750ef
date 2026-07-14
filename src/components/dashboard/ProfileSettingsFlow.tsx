import { useEffect, useMemo, useRef, useState } from "react";
import {
  User,
  Mail,
  Phone,
  Building2,
  CalendarDays,
  Edit3,
  Camera,
  Lock,
  Shield,
  Smartphone,
  History,
  Bell,
  Mail as MailIcon,
  BellRing,
  GraduationCap,
  Globe,
  Target,
  Palette,
  Type,
  Moon,
  Sun,
  Trophy,
  Flame,
  Medal,
  Star,
  Sparkles,
  Activity,
  PlayCircle,
  Download,
  Layers,
  AlertTriangle,
  LogOut,
  Trash2,
  RotateCcw,
  Save,
  KeyRound,
  Check,
  Loader2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/app-store";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { studentPerformanceCenter } from "@/lib/student-performance.functions";
import { updatePassword } from "@/lib/auth-client";
import { DEFAULT_PREFS, setPrefs, usePrefs, type NotifPrefs } from "@/lib/profile-prefs";
import { confirmDialog } from "@/components/ui/confirm-imperative";

const TABS = [
  { t: "Personal", i: User },
  { t: "Appearance", i: Palette },
  { t: "Notifications", i: Bell },
  { t: "Privacy", i: Shield },
] as const;

type Tab = (typeof TABS)[number]["t"];

type Status = { kind: "idle" | "saving" | "saved" | "error"; msg?: string };

function useInlineStatus() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = (s: Status) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus(s);
    if (s.kind === "saved" || s.kind === "error") {
      timer.current = setTimeout(() => setStatus({ kind: "idle" }), 2200);
    }
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [status, update] as const;
}

function StatusPill({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  const cls =
    status.kind === "error"
      ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
      : status.kind === "saved"
        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
        : "border-border/60 bg-background/60 text-muted-foreground";
  const label =
    status.kind === "saving"
      ? "Saving…"
      : status.kind === "saved"
        ? "Saved"
        : status.msg || "Error";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${cls}`}
    >
      {status.kind === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status.kind === "saved" && <Check className="h-3 w-3" />}
      {status.kind === "error" && <AlertTriangle className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function ProfileSettingsFlow() {
  const [tab, setTab] = useState<Tab>("Personal");
  const prefs = usePrefs();
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();

  const fetchProfile = useServerFn(getMyProfile);
  const profileQ = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const handleLogout = async () => {
    const ok = await confirmDialog({
      title: "Sign out of CA Aspire BD?",
      confirmLabel: "Sign out",
    });
    if (!ok) return;
    await logout();
    navigate({ to: "/login" });
  };

  const handleReset = async () => {
    const ok = await confirmDialog({
      title: "Reset preferences?",
      description: "Restore appearance, notifications and learning preferences to defaults.",
      confirmLabel: "Reset",
      variant: "destructive",
    });
    if (!ok) return;
    setPrefs(DEFAULT_PREFS);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[var(--neon-purple)]/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-[var(--neon-blue)]/20 blur-3xl" />
        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-widest text-[var(--neon-blue)]">
            Account · Preferences
          </div>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight md:text-4xl">
            Profile &amp; <span className="text-gradient">Settings</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Manage your account, appearance, privacy and learning preferences.
          </p>
        </div>
      </div>

      <ProfileCard profile={profileQ.data} userEmail={user?.email ?? ""} />

      <StatsRow />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-2">
            {TABS.map((t) => {
              const active = tab === t.t;
              return (
                <button
                  key={t.t}
                  onClick={() => setTab(t.t)}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all ${
                    active
                      ? "bg-cta-gradient text-white shadow-glow"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <t.i className="h-3.5 w-3.5" />
                  {t.t}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                Changes save automatically
              </span>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs hover:bg-background/60"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          </div>

          {tab === "Personal" && (
            <PersonalPanel profile={profileQ.data} userEmail={user?.email ?? ""} />
          )}
          {tab === "Appearance" && (
            <AppearancePanel
              theme={theme}
              toggleTheme={toggleTheme}
              accent={prefs.accent}
              fontSize={prefs.fontSize}
            />
          )}
          {tab === "Notifications" && <NotificationsPanel prefs={prefs.notif} />}
          {tab === "Privacy" && <PrivacyPanel twoFA={prefs.twoFA} />}
        </div>

        <aside className="space-y-4">
          <LearningPrefsWidget selected={prefs.subjects} />
          <AchievementsWidget />
          <RecentActivityWidget />
        </aside>
      </div>

      <DangerZone onLogout={handleLogout} />
    </div>
  );
}

function ProfileCard({ profile, userEmail }: { profile: any; userEmail: string }) {
  const user = useAppStore((s) => s.user);
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useInlineStatus();
  const fileRef = useRef<HTMLInputElement>(null);

  const displayName = profile?.display_name ?? user?.name ?? "Learner";
  const avatarUrl: string | undefined = profile?.avatar_url ?? undefined;
  const initials = useMemo(
    () =>
      displayName
        .split(/\s+/)
        .map((x: string) => x[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [displayName],
  );

  const onPickFile = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    if (file.size > 4 * 1024 * 1024) {
      setStatus({ kind: "error", msg: "Max 4MB" });
      return;
    }
    setUploading(true);
    setStatus({ kind: "saving" });
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: pub.publicUrl })
        .eq("id", user.id);
      if (dbErr) throw dbErr;
      await qc.invalidateQueries({ queryKey: ["my-profile"] });
      setStatus({ kind: "saved" });
    } catch (err: any) {
      setStatus({ kind: "error", msg: err?.message ?? "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6">
      <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-fuchsia-500/15 blur-3xl" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="relative">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] opacity-70 blur-md" />
          <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-fuchsia-500/30 via-purple-500/20 to-sky-500/30 text-2xl font-bold text-white">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            ) : (
              initials || "ME"
            )}
            <button
              type="button"
              onClick={onPickFile}
              disabled={uploading}
              aria-label="Change avatar"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-cta-gradient shadow-glow disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
              ) : (
                <Camera className="h-3.5 w-3.5 text-white" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onFile}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-bold">{displayName}</h2>
            <span className="rounded-full border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300">
              {profile?.level ?? "Student"}
            </span>
            <StatusPill status={status} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <InfoRow i={Mail} v={userEmail || "—"} />
            <InfoRow
              i={CalendarDays}
              v={
                profile?.created_at
                  ? `Joined ${new Date(profile.created_at).toLocaleDateString()}`
                  : "—"
              }
            />
            {profile?.bio && <InfoRow i={User} v={profile.bio} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ i: Icon, v }: { i: typeof Mail; v: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-foreground/60" />
      <span className="truncate">{v}</span>
    </div>
  );
}

function StatsRow() {
  const fetchPerf = useServerFn(studentPerformanceCenter);
  const { data, isLoading } = useQuery({
    queryKey: ["student-performance-center"],
    queryFn: () => fetchPerf(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const summary = data?.summary ?? [];
  const totals = data?.totals;
  const mockTotal = summary.find((s) => s.kind === "mock")?.total ?? 0;
  const quizTotal = summary.find((s) => s.kind === "quiz")?.total ?? 0;
  const mcqsSolved = totals?.answered ?? 0;
  const accuracy = totals?.accuracy ?? 0;
  const monthlyPct = totals?.monthlyProgressPct ?? 0;
  const monthlySolved = totals?.mcqSolvedThisMonth ?? 0;

  const fmt = (n: number) => (isLoading ? "—" : n.toLocaleString());

  const stats = [
    {
      l: "MCQs Solved",
      v: fmt(mcqsSolved),
      s: "All submitted answers",
      i: GraduationCap,
      tint: "text-sky-300",
    },
    {
      l: "Mock Tests",
      v: fmt(mockTotal),
      s: "Total attempts",
      i: Trophy,
      tint: "text-amber-300",
    },
    {
      l: "Quiz Attempts",
      v: fmt(quizTotal),
      s: "Total attempts",
      i: Activity,
      tint: "text-fuchsia-300",
    },
    {
      l: "Accuracy",
      v: isLoading ? "—" : `${accuracy}%`,
      s: "Overall submitted",
      i: Target,
      tint: "text-emerald-300",
    },
    {
      l: "Monthly Progress",
      v: isLoading ? "—" : `${monthlyPct}%`,
      s: `${monthlySolved} MCQs this month`,
      i: Flame,
      tint: "text-orange-300",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map((s) => (
        <div key={s.l} className="glass shadow-card-soft relative overflow-hidden rounded-2xl p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-[var(--neon-purple)]/20 to-[var(--neon-blue)]/10 blur-2xl" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.l}</p>
              <p className="font-display mt-1 text-2xl font-bold">{s.v}</p>
              <p className="text-[10px] text-muted-foreground">{s.s}</p>
            </div>
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40 ${s.tint}`}
            >
              <s.i className="h-4 w-4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Panel({
  title,
  desc,
  right,
  children,
}: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass shadow-card-soft rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
        </div>
        {right}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  icon: Icon,
  disabled,
  placeholder,
}: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  type?: string;
  icon?: typeof Mail;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        )}
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={`h-10 w-full rounded-xl border border-border/60 bg-background/40 pr-3 text-sm outline-none transition-colors focus:border-[var(--neon-blue)]/60 disabled:opacity-60 ${
            Icon ? "pl-9" : "pl-3"
          }`}
        />
      </div>
    </label>
  );
}

function PersonalPanel({ profile, userEmail }: { profile: any; userEmail: string }) {
  const qc = useQueryClient();
  const update = useServerFn(updateMyProfile);
  const [status, setStatus] = useInlineStatus();
  const [pwStatus, setPwStatus] = useInlineStatus();

  const [name, setName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  useEffect(() => {
    setName(profile?.display_name ?? "");
    setBio(profile?.bio ?? "");
  }, [profile?.display_name, profile?.bio]);

  const saveMutation = useMutation({
    mutationFn: (data: { display_name?: string; bio?: string | null }) => update({ data }),
    onMutate: () => setStatus({ kind: "saving" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      setStatus({ kind: "saved" });
    },
    onError: (e: any) => setStatus({ kind: "error", msg: e?.message ?? "Save failed" }),
  });

  // Debounced autosave on blur change
  const dirty =
    (profile?.display_name ?? "") !== name.trim() || (profile?.bio ?? "") !== (bio.trim() || null);

  const onSave = () => {
    if (!name.trim()) {
      setStatus({ kind: "error", msg: "Name required" });
      return;
    }
    saveMutation.mutate({ display_name: name.trim(), bio: bio.trim() || null });
  };

  const [cur, setCur] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  const onUpdatePw = async () => {
    if (pw1.length < 6) {
      setPwStatus({ kind: "error", msg: "Min 6 chars" });
      return;
    }
    if (pw1 !== pw2) {
      setPwStatus({ kind: "error", msg: "Passwords differ" });
      return;
    }
    setPwStatus({ kind: "saving" });
    try {
      await updatePassword(pw1);
      setCur("");
      setPw1("");
      setPw2("");
      setPwStatus({ kind: "saved" });
    } catch (e: any) {
      setPwStatus({ kind: "error", msg: e?.message ?? "Failed" });
    }
  };

  return (
    <>
      <Panel
        title="Personal Information"
        desc="Update your basic profile details."
        right={<StatusPill status={status} />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" value={name} onChange={setName} icon={User} />
          <Field label="Email" value={userEmail} icon={Mail} disabled />
        </div>
        <div>
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Bio
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Tell other learners a bit about yourself…"
            className="w-full rounded-xl border border-border/60 bg-background/40 p-3 text-sm outline-none focus:border-[var(--neon-blue)]/60"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={onSave}
            disabled={!dirty || saveMutation.isPending}
            className="bg-cta-gradient flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-glow disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save changes
          </button>
        </div>
      </Panel>

      <Panel
        title="Update Password"
        desc="Use a strong, unique password."
        right={<StatusPill status={pwStatus} />}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Current" type="password" icon={Lock} value={cur} onChange={setCur} />
          <Field label="New" type="password" icon={Lock} value={pw1} onChange={setPw1} />
          <Field label="Confirm" type="password" icon={Lock} value={pw2} onChange={setPw2} />
        </div>
        <div className="flex justify-end">
          <button
            onClick={onUpdatePw}
            disabled={!pw1 || !pw2}
            className="bg-cta-gradient flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-glow disabled:opacity-50"
          >
            <KeyRound className="h-3.5 w-3.5" /> Update password
          </button>
        </div>
      </Panel>
    </>
  );
}

function AppearancePanel({
  theme,
  toggleTheme,
  accent,
  fontSize,
}: {
  theme: "dark" | "light";
  toggleTheme: () => void;
  accent: string;
  fontSize: number;
}) {
  const colors = ["#a855f7", "#3b82f6", "#22d3ee", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];
  return (
    <Panel
      title="Appearance"
      desc="Customize how CA Aspire BD looks for you. Changes apply instantly."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => theme !== "dark" && toggleTheme()}
          className={`group flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
            theme === "dark"
              ? "border-[var(--neon-purple)]/60 bg-[var(--neon-purple)]/10 shadow-glow"
              : "border-border/60 bg-background/40"
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-black text-white">
            <Moon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Dark Mode</p>
            <p className="text-[11px] text-muted-foreground">Deep black + neon glow</p>
          </div>
          {theme === "dark" && <Check className="h-4 w-4 text-fuchsia-300" />}
        </button>
        <button
          onClick={() => theme !== "light" && toggleTheme()}
          className={`group flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
            theme === "light"
              ? "border-[var(--neon-blue)]/60 bg-[var(--neon-blue)]/10 shadow-glow"
              : "border-border/60 bg-background/40"
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 to-white text-amber-500">
            <Sun className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Light Mode</p>
            <p className="text-[11px] text-muted-foreground">Soft lavender + sky</p>
          </div>
          {theme === "light" && <Check className="h-4 w-4 text-sky-300" />}
        </button>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Palette className="h-3.5 w-3.5" /> Theme accent
        </p>
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setPrefs({ accent: c })}
              aria-label={`Accent ${c}`}
              className={`relative h-9 w-9 rounded-full border transition-transform hover:scale-110 ${
                accent === c ? "border-white/80 ring-2 ring-white/40" : "border-white/10"
              }`}
              style={{ background: c, boxShadow: `0 0 16px ${c}55` }}
            >
              {accent === c && <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-2">
            <Type className="h-3.5 w-3.5" /> Font size
          </span>
          <span className="text-foreground">{fontSize}px</span>
        </div>
        <input
          type="range"
          min={12}
          max={22}
          value={fontSize}
          onChange={(e) => setPrefs({ fontSize: Number(e.target.value) })}
          className="w-full accent-[var(--neon-purple)]"
        />
      </div>
    </Panel>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        on ? "bg-cta-gradient shadow-glow" : "bg-muted"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? "left-5" : "left-0.5"
        }`}
      />
    </button>
  );
}

function PrefRow({
  i: Icon,
  title,
  desc,
  on,
  onClick,
}: {
  i: typeof Bell;
  title: string;
  desc: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--neon-purple)]/20 to-[var(--neon-blue)]/10">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <Toggle on={on} onClick={onClick} />
    </div>
  );
}

function NotificationsPanel({ prefs }: { prefs: NotifPrefs }) {
  const toggle = (k: keyof NotifPrefs) => setPrefs({ notif: { ...prefs, [k]: !prefs[k] } });
  return (
    <Panel
      title="Notification Preferences"
      desc="Choose what you'd like to hear about. Saved automatically on this device."
    >
      <PrefRow
        i={MailIcon}
        title="Email notifications"
        desc="Weekly digest + important alerts"
        on={prefs.email}
        onClick={() => toggle("email")}
      />
      <PrefRow
        i={BellRing}
        title="Push notifications"
        desc="Realtime alerts in browser & app"
        on={prefs.push}
        onClick={() => toggle("push")}
      />
      <PrefRow
        i={Trophy}
        title="Mock test reminders"
        desc="Get notified before scheduled mocks"
        on={prefs.mock}
        onClick={() => toggle("mock")}
      />
      <PrefRow
        i={Sparkles}
        title="Quiz alerts"
        desc="New quizzes and results readiness"
        on={prefs.quiz}
        onClick={() => toggle("quiz")}
      />
      <PrefRow
        i={PlayCircle}
        title="Class updates"
        desc="New videos & instructor notes"
        on={prefs.class}
        onClick={() => toggle("class")}
      />
    </Panel>
  );
}

function PrivacyPanel({ twoFA }: { twoFA: boolean }) {
  const devices = [{ d: "This device", loc: "Current session", time: "Active now", current: true }];
  return (
    <>
      <Panel title="Security" desc="Protect your account with extra verification.">
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
            <Shield className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Two-factor authentication</p>
            <p className="text-[11px] text-muted-foreground">
              Preference saved locally. Full TOTP enrollment coming soon.
            </p>
          </div>
          <Toggle on={twoFA} onClick={() => setPrefs({ twoFA: !twoFA })} />
        </div>
      </Panel>

      <Panel title="Device & Login Activity" desc="Active sessions for your account.">
        <ul className="space-y-2">
          {devices.map((d) => (
            <li
              key={d.d}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40">
                <Smartphone className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{d.d}</p>
                <p className="text-[11px] text-muted-foreground">
                  {d.loc} · {d.time}
                </p>
              </div>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                This device
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

function LearningPrefsWidget({ selected }: { selected: string[] }) {
  const subjects = [
    "Financial Accounting",
    "Audit",
    "Taxation",
    "Business Law",
    "Cost Accounting",
    "Management Accounting",
    "Corporate Finance",
  ];
  const toggle = (s: string) => {
    const next = selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s];
    setPrefs({ subjects: next });
  };
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-[var(--neon-blue)]" />
        <h3 className="text-sm font-semibold">Learning Preferences</h3>
      </div>
      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Preferred subjects
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {subjects.map((s) => {
            const on = selected.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggle(s)}
                className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  on
                    ? "bg-cta-gradient text-white shadow-glow"
                    : "border border-border/60 bg-background/40 text-foreground/70"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/60 bg-background/40 p-2.5">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Target className="h-3 w-3" /> Selected
          </p>
          <p className="mt-1 text-xs font-semibold">{selected.length} subjects</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/40 p-2.5">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Globe className="h-3 w-3" /> Language
          </p>
          <p className="mt-1 text-xs font-semibold">English (IN)</p>
        </div>
      </div>
    </div>
  );
}

function AchievementsWidget() {
  const items = [
    {
      i: Trophy,
      t: "Top 5%",
      s: "Class rank",
      c: "from-amber-500/30 to-yellow-500/10 text-amber-300",
    },
    {
      i: Flame,
      t: "Streak",
      s: "Keep going!",
      c: "from-orange-500/30 to-rose-500/10 text-orange-300",
    },
    {
      i: Medal,
      t: "Milestones",
      s: "Unlocking",
      c: "from-fuchsia-500/30 to-purple-500/10 text-fuchsia-300",
    },
    { i: Star, t: "Quiz Master", s: "High acc.", c: "from-sky-500/30 to-blue-500/10 text-sky-300" },
  ];
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-300" />
        <h3 className="text-sm font-semibold">Achievements</h3>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {items.map((b) => (
          <div
            key={b.t}
            className={`rounded-xl border border-white/10 bg-gradient-to-br ${b.c} p-3`}
          >
            <b.i className="h-5 w-5" />
            <p className="mt-1.5 text-xs font-semibold text-foreground">{b.t}</p>
            <p className="text-[10px] text-muted-foreground">{b.s}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentActivityWidget() {
  const acts = [
    { i: Trophy, t: "Mock test attempt", time: "—" },
    { i: Download, t: "Downloaded notes", time: "—" },
    { i: PlayCircle, t: "Watched class", time: "—" },
    { i: Layers, t: "Reviewed flash cards", time: "—" },
  ];
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-[var(--neon-purple)]" />
        <h3 className="text-sm font-semibold">Recent Activity</h3>
      </div>
      <ul className="mt-3 space-y-2">
        {acts.map((a) => (
          <li
            key={a.t}
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-2.5"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/40">
              <a.i className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{a.t}</p>
              <p className="text-[10px] text-muted-foreground">{a.time}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DangerZone({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="glass relative overflow-hidden rounded-3xl border border-destructive/30 p-5 shadow-card-soft">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-red-500/15 blur-3xl" />
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="font-display text-lg font-semibold text-destructive">Danger Zone</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        These actions are permanent. Proceed with caution.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <DangerCard
          i={LogOut}
          title="Sign out"
          desc="End this session and return to login."
          cta="Sign out"
          onClick={onLogout}
        />
        <DangerCard
          i={RotateCcw}
          title="Reset preferences"
          desc="Restore appearance and notification defaults."
          cta="Reset"
          onClick={() => {
            void (async () => {
              if (
                await confirmDialog({
                  title: "Reset all local preferences?",
                  variant: "destructive",
                  confirmLabel: "Reset",
                })
              )
                setPrefs(DEFAULT_PREFS);
            })();
          }}
        />
        <DangerCard
          i={Trash2}
          title="Delete account"
          desc="Contact support to permanently remove your account."
          cta="Contact support"
          destructive
          onClick={() => {
            window.location.href = "mailto:support@caaspirebd.xyz?subject=Delete%20my%20account";
          }}
        />
      </div>
    </div>
  );
}

function DangerCard({
  i: Icon,
  title,
  desc,
  cta,
  destructive,
  onClick,
}: {
  i: typeof Trash2;
  title: string;
  desc: string;
  cta: string;
  destructive?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/40 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="text-[11px] text-muted-foreground">{desc}</p>
      <button
        onClick={onClick}
        className={`mt-auto rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
          destructive
            ? "bg-destructive text-destructive-foreground hover:opacity-90"
            : "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
        }`}
      >
        {cta}
      </button>
    </div>
  );
}
