// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizeChoice(value: string | null | undefined) {
  const v = (value ?? "").trim().toUpperCase();
  return v === "A" || v === "B" || v === "C" || v === "D" ? v : null;
}

/* ------------------------------------------------------------------ */
/*  Bookmarks                                                          */
/* ------------------------------------------------------------------ */

const toggleBookmarkSchema = z.object({
  mcqId: z.string().uuid(),
  bookmarked: z.boolean(),
  chapterId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  level: z.string().trim().max(40).nullable().optional(),
});

export const toggleMcqBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof toggleBookmarkSchema>) => toggleBookmarkSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.bookmarked) {
      const { error } = await supabase.from("mcq_bookmarks").upsert(
        {
          user_id: userId,
          mcq_id: data.mcqId,
          chapter_id: data.chapterId ?? null,
          subject_id: data.subjectId ?? null,
          level: data.level ?? null,
        },
        { onConflict: "user_id,mcq_id" },
      );
      if (error) throw error;
      return { bookmarked: true };
    }
    const { error } = await supabase
      .from("mcq_bookmarks")
      .delete()
      .eq("user_id", userId)
      .eq("mcq_id", data.mcqId);
    if (error) throw error;
    return { bookmarked: false };
  });

export const listMyBookmarkIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("mcq_bookmarks")
      .select("mcq_id")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((r) => r.mcq_id as string);
  });

/* ------------------------------------------------------------------ */
/*  Wrong-question tracking helpers                                    */
/* ------------------------------------------------------------------ */

const recordOutcomesSchema = z.object({
  level: z.string().trim().max(40).nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  chapterId: z.string().uuid().nullable().optional(),
  outcomes: z
    .array(
      z.object({
        mcqId: z.string().uuid(),
        chosen: z.enum(["A", "B", "C", "D"]).nullable(),
      }),
    )
    .max(500),
});

/**
 * Record per-question outcomes from a finished MCQ practice session.
 * - Wrong answers → upsert into mcq_wrong_questions (increment retry on repeat).
 * - Correct answers for previously-wrong MCQs → mark mastered=true.
 */
export const recordMcqOutcomes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof recordOutcomesSchema>) => recordOutcomesSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.outcomes.length) return { wrong: 0, mastered: 0 };

    // SECURITY: derive correctness server-side. Never trust client-supplied
    // `isCorrect` / `correctOption` — would let any student mark MCQs as
    // mastered without answering. Fetch authoritative answers from `mcqs`.
    const allIds = Array.from(new Set(data.outcomes.map((o) => o.mcqId)));
    const { data: mcqRows } = await supabase
      .from("mcqs")
      .select("id,correct_option,status")
      .in("id", allIds);
    const answerMap = new Map(
      ((mcqRows ?? []) as Array<{ id: string; correct_option: string; status: string }>)
        .filter((r) => r.status === "published")
        .map((r) => [r.id, (r.correct_option ?? "").toUpperCase()]),
    );
    const enriched = data.outcomes
      .filter((o) => answerMap.has(o.mcqId))
      .map((o) => {
        const correct = answerMap.get(o.mcqId) ?? null;
        return {
          mcqId: o.mcqId,
          chosen: o.chosen,
          correctOption: (correct as "A" | "B" | "C" | "D" | null) ?? null,
          isCorrect: o.chosen !== null && correct !== null && o.chosen === correct,
        };
      });
    const wrong = enriched.filter((o) => !o.isCorrect && o.chosen !== null);
    const correct = enriched.filter((o) => o.isCorrect);
    const nowIso = new Date().toISOString();

    let wroteWrong = 0;
    let wroteMastered = 0;

    // Fetch existing rows for affected mcqs to know retry counts
    const affected = [...wrong.map((w) => w.mcqId), ...correct.map((c) => c.mcqId)];
    const { data: existing } = await supabase
      .from("mcq_wrong_questions")
      .select("id,mcq_id,retry_count,mastered")
      .eq("user_id", userId)
      .in("mcq_id", affected);
    const existMap = new Map((existing ?? []).map((r) => [r.mcq_id as string, r]));

    // Upsert wrong answers
    for (const w of wrong) {
      const prev = existMap.get(w.mcqId);
      const nextRetry = prev ? (prev.retry_count ?? 0) + 1 : 0;
      const { error } = await supabase.from("mcq_wrong_questions").upsert(
        {
          user_id: userId,
          mcq_id: w.mcqId,
          chapter_id: data.chapterId ?? null,
          subject_id: data.subjectId ?? null,
          level: data.level ?? null,
          last_chosen_option: w.chosen,
          correct_option: w.correctOption,
          retry_count: nextRetry,
          mastered: false,
          last_wrong_at: nowIso,
        },
        { onConflict: "user_id,mcq_id" },
      );
      if (!error) wroteWrong++;
    }

    // Mark previously wrong as mastered when answered correctly now
    const masterIds = correct
      .map((c) => c.mcqId)
      .filter((id) => existMap.has(id) && !existMap.get(id)!.mastered);
    if (masterIds.length) {
      const { error } = await supabase
        .from("mcq_wrong_questions")
        .update({ mastered: true })
        .eq("user_id", userId)
        .in("mcq_id", masterIds);
      if (!error) wroteMastered = masterIds.length;
    }

    return { wrong: wroteWrong, mastered: wroteMastered };
  });

/* ------------------------------------------------------------------ */
/*  Listing for Bookmarks / Wrong Questions pages                      */
/* ------------------------------------------------------------------ */

const listSchema = z.object({
  chapterId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  level: z.string().trim().max(40).nullable().optional(),
  includeMastered: z.boolean().optional(),
});

type McqRow = {
  id: string;
  chapter_id: string | null;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string | null;
};

async function hydrateMcqs(
  supabase: {
    from: (t: string) => {
      select: (s: string) => {
        in: (c: string, v: string[]) => Promise<{ data: McqRow[] | null; error: unknown }>;
      };
    };
  },
  ids: string[],
) {
  if (!ids.length) return new Map<string, McqRow>();
  const { data } = await supabase
    .from("mcqs")
    .select(
      "id,chapter_id,question,option_a,option_b,option_c,option_d,correct_option,explanation",
    )
    .in("id", ids);
  return new Map(((data as McqRow[] | null) ?? []).map((m) => [m.id, m]));
}

export const listBookmarkedMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listSchema>) => listSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("mcq_bookmarks")
      .select("mcq_id,chapter_id,subject_id,level,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.level) q = q.eq("level", data.level);
    const { data: rows, error } = await q;
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.mcq_id as string);
    // @ts-expect-error - simplified hydrateMcqs signature
    const map = await hydrateMcqs(supabase, ids);
    return (rows ?? []).map((r) => {
      const m = map.get(r.mcq_id as string);
      return {
        bookmark_id: r.mcq_id as string,
        mcq_id: r.mcq_id as string,
        chapter_id: r.chapter_id as string | null,
        subject_id: r.subject_id as string | null,
        level: r.level as string | null,
        created_at: r.created_at as string,
        mcq: m
          ? {
              id: m.id,
              question: m.question,
              option_a: m.option_a,
              option_b: m.option_b,
              option_c: m.option_c,
              option_d: m.option_d,
              correct_option: normalizeChoice(m.correct_option),
              explanation: m.explanation,
            }
          : null,
      };
    });
  });

export const listWrongMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listSchema>) => listSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("mcq_wrong_questions")
      .select(
        "mcq_id,chapter_id,subject_id,level,last_chosen_option,correct_option,retry_count,mastered,last_wrong_at",
      )
      .eq("user_id", userId)
      .order("last_wrong_at", { ascending: false })
      .limit(500);
    if (!data.includeMastered) q = q.eq("mastered", false);
    if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.level) q = q.eq("level", data.level);
    const { data: rows, error } = await q;
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.mcq_id as string);
    // @ts-expect-error - simplified hydrateMcqs signature
    const map = await hydrateMcqs(supabase, ids);
    return (rows ?? []).map((r) => {
      const m = map.get(r.mcq_id as string);
      return {
        mcq_id: r.mcq_id as string,
        chapter_id: r.chapter_id as string | null,
        subject_id: r.subject_id as string | null,
        level: r.level as string | null,
        last_chosen_option: r.last_chosen_option as string | null,
        correct_option: r.correct_option as string | null,
        retry_count: r.retry_count as number,
        mastered: r.mastered as boolean,
        last_wrong_at: r.last_wrong_at as string,
        mcq: m
          ? {
              id: m.id,
              question: m.question,
              option_a: m.option_a,
              option_b: m.option_b,
              option_c: m.option_c,
              option_d: m.option_d,
              correct_option: normalizeChoice(m.correct_option),
              explanation: m.explanation,
            }
          : null,
      };
    });
  });

const masterSchema = z.object({ mcqIds: z.array(z.string().uuid()).max(500) });

export const markWrongMcqsMastered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof masterSchema>) => masterSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.mcqIds.length) return { updated: 0 };
    const { error } = await supabase
      .from("mcq_wrong_questions")
      .update({ mastered: true })
      .eq("user_id", userId)
      .in("mcq_id", data.mcqIds);
    if (error) throw error;
    return { updated: data.mcqIds.length };
  });

const removeSchema = z.object({ mcqIds: z.array(z.string().uuid()).max(500) });

export const removeWrongMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof removeSchema>) => removeSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.mcqIds.length) return { removed: 0 };
    const { error } = await supabase
      .from("mcq_wrong_questions")
      .delete()
      .eq("user_id", userId)
      .in("mcq_id", data.mcqIds);
    if (error) throw error;
    return { removed: data.mcqIds.length };
  });

/* ------------------------------------------------------------------ */
/*  Dashboard quick counts                                             */
/* ------------------------------------------------------------------ */

export const reviewCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [bookmarkR, wrongR] = await Promise.all([
      supabase
        .from("mcq_bookmarks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("mcq_wrong_questions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("mastered", false),
    ]);
    return {
      bookmarks: bookmarkR.count ?? 0,
      wrong: wrongR.count ?? 0,
    };
  });