import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageCircle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  adminListSettings,
  adminUpdateSettingDraft,
  adminPublishSetting,
} from "@/lib/site-management.functions";
import {
  WHATSAPP_DEFAULTS,
  type WhatsAppPopupSettings as WAPopupValue,
} from "@/components/landing/WhatsAppPopup";

const SETTING_KEY = "whatsapp_popup";

function coerce(v: unknown): WAPopupValue {
  const o = (v ?? {}) as Partial<WAPopupValue>;
  return {
    enabled: Boolean(o.enabled),
    number: typeof o.number === "string" ? o.number : "",
    message:
      typeof o.message === "string" && o.message.length > 0 ? o.message : WHATSAPP_DEFAULTS.message,
    delay_seconds: Number.isFinite(o.delay_seconds as number)
      ? Number(o.delay_seconds)
      : WHATSAPP_DEFAULTS.delay_seconds,
  };
}

export function WhatsAppPopupSettingsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(adminListSettings);
  const updateDraft = useServerFn(adminUpdateSettingDraft);
  const publish = useServerFn(adminPublishSetting);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings", "whatsapp_popup"],
    queryFn: async () => {
      const res = await list();
      const row = (res.settings ?? []).find((r: { key: string }) => r.key === SETTING_KEY);
      // Prefer draft so admin sees in-progress edits; fall back to published.
      return coerce(row?.draft_value ?? row?.published_value ?? {});
    },
  });

  const [form, setForm] = useState<WAPopupValue>(WHATSAPP_DEFAULTS);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (value: WAPopupValue) => {
      const normalized: WAPopupValue = {
        enabled: !!value.enabled,
        number: value.number.trim(),
        message: value.message.trim() || WHATSAPP_DEFAULTS.message,
        delay_seconds: Math.max(0, Math.min(60, Math.round(Number(value.delay_seconds) || 0))),
      };
      await updateDraft({ data: { key: SETTING_KEY, draftValue: normalized } });
      await publish({ data: { key: SETTING_KEY } });
      return normalized;
    },
    onSuccess: () => {
      toast.success("WhatsApp popup settings saved");
      qc.invalidateQueries({ queryKey: ["admin", "settings", "whatsapp_popup"] });
      qc.invalidateQueries({ queryKey: ["site-settings"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const numberOk = /^\+?\d{6,16}$/.test(form.number.trim());

  return (
    <section className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl"
        style={{ background: "#25D36633" }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-background/40"
            style={{ boxShadow: "0 0 16px #25D36655" }}
          >
            <MessageCircle className="h-5 w-5" style={{ color: "#25D366" }} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">WhatsApp Support Popup Settings</h2>
            <p className="text-xs text-muted-foreground">
              Show a centered WhatsApp support popup on the homepage. Changes apply within seconds.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="relative mt-5 space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/30 p-3">
            <div>
              <div className="text-sm font-semibold">Enable WhatsApp Popup</div>
              <p className="text-xs text-muted-foreground">When OFF, the popup never shows.</p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              WhatsApp Support Number
            </span>
            <Input
              value={form.number}
              onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
              placeholder="+8801XXXXXXXXX"
              inputMode="tel"
              maxLength={20}
            />
            {!numberOk && form.number.length > 0 && (
              <span className="text-[11px] text-amber-500">
                Enter international format, digits only (6–16 digits, optional leading +).
              </span>
            )}
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Default WhatsApp Message
            </span>
            <Textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={3}
              maxLength={500}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Popup Delay (seconds)
            </span>
            <Input
              type="number"
              min={0}
              max={60}
              value={form.delay_seconds}
              onChange={(e) => setForm((f) => ({ ...f, delay_seconds: Number(e.target.value) }))}
            />
          </label>

          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate(form)}
              disabled={save.isPending || (form.enabled && !numberOk)}
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
