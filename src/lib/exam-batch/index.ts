// Barrel exports so consumers do not need to know the internal file split.
// Keep this list stable — the Exam Batch UI imports from here.

export * from "./types";
export * from "./errors";
export * from "./admin-sessions.functions";
export * from "./admin-enrollments.functions";
export * from "./student-enrollment.functions";

// Exam Engine (isolated sub-module)
export * from "./exam-engine.types";
export * from "./admin-exams.functions";
export * from "./student-exam.functions";

// Result / Ranking / Leaderboard / Progress / Analytics (isolated sub-module)
export * from "./results.types";
export * from "./student-results.functions";
export * from "./admin-results.functions";

// Settings / Content / Visibility / Comment Rules / Exports (final backend phase)
export * from "./settings.types";
export * from "./admin-settings.functions";
export * from "./public-settings.functions";
export * from "./admin-exports.functions";

// Attendance Enforcement (isolated sub-module)
export * from "./attendance.types";
export * from "./admin-attendance.functions";
export * from "./student-attendance.functions";
