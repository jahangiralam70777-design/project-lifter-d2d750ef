import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSetting } from "@/hooks/use-site-content";

const SESSION_KEY = "edumaster.whatsapp_popup_dismissed";

export type WhatsAppPopupSettings = {
  enabled: boolean;
  number: string;
  message: string;
  delay_seconds: number;
};

export const WHATSAPP_DEFAULTS: WhatsAppPopupSettings = {
  enabled: false,
  number: "",
  message: "Hello, I need support regarding your platform.",
  delay_seconds: 4,
};

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.001 2.667C8.638 2.667 2.667 8.638 2.667 16c0 2.353.616 4.652 1.787 6.677L2.667 29.333l6.86-1.764A13.27 13.27 0 0 0 16 29.333C23.363 29.333 29.333 23.363 29.333 16S23.363 2.667 16.001 2.667Zm0 24a10.61 10.61 0 0 1-5.413-1.483l-.388-.23-4.07 1.046 1.087-3.97-.253-.41A10.628 10.628 0 1 1 16 26.667Zm6.123-7.97c-.335-.168-1.984-.978-2.291-1.09-.308-.112-.531-.168-.755.168-.224.335-.866 1.09-1.062 1.314-.196.224-.392.252-.726.084-.335-.168-1.414-.521-2.694-1.661-.996-.888-1.668-1.984-1.864-2.319-.196-.335-.021-.516.147-.683.151-.15.335-.392.503-.587.168-.196.224-.336.336-.56.112-.224.056-.42-.028-.587-.084-.168-.755-1.819-1.034-2.49-.272-.654-.55-.566-.755-.577l-.643-.012a1.24 1.24 0 0 0-.895.42c-.308.335-1.174 1.147-1.174 2.797 0 1.65 1.202 3.244 1.37 3.468.168.224 2.367 3.614 5.736 5.066.802.346 1.428.552 1.916.706.805.256 1.538.22 2.117.134.646-.096 1.984-.811 2.264-1.594.28-.783.28-1.455.196-1.594-.084-.14-.308-.224-.643-.392Z" />
    </svg>
  );
}

export function WhatsAppPopup() {
  const settings = useSetting<WhatsAppPopupSettings>("whatsapp_popup", WHATSAPP_DEFAULTS);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!settings.enabled || !settings.number) return;
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    } catch {
      // ignore
    }
    const delay = Math.max(0, Math.min(60, Number(settings.delay_seconds) || 4)) * 1000;
    const t = window.setTimeout(() => setOpen(true), delay);
    return () => window.clearTimeout(t);
  }, [settings.enabled, settings.number, settings.delay_seconds]);

  function close() {
    setOpen(false);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (!open || !settings.enabled || !settings.number) return null;

  const phone = settings.number.replace(/[^\d+]/g, "").replace(/^\+/, "");
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(
    settings.message || WHATSAPP_DEFAULTS.message,
  )}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wa-popup-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <button
        type="button"
        aria-label="Close WhatsApp support popup"
        onClick={close}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-foreground/70 transition hover:bg-background hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <div
          className="px-6 pt-8 pb-6 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(37,211,102,0.18), rgba(37,211,102,0.02))",
          }}
        >
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg"
            style={{ background: "#25D366", boxShadow: "0 10px 30px -10px #25D36699" }}
          >
            <WhatsAppIcon className="h-9 w-9" />
          </div>
          <h2 id="wa-popup-title" className="mt-4 text-xl font-bold text-foreground">
            Need Help? Chat with us on WhatsApp
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Our support team is ready to help you instantly.
          </p>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
            style={{ background: "#25D366" }}
          >
            <WhatsAppIcon className="h-5 w-5" />
            Start Chat on WhatsApp
          </a>
          <button
            type="button"
            onClick={close}
            className="mt-2 w-full rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
