// Loose-typed stand-in for the auto-generated auth middleware.
// Used only for TypeScript resolution (via tsconfig paths). At runtime,
// Vite resolves the real auth-middleware.ts. This shim keeps the fluent
// TanStack middleware chain typed, but exposes `context.supabase` as `any`
// so legacy queries against tables not yet in the generated types compile.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createMiddleware } from "@tanstack/react-start";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) =>
    next({
      context: {
        supabase: null as any,
        userId: "" as string,
        claims: {} as any,
      },
    }),
);
