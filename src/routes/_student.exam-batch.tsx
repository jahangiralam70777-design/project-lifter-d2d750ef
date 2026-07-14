import { createFileRoute, redirect } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExamBatchLayout } from "@/components/exam-batch/layout";
import { useExamBatchStudentNav } from "@/components/exam-batch/access-gate";
import { StudentExamBatchBanPage } from "@/components/exam-batch/student-ban-page";
import {
  listMyExamBatchEnrollments,
  getExamBatchAccess,
} from "@/lib/exam-batch/student-enrollment.functions";
import { getExamBatchAccessState } from "@/lib/exam-batch/student-attendance.functions";
import { getExamBatchPublicSettings } from "@/lib/exam-batch/public-settings.functions";
import type { ExamBatchEnrollmentRow } from "@/lib/exam-batch/types";

// Paths that only make sense BEFORE approval.
const PRE_APPROVAL_PATHS = new Set<string>([
  "/exam-batch",
  "/exam-batch/",
  "/exam-batch/sessions",
  "/exam-batch/subjects",
  "/exam-batch/enrollment",
  "/exam-batch/pending",
]);

// Paths that require approval to reach.
const POST_APPROVAL_PREFIXES = [
  "/exam-batch/dashboard",
  "/exam-batch/available",
  "/exam-batch/upcoming",
  "/exam-batch/leaderboard",
  "/exam-batch/progress",
  "/exam-batch/history",
];

function normalize(p: string) {
  const n = p.replace(/\/+$/, "");
  return n === "" ? "/" : n;
}

/**
 * Pick the "current" enrollment the same way `useExamBatchAccess` does:
 * prefer approved, then pending, then most-recent.
 */
function pickCurrentEnrollment(
  rows: ExamBatchEnrollmentRow[],
): ExamBatchEnrollmentRow | null {
  if (!rows.length) return null;
  return (
    rows.find((e) => e.status === "approved") ??
    rows.find((e) => e.status === "pending") ??
    rows[0]
  );
}

function StudentExamBatchLayout() {
  const nav = useExamBatchStudentNav();

  // Attendance / ban gate — realtime invalidations on
  // exam_batch_attendance_state (see use-exam-batch-realtime.ts) flip this
  // instantly for the affected student, no manual refresh required.
  const banStateQuery = useQuery({
    queryKey: ["exam-batch", "student", "access", "ban-state"],
    queryFn: () => getExamBatchAccessState(),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
  const banDecision = banStateQuery.data;

  // Banned students see ONLY the ban screen inside the Exam Batch module.
  // The rest of the website (Dashboard, Quiz, Mock, MCQ Practice, etc.)
  // remains fully accessible.
  if (banDecision?.banned) {
    return (
      <ExamBatchLayout nav={[]}>
        <StudentExamBatchBanPage decision={banDecision} />
      </ExamBatchLayout>
    );
  }

  // Approval-driven redirects happen in `beforeLoad` (below) so the child
  // route never mounts on the wrong page. No spinner, no flash, no
  // useEffect race.
  return <ExamBatchLayout nav={nav} />;
}

export const Route = createFileRoute("/_student/exam-batch")({
  // Keep the current page rendered while `router.invalidate()` (triggered
  // by realtime enrollment-status changes) re-runs this beforeLoad and
  // resolves a redirect. Without this, TanStack Router swaps the mounted
  // layout for `defaultPendingComponent` once the transition exceeds
  // `defaultPendingMs` (300ms) — producing a visible blank/spinner flash
  // between the old page and the destination. A very large `pendingMs`
  // makes the router hold the previous match on-screen until the
  // destination is fully ready. Data staleness is handled by
  // `keepPreviousData` on the underlying queries, so nothing shows stale
  // state to a user who was just approved/pended/rejected/removed —
  // the redirect completes before any user action is possible.
  pendingMs: Number.MAX_SAFE_INTEGER,
  pendingMinMs: 0,
  // Runs BEFORE any child route mounts. Because `_student` is `ssr:false`,
  // this runs client-side with access to the authenticated Supabase
  // session. We throw `redirect()` here — TanStack Router applies the
  // redirect before rendering, so the Session page never appears for an
  // approved student.
  beforeLoad: async ({ context, location }) => {
    const here = normalize(location.pathname);

    // 1) Module visibility (admin can hide Exam Batch entirely). Uses the
    //    same queryKey as `useExamBatchVisibility` so there is no duplicate
    //    request — the cached value is reused everywhere.
    const settings = await context.queryClient.ensureQueryData({
      queryKey: ["exam-batch", "public-settings"],
      queryFn: () => getExamBatchPublicSettings(),
      staleTime: 30_000,
    });
    if (settings?.moduleVisible === false) {
      if (here !== "/dashboard") throw redirect({ to: "/dashboard", replace: true });
      return;
    }

    // 2) Load the student's enrollments (cached; shared with
    //    `useExamBatchAccess` via the same queryKey so no duplicate fetch).
    // NOTE: we use `fetchQuery` (not `ensureQueryData`) for the
    // enrollment + access queries because these drive the authoritative
    // pending ↔ approved ↔ rejected redirect. `ensureQueryData` returns
    // stale-but-cached data immediately; when Supabase Realtime marks
    // these keys stale after an admin status change and the exam-batch
    // realtime hook calls `router.invalidate()`, we MUST see fresh data
    // this run so `beforeLoad` can redirect on the same tick. `fetchQuery`
    // refetches when stale, still returns cache when fresh — no extra
    // network cost during normal navigation.
    const enrollments = await context.queryClient.fetchQuery({
      queryKey: ["exam-batch", "student", "my-enrollments"],
      queryFn: () => listMyExamBatchEnrollments({ data: {} }),
      staleTime: 15_000,
    });

    const currentEnrollment = pickCurrentEnrollment(enrollments ?? []);
    const sessionId = currentEnrollment?.session_id ?? null;

    // 3) Authoritative approval decision (status=approved + student_id set).
    //    Only queried when we have a candidate session — otherwise the user
    //    has no enrollment at all and must see the Session picker.
    let canAccessDashboard = false;
    let enrollmentStatus: string | null = currentEnrollment?.status ?? null;
    if (sessionId) {
      const access = await context.queryClient.fetchQuery({
        queryKey: ["exam-batch", "student", "access", sessionId],
        queryFn: () => getExamBatchAccess({ data: { sessionId } }),
        staleTime: 15_000,
      });
      canAccessDashboard = access?.canAccessDashboard ?? false;
      enrollmentStatus = access?.status ?? enrollmentStatus;
    }

    const inPostArea = POST_APPROVAL_PREFIXES.some((p) => here.startsWith(p));

    if (canAccessDashboard) {
      // Approved + Student ID assigned → Dashboard is the only entry point.
      // The Session / Subjects / Enrollment / Pending screens are hidden
      // forever for this student unless approval is revoked server-side.
      if (PRE_APPROVAL_PATHS.has(here)) {
        throw redirect({ to: "/exam-batch/dashboard", replace: true });
      }
      return;
    }

    if (currentEnrollment && enrollmentStatus === "pending") {
      // Enrolled but awaiting admin approval.
      if (
        inPostArea ||
        here === "/exam-batch/subjects" ||
        here === "/exam-batch/enrollment"
      ) {
        throw redirect({ to: "/exam-batch/pending", replace: true });
      }
      return;
    }

    // Not enrolled / rejected / revoked → Session selection is the only
    // valid entry point.
    if (inPostArea || here === "/exam-batch/pending") {
      throw redirect({ to: "/exam-batch/sessions", replace: true });
    }
  },
  component: StudentExamBatchLayout,
  head: () => ({
    meta: [
      { title: "Exam Batch · CA Aspire BD" },
      { name: "description", content: "Your cohort-based exam preparation hub — sessions, subjects, exams and leaderboard." },
      { property: "og:title", content: "Exam Batch · CA Aspire BD" },
      { property: "og:description", content: "Cohort exam prep with live leaderboards and progress tracking." },
    ],
  }),
});
