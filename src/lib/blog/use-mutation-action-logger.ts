import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startAction } from "./action-log";

/**
 * Subscribes to the global TanStack Query MutationCache and records every
 * mutation into the action log. Zero per-mutation wiring required: existing
 * `useMutation({ mutationFn })` calls are auto-logged.
 *
 * We try to infer a friendly function name from the mutationFn's `.name`,
 * falling back to the first variable key or `mutation`. Payload = `variables`.
 */
export function useMutationActionLogger() {
  const qc = useQueryClient();
  useEffect(() => {
    const cache = qc.getMutationCache();
    const active = new Map<number, ReturnType<typeof startAction>>();

    const unsub = cache.subscribe((event) => {
      if (!event) return;
      const m = event.mutation;
      if (!m) return;
      const id = m.mutationId;
      const state = m.state;

      if (event.type === "added" || (state.status === "pending" && !active.has(id))) {
        const opts = m.options as { mutationFn?: { name?: string } } | undefined;
        const fnName =
          opts?.mutationFn?.name ||
          (typeof state.variables === "object" && state.variables
            ? Object.keys(state.variables as object)[0] ?? "mutation"
            : "mutation");
        active.set(
          id,
          startAction({ fn: fnName, file: "BlogManagerFlow", payload: state.variables })
        );
      }

      const handle = active.get(id);
      if (!handle) return;

      if (state.status === "success") {
        handle.done(state.data);
        active.delete(id);
      } else if (state.status === "error") {
        handle.fail(state.error);
        active.delete(id);
      }
    });

    return () => {
      unsub();
      active.clear();
    };
  }, [qc]);
}
