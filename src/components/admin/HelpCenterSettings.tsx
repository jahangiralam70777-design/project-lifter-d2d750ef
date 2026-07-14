import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  adminListSettings,
  adminUpdateSettingDraft,
  adminPublishSetting,
} from "@/lib/site-management.functions";
import { HELP_CENTER_DEFAULTS, parseYouTubeId, type HelpCenterSettings } from "@/lib/help-center";

const SETTING_KEY = "help_center";

function coerce(v: unknown): HelpCenterSettings {
  const o = (v ?? {}) as Partial<HelpCenterSettings>;
  const m = (o.mobile ?? {}) as Partial<HelpCenterSettings["mobile"]>;
  const p = (o.pc ?? {}) as Partial<HelpCenterSettings["pc"]>;
  const w = (o.whatsapp ?? {}) as Partial<HelpCenterSettings["whatsapp"]>;
  const iconAllowed = ["book", "graduation", "help", "sparkles"] as const;
  const icon = (iconAllowed as readonly string[]).includes(o.icon as string)
    ? (o.icon as HelpCenterSettings["icon"])
    : HELP_CENTER_DEFAULTS.icon;
  const modeOf = (x: unknown): "inside" | "external" => (x === "external" ? "external" : "inside");
  return {
    enabled: Boolean(o.enabled),
    title: typeof o.title === "string" ? o.title : HELP_CENTER_DEFAULTS.title,
    subtitle: typeof o.subtitle === "string" ? o.subtitle : HELP_CENTER_DEFAULTS.subtitle,
    buttonText: typeof o.buttonText === "string" ? o.buttonText : HELP_CENTER_DEFAULTS.buttonText,
    buttonColor:
      typeof o.buttonColor === "string" ? o.buttonColor : HELP_CENTER_DEFAULTS.buttonColor,
    themeColor: typeof o.themeColor === "string" ? o.themeColor : HELP_CENTER_DEFAULTS.themeColor,
    icon,
    mobile: {
      enabled: m.enabled !== false,
      label: typeof m.label === "string" ? m.label : HELP_CENTER_DEFAULTS.mobile.label,
      url: typeof m.url === "string" ? m.url : "",
      openMode: modeOf(m.openMode),
    },
    pc: {
      enabled: p.enabled !== false,
      label: typeof p.label === "string" ? p.label : HELP_CENTER_DEFAULTS.pc.label,
      url: typeof p.url === "string" ? p.url : "",
      openMode: modeOf(p.openMode),
    },
    whatsapp: {
      enabled: w.enabled !== false,
      label: typeof w.label === "string" ? w.label : HELP_CENTER_DEFAULTS.whatsapp.label,
      url: typeof w.url === "string" ? w.url : "",
    },
  };
}

function isSafeWhatsAppUrl(input: string): boolean {
  if (!input) return false;
  try {
    const u = new URL(input.trim());
    if (u.protocol !== "https:") return false;
    const host = u.hostname.replace(/^www\./, "");
    return (
      host === "chat.whatsapp.com" ||
      host === "wa.me" ||
      host === "whatsapp.com" ||
      host.endsWith(".whatsapp.com")
    );
  } catch {
    return false;
  }
}

export function HelpCenterSettingsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(adminListSettings);
  const updateDraft = useServerFn(adminUpdateSettingDraft);
  const publish = useServerFn(adminPublishSetting);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings", SETTING_KEY],
    queryFn: async () => {
      const res = await list();
      const row = (res.settings ?? []).find((r: { key: string }) => r.key === SETTING_KEY);
      return coerce(row?.draft_value ?? row?.published_value ?? {});
    },
  });

  const [form, setForm] = useState<HelpCenterSettings>(HELP_CENTER_DEFAULTS);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (value: HelpCenterSettings) => {
      await updateDraft({ data: { key: SETTING_KEY, draftValue: value } });
      await publish({ data: { key: SETTING_KEY } });
      return value;
    },
    onSuccess: () => {
      toast.success("Learning Center settings saved");
      qc.invalidateQueries({ queryKey: ["admin", "settings", SETTING_KEY] });
      qc.invalidateQueries({ queryKey: ["site-settings"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const mobileUrlOk = !form.mobile.url || !!parseYouTubeId(form.mobile.url);
  const pcUrlOk = !form.pc.url || !!parseYouTubeId(form.pc.url);
  const waUrlOk = !form.whatsapp.url || isSafeWhatsAppUrl(form.whatsapp.url);
  const canSave = mobileUrlOk && pcUrlOk && waUrlOk;

  return (
    <section className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl"
        style={{ background: `${form.themeColor}33` }}
      />
      <div className="relative flex items-start gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-background/40"
          style={{ boxShadow: `0 0 16px ${form.themeColor}55` }}
        >
          <GraduationCap className="h-5 w-5" style={{ color: form.themeColor }} />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold">Learning Center (Help Widget)</h2>
          <p className="text-xs text-muted-foreground">
            Floating help button on the homepage with mobile/PC tutorials and a WhatsApp group link.
            Saves apply within seconds.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="relative mt-5 space-y-5">
          {/* Master toggle */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/30 p-3">
            <div>
              <div className="text-sm font-semibold">Enable Learning Center widget</div>
              <p className="text-xs text-muted-foreground">
                When OFF, the floating button is hidden everywhere.
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>

          {/* General */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Widget title">
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={60}
              />
            </Field>
            <Field label="Widget subtitle">
              <Input
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                maxLength={120}
              />
            </Field>
            <Field label="Button text">
              <Input
                value={form.buttonText}
                onChange={(e) => setForm((f) => ({ ...f, buttonText: e.target.value }))}
                maxLength={40}
              />
            </Field>
            <Field label="Icon">
              <select
                value={form.icon}
                onChange={(e) =>
                  setForm((f) => ({ ...f, icon: e.target.value as HelpCenterSettings["icon"] }))
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="graduation">Graduation cap</option>
                <option value="book">Book</option>
                <option value="help">Help circle</option>
                <option value="sparkles">Sparkles</option>
              </select>
            </Field>
            <Field label="Floating button color">
              <ColorInput
                value={form.buttonColor}
                onChange={(v) => setForm((f) => ({ ...f, buttonColor: v }))}
              />
            </Field>
            <Field label="Popup theme color">
              <ColorInput
                value={form.themeColor}
                onChange={(v) => setForm((f) => ({ ...f, themeColor: v }))}
              />
            </Field>
          </div>

          {/* Mobile tutorial */}
          <OptionBlock
            heading="Mobile Tutorial"
            enabled={form.mobile.enabled}
            onEnabledChange={(v) => setForm((f) => ({ ...f, mobile: { ...f.mobile, enabled: v } }))}
          >
            <Field label="Button label">
              <Input
                value={form.mobile.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, mobile: { ...f.mobile, label: e.target.value } }))
                }
                maxLength={40}
              />
            </Field>
            <Field label="YouTube link">
              <Input
                value={form.mobile.url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, mobile: { ...f.mobile, url: e.target.value } }))
                }
                placeholder="https://youtu.be/..."
              />
              {!mobileUrlOk && (
                <span className="text-[11px] text-amber-500">Enter a valid YouTube URL.</span>
              )}
            </Field>
            <OpenModeRadio
              value={form.mobile.openMode}
              onChange={(v) => setForm((f) => ({ ...f, mobile: { ...f.mobile, openMode: v } }))}
            />
          </OptionBlock>

          {/* PC tutorial */}
          <OptionBlock
            heading="PC / Laptop Tutorial"
            enabled={form.pc.enabled}
            onEnabledChange={(v) => setForm((f) => ({ ...f, pc: { ...f.pc, enabled: v } }))}
          >
            <Field label="Button label">
              <Input
                value={form.pc.label}
                onChange={(e) => setForm((f) => ({ ...f, pc: { ...f.pc, label: e.target.value } }))}
                maxLength={40}
              />
            </Field>
            <Field label="YouTube link">
              <Input
                value={form.pc.url}
                onChange={(e) => setForm((f) => ({ ...f, pc: { ...f.pc, url: e.target.value } }))}
                placeholder="https://youtu.be/..."
              />
              {!pcUrlOk && (
                <span className="text-[11px] text-amber-500">Enter a valid YouTube URL.</span>
              )}
            </Field>
            <OpenModeRadio
              value={form.pc.openMode}
              onChange={(v) => setForm((f) => ({ ...f, pc: { ...f.pc, openMode: v } }))}
            />
          </OptionBlock>

          {/* WhatsApp */}
          <OptionBlock
            heading="WhatsApp Group"
            enabled={form.whatsapp.enabled}
            onEnabledChange={(v) =>
              setForm((f) => ({ ...f, whatsapp: { ...f.whatsapp, enabled: v } }))
            }
          >
            <Field label="Button label">
              <Input
                value={form.whatsapp.label}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    whatsapp: { ...f.whatsapp, label: e.target.value },
                  }))
                }
                maxLength={40}
              />
            </Field>
            <Field label="Group invite link">
              <Input
                value={form.whatsapp.url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, whatsapp: { ...f.whatsapp, url: e.target.value } }))
                }
                placeholder="https://chat.whatsapp.com/..."
              />
              {!waUrlOk && (
                <span className="text-[11px] text-amber-500">
                  Enter a valid WhatsApp link (chat.whatsapp.com or wa.me).
                </span>
              )}
            </Field>
          </OptionBlock>

          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate(form)}
              disabled={save.isPending || !canSave}
              className="gap-2"
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save &amp; Publish
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#2563EB"}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background"
        aria-label="Pick color"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={9}
        className="flex-1"
      />
    </div>
  );
}

function OptionBlock({
  heading,
  enabled,
  onEnabledChange,
  children,
}: {
  heading: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{heading}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Show</span>
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function OpenModeRadio({
  value,
  onChange,
}: {
  value: "inside" | "external";
  onChange: (v: "inside" | "external") => void;
}) {
  return (
    <div className="sm:col-span-2">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Open mode
      </span>
      <div className="flex flex-wrap gap-2">
        {(
          [
            { v: "inside", label: "Open inside website" },
            { v: "external", label: "Open in YouTube" },
          ] as const
        ).map((opt) => (
          <label
            key={opt.v}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              value === opt.v
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background/40 text-muted-foreground"
            }`}
          >
            <input
              type="radio"
              className="h-3.5 w-3.5"
              checked={value === opt.v}
              onChange={() => onChange(opt.v)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
