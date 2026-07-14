import { getRoleDisplayName } from "@/lib/role-display";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Save,
  Sun,
  Moon,
  Sparkles,
  CircleDot,
  Settings as SettingsIcon,
  Palette,
  ShieldCheck,
  Eye,
  Bell,
  User as UserIcon,
  Camera,
  Lock,
  Loader2,
  Globe,
  Mail,
  Phone,
  Image as ImageIcon,
  ExternalLink,
  KeyRound,
  Smartphone,
  Check,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { updatePassword } from "@/lib/auth-client";
import { useModuleVisibility } from "@/hooks/use-module-visibility";
import { adminSetModuleHidden } from "@/lib/module-visibility.functions";
import { useSetting } from "@/hooks/use-site-content";
import { usePrefs, setPrefs, DEFAULT_PREFS } from "@/lib/profile-prefs";
import { WhatsAppPopupSettingsPanel } from "@/components/admin/WhatsAppPopupSettings";
import { HelpCenterSettingsPanel } from "@/components/admin/HelpCenterSettings";

import { LiveChatWidgetSettingsPanel } from "@/components/admin/LiveChatWidgetSettings";
import { NoticeBannerSettingsPanel } from "@/components/admin/NoticeBannerSettings";
import { AuthControlsSection } from "@/components/admin/AuthControlsSection";

/* ============================================================
   Panel chrome
   ============================================================ */
function Panel({
  icon: Icon,
  color,
  title,
  subtitle,
  children,
  badge,
  action,
}: {
  icon: any;
  color: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  badge?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl"
        style={{ background: `${color}33` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-background/40"
            style={{ boxShadow: `0 0 16px ${color}55` }}
          >
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <Badge variant="outline" className="border-white/15 text-[10px]">
              {badge}
            </Badge>
          )}
          {action}
        </div>
      </div>
      <div className="relative mt-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {hint && <span className="text-[10px] text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

/* ============================================================
   Topbar — real user, working theme toggle
   ============================================================ */
function Topbar() {
  const user = useAppStore((s) => s.user);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const initials = (user?.name ?? "A")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <header className="glass shadow-card-soft flex items-center gap-3 rounded-2xl p-3">
      <div className="hidden items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-400 md:flex">
        <CircleDot className="h-3 w-3 animate-pulse" /> Platform · live
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="rounded-xl"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-background/40 p-1 pl-3">
          <div className="text-right leading-tight">
            <p className="text-xs font-semibold">{user?.name ?? "Admin"}</p>
            <p className="text-[10px] text-muted-foreground">{user?.role ? getRoleDisplayName(user.role) : "—"}</p>
          </div>
          <div className="bg-cta-gradient flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white shadow-glow">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}

function PageHeader() {
  return (
    <section className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-[var(--neon-purple)]/25 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Badge className="bg-cta-gradient border-0 text-white shadow-glow">
            <Sparkles className="mr-1 h-3 w-3" /> Control Core
          </Badge>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Platform <span className="text-gradient">Settings</span>
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Manage your admin profile, security, appearance, notifications and student-facing
            modules.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   1. Profile — real data
   ============================================================ */
function ProfilePanel() {
  const user = useAppStore((s) => s.user);
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);

  const q = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user?.id,
  });

  const [display, setDisplay] = useState("");
  const [bio, setBio] = useState("");
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (q.data) {
      setDisplay(q.data.display_name ?? "");
      setBio(q.data.bio ?? "");
      setDirty(false);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (display.trim().length < 1) throw new Error("Name required");
      await updateFn({ data: { display_name: display.trim(), bio: bio.trim() || null } });
    },
    onSuccess: () => {
      toast.success("Profile updated");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    if (file.size > 4 * 1024 * 1024) return toast.error("Max 4 MB");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      await updateFn({ data: { avatar_url: pub.publicUrl } });
      await qc.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Avatar updated");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const avatarUrl = q.data?.avatar_url ?? undefined;
  const initials = (display || user?.name || "A")
    .split(/\s+/)
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Panel
      icon={UserIcon}
      color="var(--neon-purple)"
      title="Admin Profile"
      subtitle="Your name, photo and bio shown across the panel"
      action={
        <Button
          size="sm"
          className="bg-cta-gradient text-white shadow-glow disabled:opacity-50"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          Save
        </Button>
      }
    >
      {q.isLoading ? (
        <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[140px_1fr]">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] opacity-70 blur-md" />
              <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-background/60 text-2xl font-bold">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
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
                  accept="image/*"
                  className="hidden"
                  onChange={onPickAvatar}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">PNG · JPG · max 4 MB</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Display name">
              <Input
                value={display}
                onChange={(e) => {
                  setDisplay(e.target.value);
                  setDirty(true);
                }}
                className="h-10 rounded-xl border-white/10 bg-background/60"
              />
            </Field>
            <Field label="Email" hint="read-only">
              <Input
                value={user?.email ?? ""}
                disabled
                className="h-10 rounded-xl border-white/10 bg-background/40"
              />
            </Field>
            <Field label="Bio">
              <Textarea
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value);
                  setDirty(true);
                }}
                rows={3}
                maxLength={500}
                className="rounded-xl border-white/10 bg-background/60"
              />
            </Field>
            <Field label="Role" hint="managed by system">
              <Input
                value={user?.role ? getRoleDisplayName(user.role) : ""}
                disabled
                className="h-10 rounded-xl border-white/10 bg-background/40"
              />
            </Field>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ============================================================
   2. Security — change password
   ============================================================ */
function SecurityPanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: async () => {
      if (next.length < 8) throw new Error("Password must be at least 8 characters");
      if (next !== confirm) throw new Error("Passwords do not match");
      await updatePassword(next);
    },
    onSuccess: () => {
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update password"),
  });

  return (
    <Panel
      icon={ShieldCheck}
      color="#10b981"
      title="Security"
      subtitle="Change your account password"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Current password" hint="optional">
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="h-10 rounded-xl border-white/10 bg-background/60"
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password" hint="min 8 chars">
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="h-10 rounded-xl border-white/10 bg-background/60"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-10 rounded-xl border-white/10 bg-background/60"
            autoComplete="new-password"
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          onClick={() => change.mutate()}
          disabled={change.isPending || !next || !confirm}
          className="bg-cta-gradient text-white shadow-glow"
        >
          {change.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="mr-2 h-4 w-4" />
          )}
          Update password
        </Button>
      </div>
    </Panel>
  );
}

/* ============================================================
   3. Appearance — dark/light + accent + font size
   ============================================================ */
function AppearancePanel() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const prefs = usePrefs();
  const accents = [
    "#a855f7",
    "#7c3aed",
    "#3b82f6",
    "#06b6d4",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#ec4899",
  ];

  return (
    <Panel
      icon={Palette}
      color="var(--neon-blue)"
      title="Appearance"
      subtitle="Theme, accent color and reading size"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Theme">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-background/40 p-1 text-xs">
            <button
              onClick={() => theme === "dark" && toggleTheme()}
              className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${theme === "light" ? "bg-cta-gradient text-white shadow-glow" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Sun className="mr-1 inline h-3.5 w-3.5" /> Light
            </button>
            <button
              onClick={() => theme === "light" && toggleTheme()}
              className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${theme === "dark" ? "bg-cta-gradient text-white shadow-glow" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Moon className="mr-1 inline h-3.5 w-3.5" /> Dark
            </button>
          </div>
        </Field>

        <Field label="Reading size" hint={`${prefs.fontSize}px`}>
          <input
            type="range"
            min={13}
            max={20}
            value={prefs.fontSize}
            onChange={(e) => setPrefs({ fontSize: Number(e.target.value) })}
            className="w-full accent-[var(--neon-purple)]"
          />
        </Field>

        <div className="md:col-span-2">
          <Field label="Accent color">
            <div className="flex flex-wrap items-center gap-2">
              {accents.map((c) => (
                <button
                  key={c}
                  onClick={() => setPrefs({ accent: c })}
                  className={`h-8 w-8 rounded-xl border-2 transition-transform hover:scale-110 ${prefs.accent === c ? "border-white" : "border-white/10"}`}
                  style={{
                    background: c,
                    boxShadow: prefs.accent === c ? `0 0 14px ${c}` : undefined,
                  }}
                  aria-label={`Accent ${c}`}
                />
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="ml-2 text-xs"
                onClick={() =>
                  setPrefs({ accent: DEFAULT_PREFS.accent, fontSize: DEFAULT_PREFS.fontSize })
                }
              >
                <RotateCcw className="mr-1 h-3 w-3" /> Reset
              </Button>
            </div>
          </Field>
        </div>
      </div>
    </Panel>
  );
}

/* ============================================================
   4. Notification preferences (local)
   ============================================================ */
function NotificationPrefsPanel() {
  const prefs = usePrefs();
  const rows: { key: keyof typeof prefs.notif; label: string; hint: string }[] = [
    { key: "email", label: "Email notifications", hint: "System & transactional emails" },
    { key: "push", label: "Push notifications", hint: "Browser & mobile push" },
    { key: "mock", label: "Mock test alerts", hint: "New mock tests & results" },
    { key: "quiz", label: "Quiz reminders", hint: "Daily quiz nudges" },
    { key: "class", label: "Class & content updates", hint: "New videos and notes" },
  ];
  return (
    <Panel
      icon={Bell}
      color="#06b6d4"
      title="Notification Preferences"
      subtitle="Control what you receive"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-background/30 px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-[10px] text-muted-foreground">{r.hint}</p>
            </div>
            <Switch
              checked={prefs.notif[r.key]}
              onCheckedChange={(on) => {
                setPrefs({ notif: { ...prefs.notif, [r.key]: on } });
                toast.success(`${r.label} ${on ? "on" : "off"}`);
              }}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ============================================================
   5. Module visibility — already wired
   ============================================================ */
function ModulesPanel() {
  const { rows } = useModuleVisibility();
  const qc = useQueryClient();
  const setFn = useServerFn(adminSetModuleHidden);
  type Row = (typeof rows)[number];
  type Vars = { key: Row["key"]; hidden: boolean };
  const mut = useMutation<unknown, Error, Vars, { prev?: Row[] }>({
    mutationFn: (v) => setFn({ data: { key: v.key, hidden: v.hidden } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["module-visibility"] });
      const prev = qc.getQueryData<Row[]>(["module-visibility"]);
      if (prev) {
        qc.setQueryData<Row[]>(
          ["module-visibility"],
          prev.map((r) => (r.key === v.key ? { ...r, hidden: v.hidden } : r)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["module-visibility"], ctx.prev);
      toast.error("Could not update module");
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.hidden ? "Hidden" : "Visible"} for students`);
      qc.invalidateQueries({ queryKey: ["module-visibility"] });
    },
  });
  const liveCount = rows.filter((r) => !r.hidden).length;
  return (
    <Panel
      icon={Eye}
      color="#a78bfa"
      title="Module Visibility"
      subtitle="Show or hide student-facing modules globally"
      badge={`${liveCount}/${rows.length} live`}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((m) => (
          <div
            key={m.key}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-background/30 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${!m.hidden ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_#10b981]" : "bg-zinc-500"}`}
              />
              <p className="text-sm font-medium">{m.label}</p>
            </div>
            <Switch
              checked={!m.hidden}
              disabled={mut.isPending}
              onCheckedChange={(on) => mut.mutate({ key: m.key, hidden: !on })}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ============================================================
   6. Branding & contact — read-only summary + link to Site Management
   ============================================================ */
function BrandingSummaryPanel() {
  const navbar = useSetting<{ brand_primary?: string; tagline?: string }>("navbar", {});
  const contact = useSetting<{ email?: string; phone?: string }>("contact", {});
  const platformName = navbar?.brand_primary ?? "CA Aspire BD";
  const tagline = navbar?.tagline ?? "";
  const email = contact?.email ?? "—";
  const phone = contact?.phone ?? "—";

  return (
    <Panel
      icon={SettingsIcon}
      color="#f59e0b"
      title="Branding & Contact"
      subtitle="Logo, platform name, contact details and theme"
      action={
        <Button asChild size="sm" variant="outline" className="border-white/15">
          <Link to="/admin/site">
            Open Site Manager <ExternalLink className="ml-1.5 h-3 w-3" />
          </Link>
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-background/30 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <ImageIcon className="h-3 w-3" /> Platform name
          </div>
          <p className="mt-1 text-sm font-semibold">{platformName}</p>
          {tagline && <p className="text-[11px] text-muted-foreground">{tagline}</p>}
        </div>
        <div className="rounded-xl border border-white/10 bg-background/30 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Mail className="h-3 w-3" /> Support email
          </div>
          <p className="mt-1 text-sm font-mono">{email}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-background/30 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Phone className="h-3 w-3" /> Contact number
          </div>
          <p className="mt-1 text-sm font-mono">{phone}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-background/30 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Globe className="h-3 w-3" /> Theme & logo
          </div>
          <p className="mt-1 text-sm">Manage in Site Manager</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Public-facing branding (logo, colors, tagline, contact info) is managed visually in the Site
        Manager and applied across the homepage and student dashboard.
      </p>
    </Panel>
  );
}

/* ============================================================
   Root
   ============================================================ */
export function AdminSettingsFlow() {
  return (
    <div className="space-y-4">
      <Topbar />
      <PageHeader />
      <ProfilePanel />
      <SecurityPanel />
      <AuthControlsSection />
      <NoticeBannerSettingsPanel />
      <AppearancePanel />
      <NotificationPrefsPanel />
      <ModulesPanel />
      <BrandingSummaryPanel />
      <WhatsAppPopupSettingsPanel />
      <HelpCenterSettingsPanel />
      <LiveChatWidgetSettingsPanel />
    </div>
  );
}


// retained imports for tree-shaking safety
void Smartphone;
void Lock;
void Check;
void AlertTriangle;
