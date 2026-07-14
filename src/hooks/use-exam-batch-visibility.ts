// Exam Batch module visibility hook.
//
// Reads `getExamBatchPublicSettings().moduleVisible` (backend as single
// source of truth) and subscribes to `exam_batch_settings` realtime so
// student sessions react instantly to an admin toggling the module on/off
// without any page refresh. Auth-only — the underlying server fn requires
// a signed-in user, matching every place we consume it.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getExamBatchPublicSettings } from "@/lib/exam-batch/public-settings.functions";
import { useAppStore } from "@/stores/app-store";

export function useExamBatchVisibility() {
  const qc = useQueryClient();
  const user = useAppStore((s) => s.user);
  const enabled = !!user;

  const query = useQuery({
    queryKey: ["exam-batch", "public-settings"],
    queryFn: () => getExamBatchPublicSettings(),
    staleTime: 30_000,
    enabled,
  });

  // Dedicated subscription so the sidebar/guards react to admin toggles
  // even when the user is nowhere near the Exam Batch subtree (the
  // shared realtime bridge is only mounted inside ExamBatchLayout).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const channel = supabase.channel(
      `exam-batch-visibility-${Math.random().toString(36).slice(2, 8)}`,
      { config: { private: true } },
    );

    const subscribe = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.realtime as any).setAuth(token);
      if (cancelled) return;
      channel.subscribe();
    };

    channel.on(
      "postgres_changes" as never,
      { event: "*", schema: "public", table: "exam_batch_settings" },
      () => {
        void qc.invalidateQueries({ queryKey: ["exam-batch", "public-settings"] });
      },
    );
    void subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [qc, enabled]);

  const moduleVisible = query.data?.moduleVisible ?? true;
  return {
    moduleVisible,
    hiddenReason: query.data?.hiddenReason ?? null,
    isLoading: enabled && query.isLoading,
  };
}
