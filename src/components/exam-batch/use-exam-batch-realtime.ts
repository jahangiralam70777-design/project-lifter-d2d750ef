// Exam Batch realtime bridge — mounted once inside ExamBatchLayout so that
// both admin and student subtrees receive live updates from Supabase
// postgres_changes.
//
// Invalidations are *scoped per table* so a single MCQ upload does not
// force sessions / enrollments / settings / analytics to refetch across
// every mounted admin screen. Query keys follow the convention
// ["exam-batch", "admin", <scope>, ...] and ["exam-batch", "student", ...];
// each realtime scope invalidates only its buckets.

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRouter, type AnyRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Map every realtime table to the query-key buckets it can affect.
// Only these buckets refetch on a burst — everything else stays cached.
const TABLE_SCOPES: Record<string, string[][]> = {
  exam_batch_settings: [
    ["exam-batch", "admin", "settings"],
    ["exam-batch", "admin", "attendance", "settings"],
    ["exam-batch", "public-settings"],
  ],
  exam_batch_sessions: [
    ["exam-batch", "admin", "sessions"],
    ["exam-batch", "student", "sessions"],
    ["exam-batch", "student", "access"],
    ["exam-batch", "student", "exams"],
    ["exam-batch", "student", "history"],
    ["exam-batch", "student", "leaderboard"],
    ["exam-batch", "student", "progress"],
  ],
  exam_batch_subjects: [
    ["exam-batch", "admin", "subjects"],
    ["exam-batch", "admin", "enrollment", "subjects"],
    ["exam-batch", "admin", "academic"],
    ["exam-batch", "student", "subjects"],
    ["exam-batch", "student", "session-subjects"],
    ["exam-batch", "student", "subject-progress"],
    ["exam-batch", "admin", "subject-progress"],
  ],
  exam_batch_chapters: [
    ["exam-batch", "admin", "chapters"],
    ["exam-batch", "admin", "academic"],
    ["exam-batch", "student", "subject-progress"],
    ["exam-batch", "admin", "subject-progress"],
  ],
  exam_batch_levels: [
    ["exam-batch", "admin", "levels"],
    ["exam-batch", "admin", "academic"],
  ],
  exam_batch_mcqs: [
    ["exam-batch", "admin", "mcqs"],
    ["exam-batch", "admin", "mcqs-picker"],
  ],
  exam_batch_exams: [
    ["exam-batch", "admin", "exams"],
    ["exam-batch", "admin", "exams-for-leaderboard"],
    ["exam-batch", "student", "exams"],
    ["exam-batch", "student", "history"],
    ["exam-batch", "student", "leaderboard"],
    ["exam-batch", "student", "subject-progress"],
    ["exam-batch", "admin", "subject-progress"],
  ],
  exam_batch_exam_questions: [
    ["exam-batch", "admin", "exam-questions"],
  ],
  exam_batch_enrollments: [
    ["exam-batch", "admin", "enrollments"],
    ["exam-batch", "admin", "attendance"],
    ["exam-batch", "student", "my-enrollments"],
    ["exam-batch", "student", "access"],
    ["exam-batch", "student", "exams"],
    ["exam-batch", "student", "history"],
    ["exam-batch", "student", "progress"],
    ["exam-batch", "student", "subject-progress"],
    ["exam-batch", "admin", "subject-progress"],
  ],
  exam_batch_enrollment_subjects: [
    ["exam-batch", "admin", "enrollments"],
    ["exam-batch", "admin", "enrollment", "subjects"],
    ["exam-batch", "admin", "attendance"],
    ["exam-batch", "student", "my-enrollments"],
    ["exam-batch", "student", "access"],
    ["exam-batch", "student", "exams"],
    ["exam-batch", "student", "history"],
    ["exam-batch", "student", "progress"],
    ["exam-batch", "student", "subject-progress"],
    ["exam-batch", "admin", "subject-progress"],
  ],
  exam_batch_session_subjects: [
    ["exam-batch", "admin", "sessions"],
    ["exam-batch", "student", "session-subjects"],
  ],
  exam_batch_attempts: [
    ["exam-batch", "student", "attempt"],
    ["exam-batch", "student", "history"],
    ["exam-batch", "student", "progress"],
    ["exam-batch", "admin", "analytics"],
    ["exam-batch", "admin", "leaderboard"],
    ["exam-batch", "student", "subject-progress"],
    ["exam-batch", "admin", "subject-progress"],
  ],
  exam_batch_attempt_answers: [["exam-batch", "student", "attempt"]],
  exam_batch_attempt_results: [
    ["exam-batch", "student", "result"],
    ["exam-batch", "student", "history"],
    ["exam-batch", "student", "progress"],
    ["exam-batch", "admin", "analytics"],
    ["exam-batch", "admin", "leaderboard"],
    ["exam-batch", "student", "subject-progress"],
    ["exam-batch", "admin", "subject-progress"],
  ],
  exam_batch_leaderboards: [
    ["exam-batch", "student", "leaderboard"],
    ["exam-batch", "student", "history"],
    ["exam-batch", "admin", "leaderboard"],
  ],
  exam_batch_leaderboard_entries: [
    ["exam-batch", "student", "leaderboard"],
    ["exam-batch", "student", "history"],
    ["exam-batch", "admin", "leaderboard"],
  ],
  exam_batch_progress_summaries: [["exam-batch", "student", "progress"]],
  exam_batch_analytics_snapshots: [["exam-batch", "admin", "analytics"]],
  exam_batch_attendance_state: [
    ["exam-batch", "admin", "attendance"],
    ["exam-batch", "student", "access"],
  ],
  exam_batch_attendance_processed: [
    ["exam-batch", "admin", "attendance"],
  ],
  exam_batch_attendance_events: [
    ["exam-batch", "admin", "attendance"],
  ],
  exam_batch_ban_history: [
    ["exam-batch", "admin", "attendance"],
  ],
  exam_batch_comment_rules: [
    ["exam-batch", "admin", "comment-rules"],
  ],
  exam_batch_download_history: [
    ["exam-batch", "admin", "download-history"],
  ],
  exam_batch_notifications: [
    ["exam-batch", "student", "notifications"],
    ["exam-batch", "admin", "notifications"],
  ],
};

const EXAM_BATCH_TABLES = Object.keys(TABLE_SCOPES);
const EXAM_BATCH_BROADCAST_EVENT = "exam-batch-db-change";

// Tables whose changes can flip the student's authoritative access decision
// (approved / pending / rejected / removed / banned / module visible). When
// any of these fire we ALSO call `router.invalidate()` so the layout's
// `beforeLoad` re-runs against fresh cache and issues the appropriate
// redirect (dashboard ↔ pending ↔ sessions ↔ ban page) without any manual
// refresh, timeout, polling, or window.location.reload.
const ROUTER_INVALIDATING_TABLES = new Set<string>([
  "exam_batch_enrollments",
  "exam_batch_enrollment_subjects",
  "exam_batch_attendance_state",
  "exam_batch_settings",
]);

let mountCount = 0;
let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Set<string>();

function flush(qc: QueryClient, router: AnyRouter) {
  flushTimer = null;
  const seen = new Set<string>();
  let shouldInvalidateRouter = false;
  for (const table of pending) {
    if (ROUTER_INVALIDATING_TABLES.has(table)) shouldInvalidateRouter = true;
    for (const key of TABLE_SCOPES[table] ?? []) {
      const sig = key.join("|");
      if (seen.has(sig)) continue;
      seen.add(sig);
      // Only refetch queries currently observed on-screen; cached-but-idle
      // pages stay warm and don't hit the network.
      void qc.invalidateQueries({ queryKey: key, refetchType: "active" });
    }
  }
  pending.clear();
  // Router invalidation re-runs every active route's `beforeLoad` and
  // loader. `_student/exam-batch`'s `beforeLoad` reads the same query keys
  // we just invalidated via `ensureQueryData`, so it observes the fresh
  // enrollment status and issues `throw redirect(...)` when the student
  // was moved between approved / pending / rejected / removed. TanStack
  // Router keeps the previous route mounted during this transition, so
  // there is no unmount and no blank screen.
  if (shouldInvalidateRouter) {
    void router.invalidate();
  }
}

function invalidateAll(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["exam-batch"], refetchType: "active" });
}

// Re-sync access-critical state after a period during which we may have
// missed realtime events (tab hidden, offline, socket dropped). We
// invalidate ONLY the access-relevant query keys and then call
// `router.invalidate()` so the exam-batch `beforeLoad` re-runs against
// fresh authorization data on the same tick. Other buckets (mcqs,
// analytics, downloads, etc.) are handled by the broader `invalidateAll`
// path — this stays narrow to avoid unnecessary router work.
function resyncAccess(qc: QueryClient, router: AnyRouter) {
  for (const table of ROUTER_INVALIDATING_TABLES) {
    for (const key of TABLE_SCOPES[table] ?? []) {
      void qc.invalidateQueries({ queryKey: key, refetchType: "active" });
    }
  }
  void router.invalidate();
}

/**
 * Client-side fallback for Admin Panel writes that change student visibility.
 * Postgres realtime is RLS-filtered, so UPDATEs like publish → unpublish or
 * visible → hidden can be invisible to student sockets precisely when their
 * lists need to remove the row. Admin mutations broadcast a tiny invalidation
 * event after the write; students refetch through normal RLS-protected server
 * functions, so no row data is leaked.
 */
export function notifyExamBatchRealtime(table: keyof typeof TABLE_SCOPES | string) {
  const channel = sharedChannel;
  if (!channel) return;
  void channel.send({
    type: "broadcast",
    event: EXAM_BATCH_BROADCAST_EVENT,
    payload: { table, at: Date.now() },
  });
}

/**
 * Subscribes to postgres_changes on every exam-batch table and coalesces
 * bursts of events into scoped, per-table query invalidations. Safe to mount
 * from multiple places — the underlying channel is refcounted.
 */
export function useExamBatchRealtime() {
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    mountCount += 1;
    let cancelled = false;
    let authSub: { unsubscribe: () => void } | null = null;

    const scheduleInvalidate = (table: string) => {
      pending.add(table);
      if (flushTimer) return;
      flushTimer = setTimeout(() => flush(qc, router), 75);
    };

    // Realtime postgres_changes are subject to RLS. Without a JWT set on the
    // realtime socket, RLS-scoped rows (enrollments, notifications, etc.)
    // never reach the client. Push the current access token and keep it in
    // sync across sign-in / token-refresh events.
    const applyAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.realtime as any).setAuth(token);
      } catch {
        /* noop */
      }
    };

    const ensureChannel = async () => {
      await applyAuth();
      if (cancelled || sharedChannel) return;
      const channel = supabase.channel("exam-batch-live", {
        config: { broadcast: { self: false } },
      });
      for (const table of EXAM_BATCH_TABLES) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (channel as any).on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => scheduleInvalidate(table),
        );
      }
      channel.on("broadcast", { event: EXAM_BATCH_BROADCAST_EVENT }, (message) => {
        const table = (message.payload as { table?: string } | undefined)?.table;
        if (table && TABLE_SCOPES[table]) scheduleInvalidate(table);
        else invalidateAll(qc);
      });
      sharedChannel = channel;
      channel.subscribe((status) => {
        // `SUBSCRIBED` fires on the first connect AND after every automatic
        // reconnect (network drop, sleep/wake, server restart). Any events
        // that happened while the socket was down are gone — we must
        // resync access state on every (re)subscribe, not just the first.
        if (status === "SUBSCRIBED") {
          invalidateAll(qc);
          resyncAccess(qc, router);
        }
      });
    };

    void ensureChannel();

    // A hidden tab, an offline stretch, or a dropped socket can all cause
    // the client to miss postgres_changes events. When we resume, we must
    // BOTH refresh cache AND re-run route guards — otherwise a student
    // whose enrollment flipped while the tab was backgrounded returns to
    // a page they no longer have access to, waiting for the next realtime
    // tick to redirect. `resyncAccess` covers this by invalidating the
    // access-critical query keys and calling `router.invalidate()` so
    // `_student/exam-batch`'s `beforeLoad` re-evaluates immediately.
    const handleOnline = () => {
      invalidateAll(qc);
      resyncAccess(qc, router);
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      invalidateAll(qc);
      resyncAccess(qc, router);
    };
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "SIGNED_OUT") {
        void applyAuth();
        invalidateAll(qc);
        // Auth identity changes affect what the access RPC returns; re-run
        // the route guard so the student lands on the right page.
        resyncAccess(qc, router);
      }
    });
    authSub = sub.subscription;


    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      authSub?.unsubscribe();
      mountCount -= 1;
      if (mountCount <= 0) {
        mountCount = 0;
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        pending.clear();
        if (sharedChannel) {
          void supabase.removeChannel(sharedChannel);
          sharedChannel = null;
        }
      }
    };
  }, [qc, router]);
}
