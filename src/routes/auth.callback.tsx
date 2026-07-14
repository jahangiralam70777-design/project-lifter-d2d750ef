import { createFileRoute } from "@tanstack/react-router";

// Alias for the common Supabase PKCE callback path
// (`/auth/callback?code=...`). Some email templates / OAuth flows target
// this URL by convention. We forward query + hash to `/email-verified`,
// which performs `exchangeCodeForSession` and renders the success UI.
//
// IMPORTANT: password-recovery links (type=recovery) must NOT be exchanged
// here — that would sign the user in and bounce them to the dashboard
// without ever letting them choose a new password. Route those links to
// `/reset-password`, which performs the exchange and then shows the
// new-password form.
function pickTarget(url: URL): string {
  const type = (url.searchParams.get("type") || "").toLowerCase();
  const hash = url.hash || "";
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const hashType = (hashParams.get("type") || "").toLowerCase();
  const isRecovery = type === "recovery" || hashType === "recovery";
  return isRecovery ? "/reset-password" : "/email-verified";
}

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = new URL(pickTarget(url), url.origin);
        target.search = url.search;
        target.hash = url.hash;
        console.info("[auth-callback] forwarding auth callback", {
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
  component: AuthCallback,
  head: () => ({
    meta: [
      { title: "Signing you in…" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function AuthCallback() {
  if (typeof window !== "undefined") {
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    const target = pickTarget(new URL(window.location.href));
    window.location.replace(`${target}${search}${hash}`);
  }
  return (
    <div className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">
      Signing you in…
    </div>
  );
}
