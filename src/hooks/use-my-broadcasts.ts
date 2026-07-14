import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/app-store";
import { listMyBroadcasts, markBroadcastRead, hideBroadcastForMe, type MyBroadcast } from "@/lib/broadcasts.functions";

export const MY_BROADCASTS_KEY = ["my-broadcasts"] as const;

export function useMyBroadcasts(enabledOpt = true) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyBroadcasts);
  const markFn = useServerFn(markBroadcastRead);
  const hideFn = useServerFn(hideBroadcastForMe);
  const sessionReady = useAppStore((s) => s.sessionReady);
  const authLoading = useAppStore((s) => s.authLoading);
  const user = useAppStore((s) => s.user);
  const enabled =
    enabledOpt && sessionReady && !authLoading && !!user && !user.id.startsWith("demo-");

  const q = useQuery({
    queryKey: MY_BROADCASTS_KEY,
    queryFn: () => listFn() as Promise<MyBroadcast[]>,
    enabled,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!enabled || !user?.id) return;
    const ch = supabase.channel(`my-broadcasts-${Math.random().toString(36).slice(2, 10)}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "broadcasts" }, () =>
      qc.invalidateQueries({ queryKey: MY_BROADCASTS_KEY }),
    );
    ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "broadcast_recipients",
        filter: `user_id=eq.${user.id}`,
      },
      () => {
        qc.invalidateQueries({ queryKey: MY_BROADCASTS_KEY });
        qc.invalidateQueries({ queryKey: ["my-notifications"] });
      },
    );
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
      () =>
        qc.invalidateQueries({ queryKey: ["my-notifications"] }),
    );
    ch.subscribe();
    return () => {
      try { supabase.removeChannel(ch); } catch { /* noop */ }
    };
  }, [qc, enabled, user?.id]);

  const markRead = useMutation({
    mutationFn: (recipientId: string) => markFn({ data: { id: recipientId } }),
    onMutate: async (rid) => {
      await qc.cancelQueries({ queryKey: MY_BROADCASTS_KEY });
      const prev = qc.getQueryData<MyBroadcast[]>(MY_BROADCASTS_KEY);
      qc.setQueryData<MyBroadcast[]>(MY_BROADCASTS_KEY, (old) =>
        (old ?? []).map((b) => (b.recipient_id === rid ? { ...b, read_at: new Date().toISOString() } : b)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(MY_BROADCASTS_KEY, ctx.prev);
    },
    onSuccess: (result) => {
      const notificationIds = Array.isArray(result?.notification_ids) ? result.notification_ids : [];
      if (notificationIds.length > 0) {
        qc.setQueryData<Array<{ id: string; read: boolean }>>(["my-notifications"], (old) =>
          (old ?? []).map((n) => (notificationIds.includes(n.id) ? { ...n, read: true } : n)),
        );
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: MY_BROADCASTS_KEY });
      qc.invalidateQueries({ queryKey: ["my-notifications"] });
    },
  });

  const hide = useMutation({
    mutationFn: (recipientId: string) => hideFn({ data: { id: recipientId } }),
    onMutate: async (rid) => {
      await qc.cancelQueries({ queryKey: MY_BROADCASTS_KEY });
      const prev = qc.getQueryData<MyBroadcast[]>(MY_BROADCASTS_KEY);
      qc.setQueryData<MyBroadcast[]>(MY_BROADCASTS_KEY, (old) =>
        (old ?? []).filter((b) => b.recipient_id !== rid),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(MY_BROADCASTS_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: MY_BROADCASTS_KEY }),
  });

  const items = q.data ?? [];
  const unread = items.filter((b) => !b.read_at).length;
  return { items, unread, isLoading: q.isLoading, markRead, hide };
}
