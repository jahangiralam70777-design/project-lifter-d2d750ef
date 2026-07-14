import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, UserPlus, Save, AlertTriangle, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuthControls } from "@/hooks/use-auth-controls";
import {
  updateAuthControls,
  type AuthControls,
  type AuthControlsPatch,
} from "@/lib/auth-controls.functions";

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

type Kind = "login" | "signup";

function ControlCard({
  kind,
  data,
  onSave,
  saving,
}: {
  kind: Kind;
  data: AuthControls;
  onSave: (patch: AuthControlsPatch) => void;
  saving: boolean;
}) {
  const enabledKey = `${kind}_enabled` as const;
  const titleKey = `${kind}_message_title` as const;
  const subtitleKey = `${kind}_message_subtitle` as const;
  const descKey = `${kind}_message_description` as const;
  const footerKey = `${kind}_message_footer` as const;
  const autoKey = `${kind}_auto_enable_at` as const;

  const [enabled, setEnabled] = useState(data[enabledKey]);
  const [title, setTitle] = useState(data[titleKey]);
  const [subtitle, setSubtitle] = useState(data[subtitleKey]);
  const [desc, setDesc] = useState(data[descKey]);
  const [footer, setFooter] = useState(data[footerKey]);
  const [autoOn, setAutoOn] = useState(!!data[autoKey]);
  const [autoAt, setAutoAt] = useState(toLocalInputValue(data[autoKey]));

  // Sync local form when realtime row changes.
  useEffect(() => {
    setEnabled(data[enabledKey]);
    setTitle(data[titleKey]);
    setSubtitle(data[subtitleKey]);
    setDesc(data[descKey]);
    setFooter(data[footerKey]);
    setAutoOn(!!data[autoKey]);
    setAutoAt(toLocalInputValue(data[autoKey]));
  }, [data, enabledKey, titleKey, subtitleKey, descKey, footerKey, autoKey]);

  const Icon = kind === "login" ? Lock : UserPlus;
  const heading = kind === "login" ? "Student Login Control" : "Student Signup Control";
  const accent = kind === "login" ? "#3b82f6" : "#a855f7";

  const handleToggle = () => {
    // Do NOT optimistically flip local state — wait for the server to confirm.
    // If the RPC fails (missing migration, RLS, etc.) the UI was previously
    // showing the new value while the DB kept the old one, so a refresh
    // appeared to "revert" the change.
    const next = !enabled;
    onSave({ [enabledKey]: next } as AuthControlsPatch);
  };

  const handleSaveMessages = () => {
    onSave({
      [titleKey]: title,
      [subtitleKey]: subtitle,
      [descKey]: desc,
      [footerKey]: footer,
      [autoKey]: autoOn ? fromLocalInputValue(autoAt) : null,
    } as AuthControlsPatch);
  };

  return (
    <section className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl"
        style={{ background: `${accent}33` }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-background/40"
            style={{ boxShadow: `0 0 16px ${accent}55` }}
          >
            <Icon className="h-5 w-5" style={{ color: accent }} />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold tracking-tight">{heading}</h3>
            <p className="text-xs text-muted-foreground">
              {kind === "login"
                ? "Block or allow student sign-ins. Admin and super-admin logins are never affected."
                : "Block or allow new student registrations. Admin account management is unaffected."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={
              enabled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-400"
            }
          >
            ● {enabled ? "Enabled" : "Disabled"}
          </Badge>
          <Button
            size="sm"
            variant={enabled ? "destructive" : "default"}
            onClick={handleToggle}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            {enabled ? `Disable Student ${kind === "login" ? "Login" : "Signup"}` : `Enable Student ${kind === "login" ? "Login" : "Signup"}`}
          </Button>
        </div>
      </div>

      <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Subtitle">
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={160} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              maxLength={1000}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Footer note">
            <Input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={200} />
          </Field>
        </div>
      </div>

      <div className="relative mt-5 rounded-2xl border border-white/10 bg-background/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Auto re-enable</p>
              <p className="text-[11px] text-muted-foreground">
                Automatically turn {kind} back on at the scheduled time.
              </p>
            </div>
          </div>
          <Switch checked={autoOn} onCheckedChange={setAutoOn} />
        </div>
        {autoOn && (
          <div className="mt-3">
            <Field label="Reactivate at (local time)">
              <Input
                type="datetime-local"
                value={autoAt}
                onChange={(e) => setAutoAt(e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>

      <div className="relative mt-4 flex justify-end">
        <Button size="sm" onClick={handleSaveMessages} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          Save changes
        </Button>
      </div>
    </section>
  );
}

export function AuthControlsSection() {
  const qc = useQueryClient();
  const query = useAuthControls();
  const updateFn = useServerFn(updateAuthControls);

  const mutation = useMutation({
    mutationFn: (patch: AuthControlsPatch) => updateFn({ data: patch }),
    onSuccess: (row) => {
      console.info("[auth-controls] updated row", row);
      qc.setQueryData(["auth-controls"], row);
      // Force a refetch so any RLS/RPC return-shape mismatch is caught
      // and the UI always reflects what the database actually persisted.
      qc.invalidateQueries({ queryKey: ["auth-controls"] });
      toast.success("Authentication controls updated");
    },
    onError: (err: Error) => {
      const msg = err?.message ?? "Update failed";
      console.error("[auth-controls] update failed", err);
      if (/forbidden|admin role/i.test(msg)) {
        toast.error("Only administrators can change authentication controls.");
      } else if (/function .*update_auth_access_controls.* does not exist/i.test(msg)) {
        toast.error(
          "Database is missing update_auth_access_controls(). Apply supabase/manual_apply/20260613_complete_auth_controls_recovery.sql in the SQL editor.",
        );
      } else {
        toast.error(msg);
      }
      // Make sure the UI re-syncs to the real DB state after a failure.
      qc.invalidateQueries({ queryKey: ["auth-controls"] });
    },
  });

  if (query.isLoading || !query.data) {
    return (
      <section className="glass shadow-card-soft rounded-3xl p-5 text-sm text-muted-foreground">
        Loading authentication controls…
      </section>
    );
  }

  if (query.error) {
    return (
      <section className="glass shadow-card-soft flex items-center gap-2 rounded-3xl p-5 text-sm text-amber-400">
        <AlertTriangle className="h-4 w-4" /> Could not load authentication controls. Defaults
        apply (login & signup remain enabled).
      </section>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ControlCard
        kind="login"
        data={query.data}
        onSave={(p) => mutation.mutate(p)}
        saving={mutation.isPending}
      />
      <ControlCard
        kind="signup"
        data={query.data}
        onSave={(p) => mutation.mutate(p)}
        saving={mutation.isPending}
      />
    </div>
  );
}