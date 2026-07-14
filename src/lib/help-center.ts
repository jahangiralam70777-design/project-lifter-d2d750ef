export type HelpCenterOption = {
  enabled: boolean;
  label: string;
  url: string;
  /** 'inside' = open in modal player; 'external' = open in YouTube/app */
  openMode: "inside" | "external";
};

export type HelpCenterWhatsApp = {
  enabled: boolean;
  label: string;
  url: string;
};

export type HelpCenterSettings = {
  enabled: boolean;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonColor: string;
  themeColor: string;
  icon: "book" | "graduation" | "help" | "sparkles";
  mobile: HelpCenterOption;
  pc: HelpCenterOption;
  whatsapp: HelpCenterWhatsApp;
};

export const HELP_CENTER_DEFAULTS: HelpCenterSettings = {
  enabled: false,
  title: "Learning Center",
  subtitle: "Quick guides to help you get started",
  buttonText: "Learning Center",
  buttonColor: "#2563EB",
  themeColor: "#2563EB",
  icon: "graduation",
  mobile: { enabled: true, label: "Mobile Tutorial", url: "", openMode: "inside" },
  pc: { enabled: true, label: "PC / Laptop Tutorial", url: "", openMode: "inside" },
  whatsapp: { enabled: true, label: "Join WhatsApp Group", url: "" },
};

/** Extract a YouTube video id from any common URL shape. */
export function parseYouTubeId(input: string): string | null {
  if (!input) return null;
  const url = input.trim();
  // Bare id
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}
