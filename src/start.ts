import { createStart, createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

import { renderErrorPage } from "./lib/error-page";

/**
 * Security headers applied to every server response.
 *
 * Set headers BEFORE awaiting `next()` so they land on the outgoing response
 * regardless of what downstream handlers return (HTML, JSON, XML, binary).
 * Per-route handlers may still override these with their own headers.
 *
 * CSP is intentionally permissive for non-admin routes (blog images, OAuth
 * popups) and strict on /admin. `unsafe-inline` is required for the
 * theme-init script in __root.tsx and shadcn chart styles.
 */
const securityHeadersMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    const url = new URL(request.url);
    const isAdmin = url.pathname === "/admin" || url.pathname.startsWith("/admin/");

    setResponseHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    setResponseHeader("X-Content-Type-Options", "nosniff");
    setResponseHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    setResponseHeader(
      "Permissions-Policy",
      'camera=(), microphone=(), geolocation=(), payment=(), gyroscope=(self "https://www.youtube.com" "https://www.youtube-nocookie.com"), accelerometer=(self "https://www.youtube.com" "https://www.youtube-nocookie.com")',
    );
    setResponseHeader("X-Frame-Options", isAdmin ? "DENY" : "SAMEORIGIN");

    const cspDirectives = [
      "default-src 'self'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      // 'unsafe-eval' kept for non-production so Vite/HMR keeps working.
      "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com" +
        (process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"),
      "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https: wss:",
      // Allow embedding YouTube (Learning Center tutorials) and same-origin frames.
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
      "child-src 'self' blob: https://www.youtube.com https://www.youtube-nocookie.com",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ];
    if (process.env.NODE_ENV === "production") {
      cspDirectives.splice(8, 0, "frame-ancestors " + (isAdmin ? "'none'" : "'self'"));
    }
    const csp = cspDirectives.join("; ");
    // Enforce in production. In development the outer dev/server security layer
    // already supplies CSP; avoid duplicate report-only console noise.
    if (process.env.NODE_ENV === "production") {
      setResponseHeader("Content-Security-Policy", csp);
    }
  } catch {
    // Never let header logic break the request pipeline.
  }
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  // Order matters: errorMiddleware wraps everything so header logic failures
  // still surface as a clean 500.
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
