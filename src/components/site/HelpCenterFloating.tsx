import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  BookOpen,
  GraduationCap,
  HelpCircle,
  Sparkles,
  Smartphone,
  Monitor,
  MessageCircle,
  X,
} from "lucide-react";
import { useSetting } from "@/hooks/use-site-content";
import { HELP_CENTER_DEFAULTS, parseYouTubeId, type HelpCenterSettings } from "@/lib/help-center";

const ICONS = {
  book: BookOpen,
  graduation: GraduationCap,
  help: HelpCircle,
  sparkles: Sparkles,
} as const;

/** Safe WhatsApp invite/community URL check. */
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

const VideoModal = lazy(() =>
  import("./HelpCenterVideoModal").then((m) => ({ default: m.HelpCenterVideoModal })),
);

export function HelpCenterFloating() {
  const settings = useSetting<HelpCenterSettings>("help_center", HELP_CENTER_DEFAULTS);
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [video, setVideo] = useState<{
    id: string;
    title: string;
    originalUrl: string;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close on Escape / outside click
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!settings.enabled) return null;
  // Homepage only — and never inside admin/editor surfaces.
  if (location.pathname !== "/") return null;
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("site-preview") === "1"
  )
    return null;

  const Icon = ICONS[settings.icon] ?? ICONS.graduation;

  // Each option is independently visible: enabled + valid URL.
  const items: Array<{
    key: "mobile" | "pc" | "whatsapp";
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
    visible: boolean;
  }> = [
    {
      key: "mobile",
      label: settings.mobile.label || "Mobile Tutorial",
      icon: Smartphone,
      visible: settings.mobile.enabled && !!parseYouTubeId(settings.mobile.url),
      onClick: () => {
        const id = parseYouTubeId(settings.mobile.url);
        if (!id) return;
        if (settings.mobile.openMode === "external") {
          window.open(settings.mobile.url, "_blank", "noopener,noreferrer");
        } else {
          setVideo({
            id,
            title: settings.mobile.label || "Mobile Tutorial",
            originalUrl: settings.mobile.url,
          });
        }
        setOpen(false);
      },
    },
    {
      key: "pc",
      label: settings.pc.label || "PC / Laptop Tutorial",
      icon: Monitor,
      visible: settings.pc.enabled && !!parseYouTubeId(settings.pc.url),
      onClick: () => {
        const id = parseYouTubeId(settings.pc.url);
        if (!id) return;
        if (settings.pc.openMode === "external") {
          window.open(settings.pc.url, "_blank", "noopener,noreferrer");
        } else {
          setVideo({
            id,
            title: settings.pc.label || "PC / Laptop Tutorial",
            originalUrl: settings.pc.url,
          });
        }
        setOpen(false);
      },
    },
    {
      key: "whatsapp",
      label: settings.whatsapp.label || "Join WhatsApp Group",
      icon: MessageCircle,
      visible: settings.whatsapp.enabled && isSafeWhatsAppUrl(settings.whatsapp.url),
      onClick: () => {
        window.open(settings.whatsapp.url, "_blank", "noopener,noreferrer");
        setOpen(false);
      },
    },
  ];

  const visibleItems = items.filter((i) => i.visible);
  if (visibleItems.length === 0) return null;

  return (
    <>
      <div
        className="fixed right-4 z-[9998] flex flex-col items-end gap-3 sm:right-6"
        style={{
          // Sit above the WhatsApp floating button (which is bottom-4/sm:bottom-6, ~3rem tall).
          bottom: "calc(env(safe-area-inset-bottom) + 5rem)",
        }}
      >
        {open && (
          <div
            ref={panelRef}
            role="dialog"
            aria-label={settings.title || "Help Center"}
            className="animate-scale-in w-[min(86vw,20rem)] origin-bottom-right overflow-hidden rounded-2xl border border-black/5 bg-white text-slate-900 shadow-[0_20px_50px_rgba(0,0,0,0.18)] ring-1 ring-black/5 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10"
          >
            <div
              className="flex items-start justify-between gap-3 px-4 py-3 text-white"
              style={{ backgroundColor: settings.themeColor || "#2563EB" }}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {settings.title || "Learning Center"}
                </div>
                {settings.subtitle ? (
                  <div className="truncate text-[11px] opacity-90">{settings.subtitle}</div>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/90 transition hover:bg-white/15"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="p-2">
              {visibleItems.map((it) => {
                const ItIcon = it.icon;
                return (
                  <li key={it.key}>
                    <button
                      type="button"
                      onClick={it.onClick}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-100 dark:hover:bg-slate-800"
                      style={{ outlineColor: settings.themeColor }}
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white"
                        style={{ backgroundColor: settings.themeColor || "#2563EB" }}
                      >
                        <ItIcon className="h-4 w-4" />
                      </span>
                      <span className="truncate">{it.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <button
          ref={buttonRef}
          type="button"
          aria-label={settings.buttonText || settings.title || "Help Center"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="group inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(0,0,0,0.25)] ring-1 ring-black/5 transition-transform duration-150 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ backgroundColor: settings.buttonColor || "#2563EB" }}
        >
          <Icon className="h-5 w-5" />
          <span className="hidden sm:inline">{settings.buttonText || "Learning Center"}</span>
        </button>
      </div>

      {video && (
        <Suspense fallback={null}>
          <VideoModal
            videoId={video.id}
            title={video.title}
            originalUrl={video.originalUrl}
            onClose={() => setVideo(null)}
          />
        </Suspense>
      )}
    </>
  );
}
