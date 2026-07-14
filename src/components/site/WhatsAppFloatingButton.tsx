import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { useSetting } from "@/hooks/use-site-content";
import {
  WHATSAPP_DEFAULTS,
  type WhatsAppPopupSettings,
} from "@/components/landing/WhatsAppPopup";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16.001 2.667C8.638 2.667 2.667 8.638 2.667 16c0 2.353.616 4.652 1.787 6.677L2.667 29.333l6.86-1.764A13.27 13.27 0 0 0 16 29.333C23.363 29.333 29.333 23.363 29.333 16S23.363 2.667 16.001 2.667Zm0 24a10.61 10.61 0 0 1-5.413-1.483l-.388-.23-4.07 1.046 1.087-3.97-.253-.41A10.628 10.628 0 1 1 16 26.667Zm6.123-7.97c-.335-.168-1.984-.978-2.291-1.09-.308-.112-.531-.168-.755.168-.224.335-.866 1.09-1.062 1.314-.196.224-.392.252-.726.084-.335-.168-1.414-.521-2.694-1.661-.996-.888-1.668-1.984-1.864-2.319-.196-.335-.021-.516.147-.683.151-.15.335-.392.503-.587.168-.196.224-.336.336-.56.112-.224.056-.42-.028-.587-.084-.168-.755-1.819-1.034-2.49-.272-.654-.55-.566-.755-.577l-.643-.012a1.24 1.24 0 0 0-.895.42c-.308.335-1.174 1.147-1.174 2.797 0 1.65 1.202 3.244 1.37 3.468.168.224 2.367 3.614 5.736 5.066.802.346 1.428.552 1.916.706.805.256 1.538.22 2.117.134.646-.096 1.984-.811 2.264-1.594.28-.783.28-1.455.196-1.594-.084-.14-.308-.224-.643-.392Z" />
    </svg>
  );
}

/**
 * Lightweight global floating WhatsApp contact button.
 *
 * - Reads the same `whatsapp_popup` site setting that powers the homepage
 *   popup, so the admin Settings → WhatsApp panel already controls it.
 * - Renders nothing unless `enabled === true` and a `number` is configured.
 * - Hidden on admin routes (admin shell has its own floating actions) and on
 *   site-preview iframes used by the page editor.
 */
export function WhatsAppFloatingButton() {
  const settings = useSetting<WhatsAppPopupSettings>(
    "whatsapp_popup",
    WHATSAPP_DEFAULTS,
  );
  const location = useLocation();
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!settings.enabled || !settings.number) return;
    try {
      if (sessionStorage.getItem("wa_tip_seen") === "1") return;
    } catch {
      /* ignore */
    }
    const showT = window.setTimeout(() => setShowTip(true), 1200);
    const hideT = window.setTimeout(() => {
      setShowTip(false);
      try {
        sessionStorage.setItem("wa_tip_seen", "1");
      } catch {
        /* ignore */
      }
    }, 7200);
    return () => {
      window.clearTimeout(showT);
      window.clearTimeout(hideT);
    };
  }, [settings.enabled, settings.number]);

  if (!settings.enabled || !settings.number) return null;

  // Avoid overlapping admin's floating quick-actions and the in-editor preview.
  const path = location.pathname;
  if (path === "/admin" || path.startsWith("/admin/")) return null;
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("site-preview") === "1"
  ) {
    return null;
  }

  const phone = settings.number.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!phone) return null;

  const message = (settings.message || WHATSAPP_DEFAULTS.message).trim();
  const href = message
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${phone}`;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2 sm:bottom-6 sm:right-6"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {showTip && (
        <div
          role="status"
          className="animate-fade-in max-w-[min(78vw,17rem)] rounded-2xl bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-[0_10px_30px_rgba(0,0,0,0.15)] ring-1 ring-black/5 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10"
        >
          <div className="flex items-start gap-2">
            <span className="leading-snug">
              Need help? Chat with us on WhatsApp
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowTip(false);
                try {
                  sessionStorage.setItem("wa_tip_seen", "1");
                } catch {
                  /* ignore */
                }
              }}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 ml-1 grid h-5 w-5 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
        </div>
      )}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        title="Chat with us on WhatsApp"
        onClick={() => {
          setShowTip(false);
          try {
            sessionStorage.setItem("wa_tip_seen", "1");
          } catch {
            /* ignore */
          }
        }}
        className="group relative grid h-12 w-12 place-items-center rounded-full text-white shadow-[0_10px_28px_rgba(37,211,102,0.5)] ring-1 ring-black/5 transition-transform duration-150 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 sm:h-14 sm:w-14"
        style={{ backgroundColor: "#25D366" }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            boxShadow: "0 0 0 0 rgba(37,211,102,0.55)",
            animation: "wa-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
          }}
        />
        <WhatsAppIcon className="relative h-6 w-6 sm:h-7 sm:w-7" />
        <span className="sr-only">Chat with us on WhatsApp</span>
      </a>
      <style>{`@keyframes wa-pulse{0%{box-shadow:0 0 0 0 rgba(37,211,102,0.55)}70%{box-shadow:0 0 0 14px rgba(37,211,102,0)}100%{box-shadow:0 0 0 0 rgba(37,211,102,0)}}`}</style>
    </div>
  );
}
