import { useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { useAppStore } from "@/stores/app-store";

const TARGET_ID = "daily-progress-capture-root";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function applyTheme(mode: "light" | "dark") {
  document.documentElement.classList.toggle("dark", mode === "dark");
  try {
    window.localStorage.setItem("edumaster.theme", mode);
  } catch {}
  useAppStore.setState({ theme: mode });
}

function download(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function captureNode(node: HTMLElement, mode: "light" | "dark") {
  const { default: html2canvas } = await import("html2canvas-pro");
  // Read background from the document so the capture isn't transparent
  const bg =
    getComputedStyle(document.body).backgroundColor || (mode === "dark" ? "#0b1120" : "#ffffff");
  const canvas = await html2canvas(node, {
    backgroundColor: bg,
    scale: window.devicePixelRatio > 1 ? 2 : 1.5,
    useCORS: true,
    logging: false,
    windowWidth: Math.max(node.scrollWidth, 1440),
    windowHeight: node.scrollHeight,
  });
  return canvas.toDataURL("image/png");
}

export function CapturePreviewButton() {
  const [busy, setBusy] = useState<null | "light" | "dark">(null);
  const initial = useAppStore.getState().theme;

  async function run() {
    const node = document.getElementById(TARGET_ID);
    if (!node) return;
    try {
      setBusy("light");
      applyTheme("light");
      await wait(450);
      const light = await captureNode(node, "light");
      download(light, `daily-progress-light-${Date.now()}.png`);

      setBusy("dark");
      applyTheme("dark");
      await wait(450);
      const dark = await captureNode(node, "dark");
      download(dark, `daily-progress-dark-${Date.now()}.png`);
    } catch (err) {
      console.error("[capture] failed", err);
      alert("Screenshot capture failed — see console for details.");
    } finally {
      applyTheme(initial);
      setBusy(null);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy !== null}
      className="glass inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
      title="Capture full-page Light + Dark screenshots"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
      {busy === "light" && "Capturing Light…"}
      {busy === "dark" && "Capturing Dark…"}
      {!busy && "Capture L+D"}
    </button>
  );
}

export const DAILY_PROGRESS_CAPTURE_ID = TARGET_ID;
