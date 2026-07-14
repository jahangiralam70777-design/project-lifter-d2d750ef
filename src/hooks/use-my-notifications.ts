import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/app-store";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/admin-notifications.functions";

export type MyNotification = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  type: "announcement" | "push" | "email" | "in_app" | "broadcast";
  priority: "low" | "medium" | "high" | "critical";
  sent_at: string | null;
  created_at: string;
  read: boolean;
  source_broadcast_id?: string | null;
};

export const MY_NOTIF_KEY = ["my-notifications"] as const;

export function useMyNotifications(enabledOpt = true) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const sessionReady = useAppStore((s) => s.sessionReady);
  const authLoading = useAppStore((s) => s.authLoading);
  const user = useAppStore((s) => s.user);
  const enabled =
    enabledOpt && sessionReady && !authLoading && !!user && !user.id.startsWith("demo-");

  const q = useQuery({
    queryKey: MY_NOTIF_KEY,
    queryFn: () => listFn() as Promise<MyNotification[]>,
    enabled,
    staleTime: 30_000,
  });

  // Realtime sync — unique channel name per mount avoids the
  // "cannot add postgres_changes callbacks after subscribe()" crash
  // that happens in React StrictMode double-mount / fast refresh, where
  // the previous channel hasn't been fully removed yet when the next
  // effect runs.
  useEffect(() => {
    if (!enabled || !user?.id) return;
    const channelName = `my-notif-live-${Math.random().toString(36).slice(2, 10)}`;
    const ch = supabase.channel(channelName);
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
      () => {
        qc.invalidateQueries({ queryKey: MY_NOTIF_KEY });
        qc.invalidateQueries({ queryKey: ["my-broadcasts"] });
      },
    );
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_reads", filter: `user_id=eq.${user.id}` },
      () => qc.invalidateQueries({ queryKey: MY_NOTIF_KEY }),
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
        qc.invalidateQueries({ queryKey: MY_NOTIF_KEY });
        qc.invalidateQueries({ queryKey: ["my-broadcasts"] });
      },
    );
    ch.subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* noop */
      }
    };
  }, [qc, enabled, user?.id]);

  const markRead = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: MY_NOTIF_KEY });
      const prev = qc.getQueryData<MyNotification[]>(MY_NOTIF_KEY);
      qc.setQueryData<MyNotification[]>(MY_NOTIF_KEY, (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(MY_NOTIF_KEY, ctx.prev);
    },
    onSuccess: (result) => {
      const recipientIds = Array.isArray(result?.broadcast_recipient_ids)
        ? result.broadcast_recipient_ids
        : [];
      if (recipientIds.length > 0) {
        qc.setQueryData<Array<{ recipient_id: string; read_at: string | null }>>(
          ["my-broadcasts"],
          (old) =>
            (old ?? []).map((b) =>
              recipientIds.includes(b.recipient_id)
                ? { ...b, read_at: b.read_at ?? new Date().toISOString() }
                : b,
            ),
        );
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: MY_NOTIF_KEY });
      qc.invalidateQueries({ queryKey: ["my-broadcasts"] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => markAllFn(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: MY_NOTIF_KEY });
      const prev = qc.getQueryData<MyNotification[]>(MY_NOTIF_KEY);
      qc.setQueryData<MyNotification[]>(MY_NOTIF_KEY, (old) =>
        (old ?? []).map((n) => ({ ...n, read: true })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(MY_NOTIF_KEY, ctx.prev);
    },
    onSuccess: () => {
      qc.setQueryData<Array<{ recipient_id: string; read_at: string | null }>>(
        ["my-broadcasts"],
        (old) => (old ?? []).map((b) => ({ ...b, read_at: b.read_at ?? new Date().toISOString() })),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: MY_NOTIF_KEY });
      qc.invalidateQueries({ queryKey: ["my-broadcasts"] });
    },
  });

  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  return { items, unread, isLoading: q.isLoading, markRead, markAll };
}
