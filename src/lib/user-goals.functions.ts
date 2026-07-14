// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UserGoals = {
  daily: number;
  weekly: number;
  monthly: number;
  /**
   * `true` when the `public.user_goals` table is missing on the project
   * (the SQL setup hasn't been run yet). The UI then transparently falls
   * back to localStorage persistence so nothing breaks.
   */
  fallback?: boolean;
};

export const DEFAULT_USER_GOALS: UserGoals = {
  daily: 20,
  weekly: 100,
  monthly: 400,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

const isMissingTableError = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  const msg = (err as { message?: string }).message ?? "";
  return code === "42P01" || /relation .* does not exist/i.test(msg);
};

/** Fetch the authenticated user's MCQ goals; returns defaults on first read. */
export const getUserGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserGoals> => {
    const { supabase, userId } = context;
    // Cast: the table is added by a one-time SQL migration the user runs;
    // it isn't in the generated Database typings yet.
    const sb = supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            maybeSingle: () => Promise<{
              data: {
                daily_mcqs: number | null;
                weekly_mcqs: number | null;
                monthly_mcqs: number | null;
              } | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string },
        ) => Promise<{ error: { message: string; code?: string } | null }>;
      };
    };
    const { data, error } = await sb
      .from("user_goals")
      .select("daily_mcqs,weekly_mcqs,monthly_mcqs")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return { ...DEFAULT_USER_GOALS, fallback: true };
      }
      throw new Error(error.message);
    }
    if (!data) return { ...DEFAULT_USER_GOALS };
    return {
      daily: data.daily_mcqs ?? DEFAULT_USER_GOALS.daily,
      weekly: data.weekly_mcqs ?? DEFAULT_USER_GOALS.weekly,
      monthly: data.monthly_mcqs ?? DEFAULT_USER_GOALS.monthly,
    };
  });

/** Upsert one or more of the authenticated user's MCQ goals. */
export const setUserGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { daily?: number; weekly?: number; monthly?: number }) => input)
  .handler(async ({ context, data }): Promise<UserGoals> => {
    const { supabase, userId } = context;
    const sb = supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            maybeSingle: () => Promise<{
              data: {
                daily_mcqs: number | null;
                weekly_mcqs: number | null;
                monthly_mcqs: number | null;
              } | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string },
        ) => Promise<{ error: { message: string; code?: string } | null }>;
      };
    };

    const { data: existing, error: readErr } = await sb
      .from("user_goals")
      .select("daily_mcqs,weekly_mcqs,monthly_mcqs")
      .eq("user_id", userId)
      .maybeSingle();

    if (readErr && !isMissingTableError(readErr)) {
      throw new Error(readErr.message);
    }
    if (readErr && isMissingTableError(readErr)) {
      return { ...DEFAULT_USER_GOALS, ...sanitize(data), fallback: true };
    }

    const next = {
      user_id: userId,
      daily_mcqs: clampInt(data.daily ?? existing?.daily_mcqs, 1, 500, DEFAULT_USER_GOALS.daily),
      weekly_mcqs: clampInt(
        data.weekly ?? existing?.weekly_mcqs,
        1,
        3000,
        DEFAULT_USER_GOALS.weekly,
      ),
      monthly_mcqs: clampInt(
        data.monthly ?? existing?.monthly_mcqs,
        1,
        10000,
        DEFAULT_USER_GOALS.monthly,
      ),
    };

    const { error: writeErr } = await sb.from("user_goals").upsert(next, { onConflict: "user_id" });

    if (writeErr) {
      if (isMissingTableError(writeErr)) {
        return {
          daily: next.daily_mcqs,
          weekly: next.weekly_mcqs,
          monthly: next.monthly_mcqs,
          fallback: true,
        };
      }
      throw new Error(writeErr.message);
    }
    return { daily: next.daily_mcqs, weekly: next.weekly_mcqs, monthly: next.monthly_mcqs };
  });

function sanitize(d: { daily?: number; weekly?: number; monthly?: number }): Partial<UserGoals> {
  const out: Partial<UserGoals> = {};
  if (d.daily !== undefined) out.daily = clampInt(d.daily, 1, 500, DEFAULT_USER_GOALS.daily);
  if (d.weekly !== undefined) out.weekly = clampInt(d.weekly, 1, 3000, DEFAULT_USER_GOALS.weekly);
  if (d.monthly !== undefined)
    out.monthly = clampInt(d.monthly, 1, 10000, DEFAULT_USER_GOALS.monthly);
  return out;
}
// -----------------------------------------------------------------------------
// Study routine goal targets (weekly / monthly minutes). Stored in the SAME
// user_goals table via extra columns to avoid a duplicate goals table.
// -----------------------------------------------------------------------------

export type StudyGoalTargets = {
  weeklyStudyMinutes: number;
  monthlyStudyMinutes: number;
  fallback?: boolean;
};

export const DEFAULT_STUDY_TARGETS: StudyGoalTargets = {
  weeklyStudyMinutes: 20 * 60,   // 20 h / week
  monthlyStudyMinutes: 100 * 60, // 100 h / month
};

const isMissingColumnError = (err: unknown): boolean => {
  const msg = (err as { message?: string })?.message ?? "";
  const code = (err as { code?: string })?.code;
  return code === "42703" || /column .* does not exist/i.test(msg);
};

export const getStudyGoalTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudyGoalTargets> => {
    const { supabase, userId } = context;
    const sb = supabase as any;
    const { data, error } = await sb
      .from("user_goals")
      .select("weekly_study_minutes,monthly_study_minutes")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) {
        return { ...DEFAULT_STUDY_TARGETS, fallback: true };
      }
      throw new Error(error.message);
    }
    return {
      weeklyStudyMinutes:
        data?.weekly_study_minutes ?? DEFAULT_STUDY_TARGETS.weeklyStudyMinutes,
      monthlyStudyMinutes:
        data?.monthly_study_minutes ?? DEFAULT_STUDY_TARGETS.monthlyStudyMinutes,
    };
  });

export const setStudyGoalTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (i: { weeklyStudyMinutes?: number; monthlyStudyMinutes?: number }) => i,
  )
  .handler(async ({ context, data }): Promise<StudyGoalTargets> => {
    const { supabase, userId } = context;
    const sb = supabase as any;
    const patch: Record<string, unknown> = { user_id: userId };
    if (typeof data.weeklyStudyMinutes === "number") {
      patch.weekly_study_minutes = clampInt(
        data.weeklyStudyMinutes,
        30,
        100_000,
        DEFAULT_STUDY_TARGETS.weeklyStudyMinutes,
      );
    }
    if (typeof data.monthlyStudyMinutes === "number") {
      patch.monthly_study_minutes = clampInt(
        data.monthlyStudyMinutes,
        60,
        500_000,
        DEFAULT_STUDY_TARGETS.monthlyStudyMinutes,
      );
    }
    const { error } = await sb
      .from("user_goals")
      .upsert(patch, { onConflict: "user_id" });
    if (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) {
        return {
          weeklyStudyMinutes:
            (patch.weekly_study_minutes as number) ??
            DEFAULT_STUDY_TARGETS.weeklyStudyMinutes,
          monthlyStudyMinutes:
            (patch.monthly_study_minutes as number) ??
            DEFAULT_STUDY_TARGETS.monthlyStudyMinutes,
          fallback: true,
        };
      }
      throw new Error(error.message);
    }
    const { data: row } = await sb
      .from("user_goals")
      .select("weekly_study_minutes,monthly_study_minutes")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      weeklyStudyMinutes:
        row?.weekly_study_minutes ?? DEFAULT_STUDY_TARGETS.weeklyStudyMinutes,
      monthlyStudyMinutes:
        row?.monthly_study_minutes ?? DEFAULT_STUDY_TARGETS.monthlyStudyMinutes,
    };
  });
