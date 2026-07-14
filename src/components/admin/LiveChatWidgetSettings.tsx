import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  MessageCircle,
  Headphones,
  LifeBuoy,
  Bot,
  Sparkles,
  Send as SendIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { getChatSettings, updateChatSettings, type ChatSettings } from "@/lib/live-chat.functions";

const ICON_OPTIONS = [
  { value: "message-circle", label: "Chat bubble", Icon: MessageCircle },
  { value: "headphones", label: "Headphones", Icon: Headphones },
  { value: "life-buoy", label: "Life buoy", Icon: LifeBuoy },
  { value: "bot", label: "Bot", Icon: Bot },
  { value: "sparkles", label: "Sparkles", Icon: Sparkles },
  { value: "send", label: "Paper plane", Icon: SendIcon },
] as const;

const DEFAULT: ChatSettings = {
  enabled: true,
  position: "bottom-right",
  theme_color: "#3b82f6",
  welcome_message: "Hi! How can we help today?",
  offline_message: "We're offline — leave a message and we'll reply by email.",
  email_notifications: true,
  sound_notifications: true,
  auto_assignment_enabled: false,
  attachment_max_mb: 10,
  rate_limit_per_minute: 20,
  button_text: "Live Chat",
  tooltip_text: "Chat with our team",
  icon_name: "message-circle",
  show_label: true,
  show_launcher: true,
};

export function LiveChatWidgetSettingsPanel() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getChatSettings);
  const update = useServerFn(updateChatSettings);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "chat-settings"],
    queryFn: () => fetchSettings(),
  });
  const [form, setForm] = useState<ChatSettings>(DEFAULT);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const mut = useMutation({
    mutationFn: async (next: Partial<ChatSettings>) => update({ data: next }),
    onSuccess: () => {
      toast.success("Live chat settings saved");
      qc.invalidateQueries({ queryKey: ["admin", "chat-settings"] });
      qc.invalidateQueries({ queryKey: ["chat", "settings"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const set = <K extends keyof ChatSettings>(k: K, v: ChatSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Live Chat Widget</h3>
          <p className="text-xs text-muted-foreground">
            Real-time support chat — changes apply instantly to all students.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center justify-between rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-medium">Enable Live Chat</p>
            <p className="text-xs text-muted-foreground">Show the floating widget</p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </label>

        <label className="flex items-center justify-between rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-medium">Email notifications</p>
            <p className="text-xs text-muted-foreground">Notify staff via email</p>
          </div>
          <Switch
            checked={form.email_notifications}
            onCheckedChange={(v) => set("email_notifications", v)}
          />
        </label>

        <label className="flex items-center justify-between rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-medium">Sound notifications</p>
            <p className="text-xs text-muted-foreground">Play sound on new message</p>
          </div>
          <Switch
            checked={form.sound_notifications}
            onCheckedChange={(v) => set("sound_notifications", v)}
          />
        </label>

        <label className="flex items-center justify-between rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-medium">Auto assignment</p>
            <p className="text-xs text-muted-foreground">Round-robin to staff</p>
          </div>
          <Switch
            checked={form.auto_assignment_enabled}
            onCheckedChange={(v) => set("auto_assignment_enabled", v)}
          />
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Position</label>
          <select
            value={form.position}
            onChange={(e) => set("position", e.target.value as ChatSettings["position"])}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="bottom-right">Bottom Right</option>
            <option value="bottom-left">Bottom Left</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Theme color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={form.theme_color}
              onChange={(e) => set("theme_color", e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-background"
            />
            <Input
              value={form.theme_color}
              onChange={(e) => set("theme_color", e.target.value)}
              placeholder="#3b82f6"
              maxLength={7}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Attachment limit (MB)
          </label>
          <Input
            type="number"
            value={form.attachment_max_mb}
            onChange={(e) => set("attachment_max_mb", Math.max(1, Number(e.target.value) || 10))}
            min={1}
            max={50}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Rate limit (msgs/min)
          </label>
          <Input
            type="number"
            value={form.rate_limit_per_minute}
            onChange={(e) =>
              set("rate_limit_per_minute", Math.max(1, Number(e.target.value) || 20))
            }
            min={1}
            max={120}
          />
        </div>
      </div>


      {/* ───── Launcher branding ───── */}
      <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-4">
        <div>
          <h4 className="text-sm font-semibold">Floating launcher</h4>
          <p className="text-xs text-muted-foreground">
            Pill button shown on every page. Always keep the label visible for clarity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/10"
            style={{ background: form.theme_color }}
          >
            {(() => {
              const found = ICON_OPTIONS.find((i) => i.value === form.icon_name);
              const Icon = found?.Icon ?? MessageCircle;
              return <Icon className="h-4 w-4" />;
            })()}
            {form.show_label && (form.button_text || "Live Chat")}
          </span>
          <span className="text-xs text-muted-foreground">Live preview</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
            <div>
              <p className="text-sm font-medium">Show launcher</p>
              <p className="text-xs text-muted-foreground">Hide entirely from students</p>
            </div>
            <Switch checked={form.show_launcher} onCheckedChange={(v) => set("show_launcher", v)} />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
            <div>
              <p className="text-sm font-medium">Show text label</p>
              <p className="text-xs text-muted-foreground">Off = icon-only chip</p>
            </div>
            <Switch checked={form.show_label} onCheckedChange={(v) => set("show_label", v)} />
          </label>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Button text</label>
            <Input
              value={form.button_text}
              onChange={(e) => set("button_text", e.target.value)}
              maxLength={40}
              placeholder="Live Chat"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tooltip text</label>
            <Input
              value={form.tooltip_text}
              onChange={(e) => set("tooltip_text", e.target.value)}
              maxLength={80}
              placeholder="Chat with our team"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Icon style</label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ICON_OPTIONS.map(({ value, Icon, label }) => {
                const active = form.icon_name === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set("icon_name", value)}
                    title={label}
                    className={`flex items-center justify-center rounded-xl border px-2 py-3 transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-background text-foreground/70 hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Welcome message
          </label>
          <Textarea
            value={form.welcome_message}
            onChange={(e) => set("welcome_message", e.target.value)}
            maxLength={500}
            rows={2}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Offline message
          </label>
          <Textarea
            value={form.offline_message}
            onChange={(e) => set("offline_message", e.target.value)}
            maxLength={500}
            rows={2}
          />
        </div>
      </div>


      <div className="flex justify-end gap-2">
        <Button
          onClick={() => mut.mutate(form)}
          disabled={mut.isPending}
          className="bg-cta-gradient text-white shadow-glow"
        >
          {mut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save settings
        </Button>
      </div>
    </div>
  );
}
