import type { SessionCardData } from "./kit";

const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

export const mockSessions: SessionCardData[] = [
  {
    id: "s-aug-26",
    title: "August 2026 Exam Batch",
    subtitle: "CA Foundation · Level 1 cohort",
    status: "active",
    registrationOpen: true,
    totalStudents: 1284,
    startsAt: inDays(42),
    registrationDeadline: inDays(14),
    subjectsCount: 4,
    isCurrent: true,
  },
  {
    id: "s-may-26",
    title: "May 2026 Exam Batch",
    subtitle: "CA Foundation · Fast-track cohort",
    status: "live",
    registrationOpen: false,
    totalStudents: 964,
    startsAt: inDays(3),
    subjectsCount: 4,
  },
  {
    id: "s-nov-26",
    title: "November 2026 Exam Batch",
    subtitle: "CA Intermediate · Group I",
    status: "upcoming",
    registrationOpen: true,
    totalStudents: 512,
    startsAt: inDays(120),
    registrationDeadline: inDays(60),
    subjectsCount: 8,
  },
  {
    id: "s-feb-26",
    title: "February 2026 Exam Batch",
    subtitle: "Revision · Final week",
    status: "ended",
    registrationOpen: false,
    totalStudents: 1731,
    startsAt: inDays(-5),
    subjectsCount: 4,
  },
];

export type EnrollmentRow = {
  id: string;
  student: string;
  email: string;
  session: string;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
};

export const mockEnrollments: EnrollmentRow[] = [
  {
    id: "e1",
    student: "Rahim Uddin",
    email: "rahim@example.com",
    session: "Aug 2026",
    submittedAt: "2h ago",
    status: "pending",
  },
  {
    id: "e2",
    student: "Sadia Rahman",
    email: "sadia@example.com",
    session: "Aug 2026",
    submittedAt: "5h ago",
    status: "approved",
  },
  {
    id: "e3",
    student: "Tanvir Alam",
    email: "tanvir@example.com",
    session: "Nov 2026",
    submittedAt: "1d ago",
    status: "pending",
  },
  {
    id: "e4",
    student: "Maria Chowdhury",
    email: "maria@example.com",
    session: "Aug 2026",
    submittedAt: "1d ago",
    status: "rejected",
  },
  {
    id: "e5",
    student: "Faisal Karim",
    email: "faisal@example.com",
    session: "Nov 2026",
    submittedAt: "2d ago",
    status: "approved",
  },
];

export type StudentRow = {
  id: string;
  name: string;
  email: string;
  batch: string;
  progress: number;
  status: "active" | "pending" | "closed";
};

export const mockStudents: StudentRow[] = [
  {
    id: "u1",
    name: "Rahim Uddin",
    email: "rahim@example.com",
    batch: "August 2026",
    progress: 82,
    status: "active",
  },
  {
    id: "u2",
    name: "Sadia Rahman",
    email: "sadia@example.com",
    batch: "August 2026",
    progress: 64,
    status: "active",
  },
  {
    id: "u3",
    name: "Tanvir Alam",
    email: "tanvir@example.com",
    batch: "November 2026",
    progress: 22,
    status: "pending",
  },
  {
    id: "u4",
    name: "Faisal Karim",
    email: "faisal@example.com",
    batch: "November 2026",
    progress: 48,
    status: "active",
  },
  {
    id: "u5",
    name: "Nusrat Jahan",
    email: "nusrat@example.com",
    batch: "May 2026",
    progress: 95,
    status: "closed",
  },
];

export type ExamRow = {
  id: string;
  title: string;
  session: string;
  date: string;
  duration: string;
  status: "upcoming" | "live" | "ended";
};

export const mockExams: ExamRow[] = [
  {
    id: "x1",
    title: "Weekly Mock — Accounting",
    session: "August 2026",
    date: inDays(2),
    duration: "180 min",
    status: "upcoming",
  },
  {
    id: "x2",
    title: "Weekly Mock — Business Law",
    session: "August 2026",
    date: inDays(0),
    duration: "150 min",
    status: "live",
  },
  {
    id: "x3",
    title: "Grand Test 01",
    session: "May 2026",
    date: inDays(-3),
    duration: "240 min",
    status: "ended",
  },
  {
    id: "x4",
    title: "Chapter Test — Cost Accounting",
    session: "November 2026",
    date: inDays(9),
    duration: "90 min",
    status: "upcoming",
  },
];

export type LeaderRow = {
  id: string;
  rank: number;
  name: string;
  batch: string;
  score: number;
  accuracy: number;
};

export const mockLeaderboard: LeaderRow[] = [
  { id: "l1", rank: 1, name: "Nusrat Jahan", batch: "Aug 2026", score: 984, accuracy: 92 },
  { id: "l2", rank: 2, name: "Rahim Uddin", batch: "Aug 2026", score: 951, accuracy: 89 },
  { id: "l3", rank: 3, name: "Sadia Rahman", batch: "Aug 2026", score: 927, accuracy: 87 },
  { id: "l4", rank: 4, name: "Faisal Karim", batch: "Nov 2026", score: 902, accuracy: 84 },
  { id: "l5", rank: 5, name: "Tanvir Alam", batch: "Nov 2026", score: 871, accuracy: 82 },
];

export type SubjectMeta = {
  id: string;
  name: string;
  chapters: number;
  progress: number;
  description: string;
  examCount: number;
  enrolled: number;
  iconKey: "accounting" | "law" | "economics" | "quant" | "cost" | "audit";
};

export const mockSubjects: SubjectMeta[] = [
  {
    id: "sub-1",
    name: "Financial Accounting",
    chapters: 18,
    progress: 62,
    description: "Journals, ledgers, final accounts and standards.",
    examCount: 12,
    enrolled: 1104,
    iconKey: "accounting",
  },
  {
    id: "sub-2",
    name: "Business Law",
    chapters: 14,
    progress: 41,
    description: "Contract Act, Sale of Goods, Partnership essentials.",
    examCount: 9,
    enrolled: 986,
    iconKey: "law",
  },
  {
    id: "sub-3",
    name: "Business Economics",
    chapters: 12,
    progress: 73,
    description: "Micro & macro fundamentals with applied problems.",
    examCount: 10,
    enrolled: 872,
    iconKey: "economics",
  },
  {
    id: "sub-4",
    name: "Quantitative Aptitude",
    chapters: 16,
    progress: 55,
    description: "Ratios, statistics, calculus and business math.",
    examCount: 11,
    enrolled: 913,
    iconKey: "quant",
  },
];

export const mockDownloads = [
  { id: "d1", title: "Aug 2026 · Study Plan.pdf", size: "1.4 MB", date: "10 Jul 2026" },
  { id: "d2", title: "Weekly Mock 03 · Answer Key.pdf", size: "820 KB", date: "08 Jul 2026" },
  { id: "d3", title: "Formula Booklet · Accounting.pdf", size: "2.1 MB", date: "02 Jul 2026" },
  { id: "d4", title: "Revision Sheet · Business Law.pdf", size: "670 KB", date: "28 Jun 2026" },
];

export type ActivityItem = {
  id: string;
  who: string;
  action: string;
  target: string;
  at: string;
  kind: "enroll" | "exam" | "session" | "system";
};

export const mockActivities: ActivityItem[] = [
  {
    id: "a1",
    who: "Sadia Rahman",
    action: "was approved for",
    target: "August 2026 batch",
    at: "just now",
    kind: "enroll",
  },
  {
    id: "a2",
    who: "Admin",
    action: "published",
    target: "Weekly Mock 04",
    at: "12 min ago",
    kind: "exam",
  },
  {
    id: "a3",
    who: "Tanvir Alam",
    action: "submitted enrollment for",
    target: "November 2026 batch",
    at: "1h ago",
    kind: "enroll",
  },
  {
    id: "a4",
    who: "System",
    action: "auto-archived",
    target: "Feb 2026 batch",
    at: "3h ago",
    kind: "system",
  },
  {
    id: "a5",
    who: "Admin",
    action: "created",
    target: "Grand Test 02",
    at: "5h ago",
    kind: "session",
  },
  {
    id: "a6",
    who: "Faisal Karim",
    action: "completed",
    target: "Weekly Mock 03",
    at: "6h ago",
    kind: "exam",
  },
];

export type SessionRow = {
  id: string;
  name: string;
  level: "Foundation" | "Intermediate" | "Final";
  regStatus: "open" | "closed";
  examStatus: "live" | "upcoming" | "ended";
  students: number;
  subjects: number;
  createdAt: string;
};

export const mockSessionRows: SessionRow[] = [
  {
    id: "sr1",
    name: "August 2026 Exam Batch",
    level: "Foundation",
    regStatus: "open",
    examStatus: "upcoming",
    students: 1284,
    subjects: 4,
    createdAt: "12 May 2026",
  },
  {
    id: "sr2",
    name: "May 2026 Exam Batch",
    level: "Foundation",
    regStatus: "closed",
    examStatus: "live",
    students: 964,
    subjects: 4,
    createdAt: "02 Feb 2026",
  },
  {
    id: "sr3",
    name: "November 2026 Exam Batch",
    level: "Intermediate",
    regStatus: "open",
    examStatus: "upcoming",
    students: 512,
    subjects: 8,
    createdAt: "20 Jun 2026",
  },
  {
    id: "sr4",
    name: "February 2026 Exam Batch",
    level: "Foundation",
    regStatus: "closed",
    examStatus: "ended",
    students: 1731,
    subjects: 4,
    createdAt: "18 Sep 2025",
  },
  {
    id: "sr5",
    name: "May 2027 Exam Batch",
    level: "Final",
    regStatus: "closed",
    examStatus: "upcoming",
    students: 0,
    subjects: 8,
    createdAt: "10 Jul 2026",
  },
];

export type ExamCardData = {
  id: string;
  subject: string;
  chapter: string;
  questions: number;
  duration: string;
  availableAt: string;
  upcomingAt: string;
  status: "live" | "upcoming" | "ended";
};

export const mockExamCards: ExamCardData[] = [
  {
    id: "ec1",
    subject: "Financial Accounting",
    chapter: "Ch. 4 · Depreciation",
    questions: 60,
    duration: "90 min",
    availableAt: "Today, 10:00",
    upcomingAt: "Today, 13:00",
    status: "live",
  },
  {
    id: "ec2",
    subject: "Business Law",
    chapter: "Ch. 7 · Contracts",
    questions: 45,
    duration: "60 min",
    availableAt: "Tomorrow, 09:00",
    upcomingAt: "Tomorrow, 11:00",
    status: "upcoming",
  },
  {
    id: "ec3",
    subject: "Economics",
    chapter: "Ch. 2 · Demand",
    questions: 50,
    duration: "75 min",
    availableAt: "Sat, 10:00",
    upcomingAt: "Sat, 12:00",
    status: "upcoming",
  },
  {
    id: "ec4",
    subject: "Quantitative Aptitude",
    chapter: "Ch. 3 · Ratios",
    questions: 40,
    duration: "60 min",
    availableAt: "Yesterday",
    upcomingAt: "—",
    status: "ended",
  },
  {
    id: "ec5",
    subject: "Cost Accounting",
    chapter: "Ch. 6 · Costing",
    questions: 55,
    duration: "80 min",
    availableAt: "Fri, 15:00",
    upcomingAt: "Fri, 17:00",
    status: "upcoming",
  },
  {
    id: "ec6",
    subject: "Auditing",
    chapter: "Ch. 1 · Basics",
    questions: 35,
    duration: "50 min",
    availableAt: "—",
    upcomingAt: "Mon, 10:00",
    status: "upcoming",
  },
];

export type DownloadKind =
  | "leaderboard-pdf"
  | "leaderboard-txt"
  | "report"
  | "attendance"
  | "results";
export type DownloadCard = {
  id: string;
  title: string;
  description: string;
  kind: DownloadKind;
  size: string;
  updated: string;
};

export const mockDownloadCards: DownloadCard[] = [
  {
    id: "dc1",
    title: "Leaderboard · August 2026",
    description: "Ranked standings across all exams",
    kind: "leaderboard-pdf",
    size: "1.8 MB",
    updated: "10 Jul",
  },
  {
    id: "dc2",
    title: "Leaderboard · Plain Text",
    description: "Machine-readable rankings",
    kind: "leaderboard-txt",
    size: "42 KB",
    updated: "10 Jul",
  },
  {
    id: "dc3",
    title: "Batch Performance Report",
    description: "Full analytics report for admins",
    kind: "report",
    size: "3.2 MB",
    updated: "08 Jul",
  },
  {
    id: "dc4",
    title: "Attendance Register",
    description: "Session-wise attendance sheet",
    kind: "attendance",
    size: "980 KB",
    updated: "07 Jul",
  },
  {
    id: "dc5",
    title: "Exam Results Archive",
    description: "All results for the current cohort",
    kind: "results",
    size: "5.1 MB",
    updated: "05 Jul",
  },
  {
    id: "dc6",
    title: "Grand Test · Results",
    description: "Detailed answer-wise results",
    kind: "results",
    size: "2.4 MB",
    updated: "02 Jul",
  },
];
