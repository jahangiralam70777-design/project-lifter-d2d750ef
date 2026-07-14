const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api`;

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

const get = <T>(path: string, token?: string) => request<T>("GET", path, undefined, token);
const post = <T>(path: string, body: unknown, token?: string) =>
  request<T>("POST", path, body, token);

// H-2: API token storage hardening.
//
// Previously this module persisted the bearer token in `localStorage`,
// where it survived tab close and was readable by any script running on
// the origin (high XSS exfiltration impact). The token is now held in
// module memory with an optional sessionStorage mirror so it survives an
// in-tab reload but never leaks across tabs or persists across sessions.
//
// To migrate any caller that previously relied on cross-tab persistence,
// re-issue the token after sign-in via `setApiToken(...)`. Any legacy
// value still sitting in `localStorage` from earlier builds is removed
// on first read to ensure it is not silently re-used.
const TOKEN_KEY = "edumaster.api_token";
let inMemoryToken: string | undefined;

function purgeLegacyTokens() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

function getToken(): string | undefined {
  if (inMemoryToken) return inMemoryToken;
  if (typeof window === "undefined") return undefined;
  purgeLegacyTokens();
  try {
    const fromSession = window.sessionStorage.getItem(TOKEN_KEY) ?? undefined;
    if (fromSession) inMemoryToken = fromSession;
    return inMemoryToken;
  } catch {
    return inMemoryToken;
  }
}

export function setApiToken(token: string) {
  inMemoryToken = token;
  if (typeof window === "undefined") return;
  purgeLegacyTokens();
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* noop */
  }
}

export function clearApiToken() {
  inMemoryToken = undefined;
  if (typeof window === "undefined") return;
  purgeLegacyTokens();
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

export const api = {
  health: {
    get: () =>
      get<{
        status: string;
        service: string;
        version: string;
        supabase_configured: boolean;
        mode: "demo" | "live";
        timestamp: string;
      }>("/health"),
  },

  auth: {
    login: (email: string, password: string) =>
      post<{ token: string; user: ApiUser }>("/auth/login", { email, password }),
    logout: (token?: string) => post<{ ok: boolean }>("/auth/logout", {}, token ?? getToken()),
    me: (token?: string) => get<{ user: ApiUser }>("/auth/me", token ?? getToken()),
  },

  learning: {
    subjects: (token?: string) =>
      get<{ subjects: ApiSubject[] }>("/learning/subjects", token ?? getToken()),
    chapters: (subjectId: string, token?: string) =>
      get<{ chapters: ApiChapter[] }>(
        `/learning/subjects/${subjectId}/chapters`,
        token ?? getToken(),
      ),
    mcqs: (
      chapterId: string,
      params?: { limit?: number; offset?: number; difficulty?: string },
      token?: string,
    ) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.offset) q.set("offset", String(params.offset));
      if (params?.difficulty) q.set("difficulty", params.difficulty);
      return get<{ mcqs: ApiMcq[]; total: number }>(
        `/learning/chapters/${chapterId}/mcqs?${q}`,
        token ?? getToken(),
      );
    },
    submitAttempt: (mcqId: string, selectedOption: number, timeTakenMs?: number, token?: string) =>
      post<{
        ok: boolean;
        correct: boolean;
        correct_answer: number;
        explanation: string;
        xp_earned: number;
      }>(
        "/learning/attempts",
        { mcq_id: mcqId, selected_option: selectedOption, time_taken_ms: timeTakenMs },
        token ?? getToken(),
      ),
    performance: (token?: string) =>
      get<ApiStudentPerformance>("/learning/performance", token ?? getToken()),
  },

  admin: {
    dashboard: (token?: string) =>
      get<ApiDashboardSnapshot>("/admin/dashboard", token ?? getToken()),
    analytics: (token?: string) => get<ApiAnalytics>("/admin/analytics", token ?? getToken()),
    users: (params?: { role?: string; status?: string }, token?: string) => {
      const q = new URLSearchParams();
      if (params?.role) q.set("role", params.role);
      if (params?.status) q.set("status", params.status);
      return get<{ users: ApiUser[]; total: number }>(`/admin/users?${q}`, token ?? getToken());
    },
    subjects: (token?: string) =>
      get<{ subjects: ApiSubject[]; total: number }>("/admin/subjects", token ?? getToken()),
    createSubject: (name: string, level: string, token?: string) =>
      post<{ subject: ApiSubject }>("/admin/subjects", { name, level }, token ?? getToken()),
    mcqs: (
      params?: { subject_id?: string; chapter_id?: string; limit?: number; offset?: number },
      token?: string,
    ) => {
      const q = new URLSearchParams();
      if (params?.subject_id) q.set("subject_id", params.subject_id);
      if (params?.chapter_id) q.set("chapter_id", params.chapter_id);
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.offset) q.set("offset", String(params.offset));
      return get<{ mcqs: ApiMcq[]; total: number }>(`/admin/mcqs?${q}`, token ?? getToken());
    },
    createMcq: (data: Partial<ApiMcq>, token?: string) =>
      post<{ mcq: ApiMcq }>("/admin/mcqs", data, token ?? getToken()),
  },
};

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: "student" | "admin";
  status: string;
  joined: string;
};
export type ApiSubject = {
  id: string;
  name: string;
  level: string;
  chapter_count: number;
  mcq_count: number;
};
export type ApiChapter = {
  id: string;
  subject_id: string;
  name: string;
  order: number;
  mcq_count: number;
};
export type ApiMcq = {
  id: string;
  chapter_id: string;
  subject_id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  difficulty: string;
};
export type ApiDashboardSnapshot = {
  active_students: number;
  pending_drafts: number;
  live_exams: number;
  total_mcqs: number;
  new_registrations_today: number;
  attempts_today: number;
  recent_activity: { type: string; message: string; time: string }[];
};
export type ApiAnalytics = {
  registration_trend: { month: string; count: number }[];
  attempt_activity: { day: string; attempts: number }[];
  subject_performance: { subject: string; avg_score: number }[];
};
export type ApiStudentPerformance = {
  user_id: string;
  accuracy: number;
  streak_days: number;
  xp: number;
  success_rate: number;
  total_attempted: number;
  total_correct: number;
  weekly_scores: { day: string; score: number }[];
  subject_breakdown: { subject: string; correct: number; attempted: number; pct: number }[];
};
