import { createFileRoute } from "@tanstack/react-router";

// Lightweight health endpoint used by Render health checks AND by the
// in-process keep-alive ping in server.node.mjs to prevent free-tier sleep.
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({ status: "ok", ts: Date.now() }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
