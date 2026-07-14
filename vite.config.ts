// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Allow CI/hosting to override the nitro deploy preset (e.g. Render → "node-server").
// Falls back to the Lovable default (cloudflare-module) for sandbox/preview builds.
const nitroPreset = process.env.NITRO_PRESET;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    build: {
      sourcemap: false,
      reportCompressedSize: false,
      minify: "esbuild",
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) return "vendor-motion";
            if (id.includes("@tanstack/react-query")) return "vendor-query";
            if (id.includes("date-fns") || id.includes("dayjs")) return "vendor-dates";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("@supabase")) return "vendor-supabase";
          },
        },
      },
    },
    // Strip console.log/console.debug in production bundles; keep warn/error
    // so structured logging still flows to the sandbox/server logs.
    esbuild: {
      drop: process.env.NODE_ENV === "production" ? ["debugger"] : [],
      pure: process.env.NODE_ENV === "production" ? ["console.log", "console.debug"] : [],
    },
  },
  ...(nitroPreset
    ? {
        nitro: {
          preset: nitroPreset,
        },
      }
    : {}),
});
