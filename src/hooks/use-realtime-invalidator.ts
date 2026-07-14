import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to every content + visibility table and invalidates the
 * matching React Query keys so any student/admin view re-fetches instantly
 * when an admin publishes, edits, hides, or deletes content.
 *
 * Also publishes a tiny pub/sub bus (`realtimeBus`) that powers the
 * LiveIndicator, animated counters, and toast feedback throughout the UI.
 */

type RealtimeEvent = {
  table: string;
  type: "INSERT" | "UPDATE" | "DELETE";
  at: number;
};

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();
let lastEvent: RealtimeEvent | null = null;
let totalEvents = 0;

export const realtimeBus = {
  emit(event: RealtimeEvent) {
    lastEvent = event;
    totalEvents += 1;
    listeners.forEach((l) => l(event));
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get last() {
    return lastEvent;
  },
  get count() {
    return totalEvents;
  },
};

type TableMap = Record<string, { keys: string[]; label: string }>;

const ACADEMIC_TREE_KEYS = [
  "levels",
  "subjects",
  "chapters",
  "academic-tree",
  "admin-academic-tree",
  "admin-levels",
  "admin-subjects",
  "admin-chapters",
  "sn-academic-tree",
  "student-academic-tree",
  "custom-exam-tree",
  "fc-tree",
  "qb-tree",
  "builder-subjects",
  "builder-chapters",
  "mock-filter-subjects",
] as const;

const STUDENT_AGGREGATE_KEYS = [
  "student-dashboard-snapshot",
  "student-dashboard",
  "student-daily-progress",
  "student-advanced-analytics",
  "student-performance-center",
  "student-completion-tracker",
] as const;

const TABLE_QUERY_KEYS: TableMap = {
  mcqs: {
    keys: [
      "mcqs",
      "mcq",
      "question-bank",
      "builder-mcqs",
      "admin-mcqs",
      "academic-chapter-mcqs",
      "quiz-mcq-pool",
      "bulk-existing-mcqs",
      "custom-exam-mcq-counts",
      "fc-chapter-counts",
      "fc-subject-counts",
      "qb-chapter-counts",
      "qb-subject-counts",
      "subject-progress",
      "chapter-progress",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "MCQs",
  },
  quizzes: {
    keys: [
      "quizzes",
      "quiz",
      "mock-tests",
      "mocks",
      "student-mocks",
      "admin-mocks",
      "admin-quizzes",
      "admin-academic-tree",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Quizzes",
  },
  quiz_questions: {
    keys: [
      "quizzes",
      "quiz",
      "mock-tests",
      "student-mocks",
      "admin-mocks",
      "mock-questions",
      "builder-mcqs",
      "admin-academic-tree",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Quiz questions",
  },
  short_notes: {
    keys: [
      "short-notes",
      "shortNotes",
      "public-short-notes",
      "sn-academic-tree",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Short notes",
  },
  short_notes_visibility: {
    keys: [
      "module-visibility",
      "short-notes",
      "shortNotes",
      "public-short-notes",
      "short-notes-visibility",
      "sn-academic-tree",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Notes visibility",
  },
  flash_cards: {
    keys: [
      "flash-cards",
      "flashCards",
      "public-flash-cards",
      "fc-chapter-counts",
      "fc-subject-counts",
      "fc-tree",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Flash cards",
  },
  flash_card_visibility: {
    keys: [
      "module-visibility",
      "flash-cards",
      "flashCards",
      "public-flash-cards",
      "flash-card-visibility",
      "fc-chapter-counts",
      "fc-subject-counts",
      "fc-tree",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Flash cards visibility",
  },
  video_classes: {
    keys: [
      "video-classes",
      "classes",
      "videoClasses",
      "public-video-classes",
      "student-academic-tree",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Classes",
  },
  video_class_visibility: {
    keys: [
      "module-visibility",
      "video-classes",
      "classes",
      "videoClasses",
      "public-video-classes",
      "video-class-visibility",
      "student-academic-tree",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Classes visibility",
  },
  question_bank_resources: {
    keys: [
      "question-bank",
      "qns-bank",
      "questionBank",
      "public-qb",
      "qbank-public",
      "qbank-admin",
      "qb-chapter-counts",
      "qb-subject-counts",
      "qb-tree",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Question bank",
  },
  question_bank_visibility: {
    keys: [
      "module-visibility",
      "question-bank",
      "qns-bank",
      "questionBank",
      "public-qb",
      "qbank-public",
      "qbank-admin",
      "question-bank-visibility",
      "qb-visibility",
      "qbank-visibility",
      "qb-chapter-counts",
      "qb-subject-counts",
      "qb-tree",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Question bank visibility",
  },
  notifications: {
    keys: [
      "notifications",
      "my-notifications",
      "admin-notifications",
      "admin-notif-stats",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Notifications",
  },
  notification_reads: {
    keys: [
      "notifications",
      "my-notifications",
      "admin-notifications",
      "admin-notif-stats",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Notifications",
  },
  levels: {
    keys: [...ACADEMIC_TREE_KEYS, "mock-filter-subjects", ...STUDENT_AGGREGATE_KEYS],
    label: "Levels",
  },
  subjects: {
    keys: [
      ...ACADEMIC_TREE_KEYS,
      "mock-filter-subjects",
      "subject-progress",
      "chapter-progress",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Subjects",
  },
  chapters: {
    keys: [
      ...ACADEMIC_TREE_KEYS,
      "builder-mcqs",
      "academic-chapter-mcqs",
      "custom-exam-mcq-counts",
      "fc-chapter-counts",
      "qb-chapter-counts",
      "subject-progress",
      "chapter-progress",
      ...STUDENT_AGGREGATE_KEYS,
    ],
    label: "Chapters",
  },
  profiles: { keys: ["profile", "profiles", "users"], label: "Profiles" },
  user_roles: { keys: ["users", "user-roles"], label: "Roles" },
  exam_attempts: {
    keys: [
      "exam-attempts",
      "analytics",
      "stats",
      "admin-quiz-stats",
      "student-dashboard-snapshot",
      "student-daily-progress",
      "student-performance-center",
      "student-completion-tracker",
      "subject-progress",
      "chapter-progress",
    ],
    label: "Attempts",
  },
  attempt_answers: {
    keys: [
      "student-daily-progress",
      "student-dashboard-snapshot",
      "student-performance-center",
      "student-completion-tracker",
      "subject-progress",
      "chapter-progress",
      "analytics",
    ],
    label: "Answers",
  },
  mcq_practice_progress: {
    keys: [
      "subject-progress",
      "chapter-progress",
      "student-daily-progress",
      "student-dashboard-snapshot",
      "student-performance-center",
      "student-completion-tracker",
      "analytics",
    ],
    label: "Practice progress",
  },
  mcq_bookmarks: {
    keys: [
      "student-daily-progress",
      "bookmarks",
      "mcq-bookmarks",
      "my-bookmark-ids",
      "mcq-review-counts",
      "student-dashboard-snapshot",
    ],
    label: "Bookmarks",
  },
  mcq_wrong_questions: {
    keys: [
      "student-daily-progress",
      "wrong-questions",
      "mcq-wrong",
      "mcq-wrong-questions",
      "mcq-review-counts",
      "student-dashboard-snapshot",
    ],
    label: "Wrong questions",
  },
  module_visibility: { keys: ["module-visibility"], label: "Module visibility" },
  user_goals: { keys: ["user-goals"], label: "Goals" },
  homepage_sections: {
    keys: ["site-content", "admin-sections", "admin-versions"],
    label: "Homepage content",
  },
  site_settings: {
    keys: ["site-settings", "admin-settings", "admin-versions"],
    label: "Site settings",
  },
  media_assets: { keys: ["admin-media"], label: "Media" },
  content_versions: { keys: ["admin-versions"], label: "Versions" },

  // ---------- Exam Batch module ----------
  // Every exam-batch query key (admin + student) starts with "exam-batch",
  // so a single top-level invalidation propagates to sessions, enrollments,
  // subject pickers, dashboard, leaderboard and progress views on both sides.
  exam_batch_sessions: {
    keys: ["exam-batch"],
    label: "Exam Batch sessions",
  },
  exam_batch_session_subjects: {
    keys: ["exam-batch"],
    label: "Exam Batch subjects",
  },
  exam_batch_enrollments: {
    keys: ["exam-batch"],
    label: "Exam Batch enrollments",
  },
  exam_batch_enrollment_subjects: {
    keys: ["exam-batch"],
    label: "Exam Batch enrollment subjects",
  },
};

export function useRealtimeInvalidator(enabled = true) {
  const qc = useQueryClient();
  const lastToastRef = useRef(0);
  const pendingKeysRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const queueInvalidation = (key: string) => {
      pendingKeysRef.current.add(key);
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        const keys = Array.from(pendingKeysRef.current);
        pendingKeysRef.current.clear();
        flushTimerRef.current = null;
        for (const queryKey of keys) {
          qc.invalidateQueries({ queryKey: [queryKey], refetchType: "active" });
        }
      }, 250);
    };

    const channel = supabase.channel(
      `global-realtime-invalidator-${Math.random().toString(36).slice(2, 8)}`,
    );

    for (const table of Object.keys(TABLE_QUERY_KEYS)) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table },
        (payload: { eventType: "INSERT" | "UPDATE" | "DELETE" }) => {
          const meta = TABLE_QUERY_KEYS[table];
          // De-dupe keys; queryKey: [key] with default exact:false already
          // matches every query whose key starts with [key], so the previous
          // predicate pass was redundant.
          const seen = new Set<string>();
          for (const key of meta.keys) {
            if (seen.has(key)) continue;
            seen.add(key);
            queueInvalidation(key);
          }

          const now = Date.now();
          realtimeBus.emit({ table, type: payload.eventType, at: now });

          // Throttle toasts so a burst of changes doesn't spam the screen.
          if (now - lastToastRef.current > 1500) {
            lastToastRef.current = now;
            toast.success(`${meta.label} updated`, {
              description: "Live sync just refreshed your view.",
              duration: 1800,
            });
          }
        },
      );
    }

    channel.subscribe();

    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingKeysRef.current.clear();
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}

/**
 * Tiny hook that re-renders whenever a realtime event fires.
 * Returns { count, last } so components can react to live activity.
 */
export function useRealtimeActivity() {
  return useSyncExternalStore(
    (cb) => realtimeBus.subscribe(cb),
    () => realtimeBus.count,
    () => 0,
  );
}
