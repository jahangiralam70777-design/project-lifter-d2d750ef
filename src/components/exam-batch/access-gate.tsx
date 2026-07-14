import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Home,
  LayoutDashboard,
  ListChecks,
  CalendarClock,
  Trophy,
  LineChart,
  History,
} from "lucide-react";
import {
  listAvailableExamBatchSessions,
  getExamBatchAccess,
  listMyExamBatchEnrollments,
} from "@/lib/exam-batch/student-enrollment.functions";
import { useExamBatchFlow } from "./flow-store";
import { useExamBatchVisibility } from "@/hooks/use-exam-batch-visibility";
import type { SubNavItem } from "./kit";
import type { ExamBatchEnrollmentRow } from "@/lib/exam-batch/types";

/**
 * SINGLE SOURCE OF TRUTH for the student's exam-batch enrollment state.
 *
 * Every student-facing exam-batch component reads from this hook — never
 * from a duplicate `useQuery` on the same keys. The layout mounts it once,
 * so `refetchType: "active"` invalidations from Supabase Realtime cause
 * exactly one refetch (not one per page/component).
 *
 * `placeholderData: keepPreviousData` means when Realtime invalidates the
 * queries after an admin approval, the current page keeps rendering with
 * the previous data while the new data streams in. No flicker, no blank
 * screen, no unmount.
 */
export function useExamBatchAccess() {
  const { state } = useExamBatchFlow();

  const sessionsQuery = useQuery({
    queryKey: ["exam-batch", "student", "sessions"],
    queryFn: () => listAvailableExamBatchSessions({ data: {} }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const enrollmentsQuery = useQuery({
    queryKey: ["exam-batch", "student", "my-enrollments"],
    queryFn: () => listMyExamBatchEnrollments({ data: {} }),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const sessions = sessionsQuery.data ?? [];
  const enrollments: ExamBatchEnrollmentRow[] = enrollmentsQuery.data ?? [];

  const currentEnrollment = useMemo(() => {
    if (!enrollments.length) return null;
    return (
      enrollments.find((e) => e.status === "approved") ??
      enrollments.find((e) => e.status === "pending") ??
      enrollments[0]
    );
  }, [enrollments]);

  const current = useMemo(() => {
    if (currentEnrollment) {
      const match = sessions.find((s) => s.id === currentEnrollment.session_id);
      if (match) return match;
    }
    if (state.sessionId) {
      const match = sessions.find((s) => s.id === state.sessionId);
      if (match) return match;
    }
    return sessions.find((s) => s.status === "active") ?? sessions[0] ?? null;
  }, [sessions, currentEnrollment, state.sessionId]);

  // IMPORTANT: derive sessionId DIRECTLY from the enrollment, not filtered
  // through the visible-sessions list. Otherwise, if the enrolled session is
  // archived/hidden/inactive (and therefore excluded from
  // listAvailableExamBatchSessions), sessionId would fall back to a
  // different session — accessQuery would then return
  // canAccessDashboard=false, and the layout would render the Session
  // selection screen for an already-approved student.
  const sessionId =
    currentEnrollment?.session_id ?? current?.id ?? state.sessionId ?? null;

  const accessQuery = useQuery({
    queryKey: ["exam-batch", "student", "access", sessionId],
    queryFn: () => getExamBatchAccess({ data: { sessionId: sessionId as string } }),
    enabled: !!sessionId,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const canAccessDashboard = accessQuery.data?.canAccessDashboard ?? false;
  const studentId = accessQuery.data?.studentId ?? null;
  const enrollmentStatus =
    accessQuery.data?.status ?? currentEnrollment?.status ?? null;

  // Only report `isLoading` on the very first fetch. Background refetches
  // triggered by Realtime must NOT flip loading → true, or every child
  // page will flash a spinner mid-approval.
  //
  // Access decision depends on enrollments + access RPC only. sessionsQuery
  // is used purely to render the `session` object; do NOT block the gate on
  // it, otherwise the layout keeps spinning until sessions load and then
  // briefly reveals whichever route is under the URL (Session selection)
  // before the redirect fires.
  const isLoading =
    (enrollmentsQuery.isLoading && !enrollmentsQuery.data) ||
    (!!sessionId && accessQuery.isLoading && !accessQuery.data);

  return {
    sessionId,
    session: current,
    enrollment: currentEnrollment,
    enrollmentStatus,
    canAccessDashboard,
    studentId,
    isLoading,
    isError:
      sessionsQuery.isError || enrollmentsQuery.isError || accessQuery.isError,
  };
}

/** Nav shown BEFORE admin approval. */
const preApprovalNav: SubNavItem[] = [
  { title: "Sessions", to: "/exam-batch/sessions", icon: Home },
];

/** Nav shown AFTER admin approval. */
const postApprovalNav: SubNavItem[] = [
  { title: "Dashboard", to: "/exam-batch/dashboard", icon: LayoutDashboard },
  { title: "Available Exams", to: "/exam-batch/available", icon: ListChecks },
  { title: "Upcoming Exams", to: "/exam-batch/upcoming", icon: CalendarClock },
  { title: "Leaderboard", to: "/exam-batch/leaderboard", icon: Trophy },
  { title: "Progress", to: "/exam-batch/progress", icon: LineChart },
  { title: "History", to: "/exam-batch/history", icon: History },
];

export function useExamBatchStudentNav(): SubNavItem[] {
  const { canAccessDashboard } = useExamBatchAccess();
  const { moduleVisible } = useExamBatchVisibility();
  return useMemo(
    () => (!moduleVisible ? [] : canAccessDashboard ? postApprovalNav : preApprovalNav),
    [canAccessDashboard, moduleVisible],
  );
}

/**
 * Post-approval pages call this to read the `ready` flag. It does NOT
 * navigate — the layout at `src/routes/_student.exam-batch.tsx` is the
 * single place that redirects. This keeps redirect logic centralized and
 * prevents the "multiple components racing to navigate" flicker.
 */
export function useRequireExamBatchApproval(): { ready: boolean } {
  const { canAccessDashboard, isLoading } = useExamBatchAccess();
  const { moduleVisible, isLoading: visibilityLoading } = useExamBatchVisibility();
  return { ready: !isLoading && !visibilityLoading && moduleVisible && canAccessDashboard };
}
