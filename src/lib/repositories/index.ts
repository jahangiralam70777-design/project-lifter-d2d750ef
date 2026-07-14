/**
 * Repository layer barrel.
 *
 * This is the migration target for ad-hoc `supabase.from(...)` / `.rpc(...)`
 * calls scattered through the codebase. New features should import data
 * functions from here, not from `@/integrations/supabase/client` directly.
 *
 * Existing `*.functions.ts` files in `src/lib/` already act as repositories
 * for their domains (admin-mcq, admin-users, blog, etc.). They are
 * re-exported here so callers have a single entry point.
 *
 * When the production database is connected, only the bodies of these
 * functions change — call sites do not.
 */

export * as Blog from "../blog.functions";
export * as Profile from "../profile.functions";
export * as Notifications from "../admin-notifications.functions";
export * as StudentDashboard from "../student-dashboard.functions";
export * as StudentDailyProgress from "../student-daily-progress.functions";
export * as StudentPerformance from "../student-performance.functions";
export * as StudentAdvancedAnalytics from "../student-advanced-analytics.functions";
export * as Learning from "../learning.functions";
export * as McqReview from "../mcq-review.functions";
export * as MockLeaderboard from "../mock-leaderboard.functions";
export * as ModuleVisibility from "../module-visibility.functions";
export * as SitePages from "../site-pages.functions";
export * as SiteManagement from "../site-management.functions";
export * as StudyTracker from "../study-tracker.functions";
export * as UserActivity from "../user-activity.functions";
export * as UserGoals from "../user-goals.functions";

// Admin namespace
export * as AdminAcademic from "../admin-academic.functions";
export * as AdminAnalytics from "../admin-analytics.functions";
export * as AdminDashboard from "../admin-dashboard.functions";
export * as AdminDatabase from "../admin-database.functions";
export * as AdminDatabaseInspect from "../admin-database-inspect.functions";
export * as AdminFlashCards from "../admin-flash-cards.functions";
export * as AdminMcq from "../admin-mcq.functions";
export * as AdminMock from "../admin-mock.functions";
export * as AdminNotifications from "../admin-notifications.functions";
export * as AdminQuestionBank from "../admin-question-bank.functions";
export * as AdminQuiz from "../admin-quiz.functions";
export * as AdminRolePermissions from "../admin-role-permissions.functions";
export * as AdminSearch from "../admin-search.functions";
export * as AdminShortNotes from "../admin-short-notes.functions";
export * as AdminSystemHealth from "../admin-system-health.functions";
export * as AdminUserAnalytics from "../admin-user-analytics-service.functions";
export * as AdminUserCenter from "../admin-user-center.functions";
export * as AdminUsers from "../admin-users.functions";
export * as AdminUsersExtra from "../admin-users-extra.functions";
export * as AdminVerify from "../admin-verify.functions";
export * as AdminVideoClasses from "../admin-video-classes.functions";
