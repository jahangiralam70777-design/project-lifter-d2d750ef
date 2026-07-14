import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";

export function HelpCenterVideoModal({
  videoId,
  title,
  originalUrl,
  onClose,
}: {
  videoId: string;
  title: string;
  originalUrl?: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"checking" | "ready" | "owner" | "unavailable">("checking");
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const fallbackUrl = originalUrl?.trim() || watchUrl;
  // Always render only the canonical YouTube embed endpoint — never watch/youtu.be/shorts/live.
  const embedUrl = useMemo(() => {
    return `https://www.youtube.com/embed/${videoId}`;
  }, [videoId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let cancelled = false;

    const controller = new AbortController();
    setStatus("checking");
    fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => {
        if (cancelled) return;
        setStatus(res.ok ? "ready" : "owner");
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setStatus("unavailable");
      });

    return () => {
      cancelled = true;
      controller.abort();
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, videoId, watchUrl]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close video"
          className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
          {status === "checking" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-white">
              <Loader2 className="h-6 w-6 animate-spin" aria-label="Checking video" />
            </div>
          ) : status === "ready" ? (
            <iframe
              src={embedUrl}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              onError={() => setStatus("unavailable")}
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900 p-6 text-center text-white">
              <p className="max-w-sm text-sm text-slate-200">
                {status === "owner"
                  ? "This video cannot be embedded by the owner."
                  : "This video can't be played inside the site. Open it on YouTube to watch."}
              </p>
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                <ExternalLink className="h-4 w-4" /> ▶ Watch on YouTube
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
