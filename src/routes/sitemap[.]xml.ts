// Sitemap served at the canonical /sitemap.xml path (crawlers' default).
// Mirrors the legacy /api/public/sitemap.xml route, which is retained as a
// redirect for backwards compatibility.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const staticUrls = ["/", "/blog", "/login", "/signup"];

        // Try to enrich with blog posts; degrade gracefully if Supabase
        // admin client / env vars are unavailable (e.g. in dev without
        // SUPABASE_SERVICE_ROLE_KEY) so the sitemap never 500s.
        let postUrls: string[] = [];
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: posts, error } = await supabaseAdmin
            .from("blog_posts")
            .select("slug,updated_at,published_at")
            .eq("status", "published")
            .order("published_at", { ascending: false })
            .limit(5000);
          if (error) throw error;
          postUrls = (posts ?? []).map((p) => {
            const lastmod = (p.updated_at as string) || (p.published_at as string) || "";
            return `<url><loc>${origin}/blog/${escapeXml(p.slug as string)}</loc>${
              lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
            }<changefreq>weekly</changefreq></url>`;
          });
        } catch (e) {
          console.error("[sitemap] failed to load blog posts; serving static URLs only", e);
        }

        const urls = [
          ...staticUrls.map(
            (u) => `<url><loc>${origin}${u}</loc><changefreq>weekly</changefreq></url>`,
          ),
          ...postUrls,
        ].join("");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=600",
          },
        });
      },

    },
  },
});

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
