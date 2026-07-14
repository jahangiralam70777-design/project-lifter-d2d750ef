import { createFileRoute } from "@tanstack/react-router";

// Alias for Supabase's default email-confirmation template, which targets
// `{{ .SiteURL }}/auth/confirm?token_hash=...&type=...`. We forward the
// query + hash to our canonical handlers so token exchange happens in one
// place. Recovery (password reset) links must go to /reset-password so the
// user can pick a new password before any session-driven redirect.
function pickTarget(url: URL): string {
  const type = (url.searchParams.get("type") || "").toLowerCase();
  const hash = url.hash || "";
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const hashType = (hashParams.get("type") || "").toLowerCase();
  const isRecovery = type === "recovery" || hashType === "recovery";
  return isRecovery ? "/reset-password" : "/email-verified";
}

export const Route = createFileRoute("/auth/confirm")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = new URL(pickTarget(url), url.origin);
        target.search = url.search;
        target.hash = url.hash;
        console.info("[auth-confirm] forwarding verification callback", {
          hasCode: url.searchParams.has("code"),
          hasTokenHash: url.searchParams.has("token_hash"),
          hasToken: url.searchParams.has("token"),
          type: url.searchParams.get("type"),
          hasHash: Boolean(url.hash),
          targetPath: `${target.pathname}${target.search ? "?…" : ""}${target.hash ? "#…" : ""}`,
        });
        return Response.redirect(target.toString(), 303);
      },
    },
  },
  component: AuthConfirm,
  head: () => ({
    meta: [
      { title: "Confirming…" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function AuthConfirm() {
  if (typeof window !== "undefined") {
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    const target = pickTarget(new URL(window.location.href));
    window.location.replace(`${target}${search}${hash}`);
  }
  return (
    <div className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">
      Confirming your email…
    </div>
  );
}
