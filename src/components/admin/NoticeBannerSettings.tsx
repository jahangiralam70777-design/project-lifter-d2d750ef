import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Megaphone, Loader2, Save, Eye } from "lucide-react";
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
  NoticeBannerPreview,
  NOTICE_BANNER_DEFAULTS,
  coerceNoticeBanner,
  type NoticeBannerValue,
} from "@/components/site/NoticeBanner";

const SETTING_KEY = "notice_banner";

const TYPE_OPTIONS: Array<{ value: NoticeBannerValue["type"]; label: string }> = [
  { value: "info", label: "Information" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "important", label: "Important" },
  { value: "custom", label: "Custom" },
];

const SPEED_OPTIONS: Array<{ value: NoticeBannerValue["speed"]; label: string }> = [
  { value: "slow", label: "Slow" },
  { value: "medium", label: "Medium" },
  { value: "fast", label: "Fast" },
];

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-white/10 bg-background/30 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              active
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-white/5"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function NoticeBannerSettingsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(adminListSettings);
  const updateDraft = useServerFn(adminUpdateSettingDraft);
  const publish = useServerFn(adminPublishSetting);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings", SETTING_KEY],
    queryFn: async () => {
      const res = await list();
      const row = (res.settings ?? []).find((r: { key: string }) => r.key === SETTING_KEY);
      return coerceNoticeBanner(row?.draft_value ?? row?.published_value ?? {});
    },
  });

  const [form, setForm] = useState<NoticeBannerValue>(NOTICE_BANNER_DEFAULTS);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (value: NoticeBannerValue) => {
      const normalized: NoticeBannerValue = {
        ...value,
        title: value.title.trim().slice(0, 80),
        content: value.content.trim().slice(0, 2000),
      };
      await updateDraft({ data: { key: SETTING_KEY, draftValue: normalized } });
      await publish({ data: { key: SETTING_KEY } });
      return normalized;
    },
    onSuccess: () => {
      toast.success("Notice banner saved", { description: "Students will see the update within seconds." });
      qc.invalidateQueries({ queryKey: ["admin", "settings", SETTING_KEY] });
      qc.invalidateQueries({ queryKey: ["site-settings"] });
      // Broadcast to every other tab in the same browser so previews,
      // admin tabs, and student sessions all refresh instantly even if
      // the realtime publication is briefly unavailable.
      try {
        if (typeof window !== "undefined" && "BroadcastChannel" in window) {
          const ch = new BroadcastChannel("site-settings-sync");
          ch.postMessage({ key: SETTING_KEY, at: Date.now() });
          ch.close();
        }
      } catch {
        /* noop */
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  return (
    <section className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl"
        style={{ background: "#a855f733" }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-background/40"
            style={{ boxShadow: "0 0 16px #a855f755" }}
          >
            <Megaphone className="h-5 w-5" style={{ color: "#a855f7" }} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Global Notice Banner</h2>
            <p className="text-xs text-muted-foreground">
              Static notice or right-to-left running ticker shown across every student page. Changes
              broadcast live — no refresh required.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowPreview((s) => !s)}
          className="gap-2"
        >
          <Eye className="h-4 w-4" />
          {showPreview ? "Hide preview" : "Show preview"}
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="relative mt-5 space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/30 p-3">
            <div>
              <div className="text-sm font-semibold">Enable Notice Banner</div>
              <p className="text-xs text-muted-foreground">
                When OFF, the banner is completely hidden — no spacing, no container.
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Notice Title (optional)
              </span>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Important Update"
                maxLength={80}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Notice Type
              </span>
              <Segmented
                value={form.type}
                onChange={(v) => setForm((f) => ({ ...f, type: v }))}
                options={TYPE_OPTIONS}
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Notice Content
            </span>
            <Textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={4}
              maxLength={2000}
              placeholder="Type the announcement students should see…"
            />
            <span className="text-[10px] text-muted-foreground/70">
              {form.content.length}/2000 characters
            </span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Display Mode
              </span>
              <Segmented
                value={form.mode}
                onChange={(v) => setForm((f) => ({ ...f, mode: v }))}
                options={[
                  { value: "static", label: "Static Notice" },
                  { value: "ticker", label: "Running Ticker (R→L)" },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Scroll Speed
              </span>
              <Segmented
                value={form.speed}
                onChange={(v) => setForm((f) => ({ ...f, speed: v }))}
                options={SPEED_OPTIONS}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/30 p-3">
              <div>
                <div className="text-sm font-semibold">Pause on hover</div>
                <p className="text-xs text-muted-foreground">Ticker pauses when the cursor is over it.</p>
              </div>
              <Switch
                checked={form.pauseOnHover}
                onCheckedChange={(v) => setForm((f) => ({ ...f, pauseOnHover: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/30 p-3">
              <div>
                <div className="text-sm font-semibold">Infinite loop</div>
                <p className="text-xs text-muted-foreground">Off = ticker plays once and stops.</p>
              </div>
              <Switch
                checked={form.loop}
                onCheckedChange={(v) => setForm((f) => ({ ...f, loop: v }))}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Start date (optional)
              </span>
              <Input
                type="datetime-local"
                value={form.startAt ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value || null }))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                End date (optional)
              </span>
              <Input
                type="datetime-local"
                value={form.endAt ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value || null }))}
              />
            </label>
          </div>

          {showPreview && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Preview
              </div>
              {form.content.trim() ? (
                <NoticeBannerPreview value={form} />
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-background/20 px-4 py-3 text-xs text-muted-foreground">
                  Enter notice content above to see a live preview.
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate(form)}
              disabled={save.isPending}
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
