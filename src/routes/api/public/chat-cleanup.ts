import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Live chat retention cleanup endpoint.
 * Deletes messages, conversations, and attachments whose expires_at < now().
 *
 * Auth: provide either `Authorization: Bearer <CHAT_CLEANUP_SECRET>` OR an
 * HMAC-SHA256 signature via `x-signature` header over the literal body
 * "live-chat-cleanup" using CHAT_CLEANUP_SECRET. The pg_cron job in the
 * migration is the primary scheduler; this is a fallback for external schedulers.
 */
async function authorize(request: Request): Promise<boolean> {
  const secret = process.env.CHAT_CLEANUP_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (auth && auth.replace(/^Bearer\s+/i, "") === secret) return true;
  const sig = request.headers.get("x-signature");
  if (!sig) return false;
  try {
    const expected = createHmac("sha256", secret).update("live-chat-cleanup").digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function run() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any).rpc("live_chat_cleanup_expired");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

export const Route = createFileRoute("/api/public/chat-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authorize(request))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await run();
          return Response.json({ ok: true, result });
        } catch (e) {
          return new Response((e as Error).message, { status: 500 });
        }
      },
    },
  },
});
