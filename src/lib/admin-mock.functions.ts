// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { noInput } from "@/lib/validate";
import { mcqBulkImportItemSchema } from "@/lib/mcq-bulk-schema";

const levelCode = z.string().trim().min(1).max(40);
const statusEnum = z.enum(["draft", "published", "archived"]);
const difficultyEnum = z.enum(["easy", "medium", "hard"]);

// ---------- Lookups ----------
export const adminListSubjectsByLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { level?: string }) => z.object({ level: levelCode.optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    let q = context.supabase
      .from("subjects")
      .select("id,name,slug,level,color,icon,status,sort_order")
      .order("sort_order", { ascending: true });
    if (data.level) q = q.eq("level", data.level);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const adminListChaptersBySubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { subjectId: string }) => z.object({ subjectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: rows, error } = await context.supabase
      .from("chapters")
      .select("id,name,slug,subject_id,status,sort_order")
      .eq("subject_id", data.subjectId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const adminListMcqsForBuilder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (i: {
      chapterIds?: string[];
      subjectId?: string;
      level?: string;
      search?: string;
      difficulty?: string;
    }) =>
      z
        .object({
          chapterIds: z.array(z.string().uuid()).max(200).optional(),
          subjectId: z.string().uuid().optional(),
          level: levelCode.optional(),
          search: z.string().trim().max(200).optional(),
          difficulty: difficultyEnum.optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    // Resolve target chapter ids based on the most specific scope provided.
    let chapterIds: string[] = data.chapterIds ?? [];
    if (chapterIds.length === 0 && data.subjectId) {
      const { data: chs, error: ce } = await context.supabase
        .from("chapters")
        .select("id")
        .eq("subject_id", data.subjectId);
      if (ce) throw ce;
      chapterIds = (chs ?? []).map((c: { id: string }) => c.id);
    }
    if (chapterIds.length === 0 && data.level) {
      const { data: subs, error: se } = await context.supabase
        .from("subjects")
        .select("id")
        .eq("level", data.level);
      if (se) throw se;
      const subjectIds = (subs ?? []).map((s: { id: string }) => s.id);
      if (subjectIds.length) {
        const { data: chs, error: ce } = await context.supabase
          .from("chapters")
          .select("id")
          .in("subject_id", subjectIds);
        if (ce) throw ce;
        chapterIds = (chs ?? []).map((c: { id: string }) => c.id);
      }
    }
    if (chapterIds.length === 0) return [];
    let q = context.supabase
      .from("mcqs")
      .select(
        "id,question,difficulty,status,chapter_id,correct_option,chapters(id,name,subjects(id,name))",
      )
      .in("chapter_id", chapterIds)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (data.difficulty) q = q.eq("difficulty", data.difficulty);
    if (data.search) q = q.ilike("question", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    type ChapterRel = { id: string; name: string; subjects?: { id: string; name: string } | { id: string; name: string }[] | null };
    type Row = {
      id: string;
      question: string;
      difficulty: string;
      status: string;
      chapter_id: string;
      correct_option: number | null;
      chapters?: ChapterRel | ChapterRel[] | null;
    };
    const list = (rows as unknown as Row[] | null) ?? [];
    return list.map((r) => {
      const ch = Array.isArray(r.chapters) ? r.chapters[0] : r.chapters;
      const subRaw = ch && Array.isArray(ch.subjects) ? ch.subjects[0] : ch?.subjects ?? null;
      const sub = (subRaw ?? null) as { id: string; name: string } | null;
      return {
        id: r.id,
        question: r.question,
        difficulty: r.difficulty,
        status: r.status,
        chapter_id: r.chapter_id,
        correct_option: r.correct_option,
        chapter_name: ch?.name ?? null,
        subject_name: sub?.name ?? null,
      };
    });



  });

// ---------- Mocks (stored in quizzes with kind='mock') ----------
const mockSelect =
  "id,title,description,level,status,total_questions,duration_seconds,difficulty,starts_at,ends_at,is_public,randomize_questions,randomize_options,negative_marking,passing_marks,subject_id,chapter_id,updated_at,created_at";

export const adminListMocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (i: {
      search?: string;
      status?: string;
      level?: string;
      subjectId?: string;
      mockType?: "all" | "full" | "chapter" | "level";
      date?: "all" | "scheduled" | "unscheduled" | "upcoming" | "expired";
      sortBy?: "updated_at" | "title" | "starts_at" | "total_questions";
      sortDir?: "asc" | "desc";
      page?: number;
      pageSize?: number;
    }) =>
      z
        .object({
          search: z.string().trim().max(200).optional(),
          status: statusEnum.optional(),
          level: levelCode.optional(),
          subjectId: z.string().uuid().optional(),
          mockType: z.enum(["all", "full", "chapter", "level"]).default("all"),
          date: z.enum(["all", "scheduled", "unscheduled", "upcoming", "expired"]).default("all"),
          sortBy: z
            .enum(["updated_at", "title", "starts_at", "total_questions"])
            .default("updated_at"),
          sortDir: z.enum(["asc", "desc"]).default("desc"),
          page: z.number().int().min(1).max(2000).default(1),
          pageSize: z.number().int().min(1).max(100).default(20),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("quizzes")
      .select(mockSelect, { count: "exact" })
      .eq("kind", "mock")
      .order(data.sortBy, { ascending: data.sortDir === "asc", nullsFirst: false })
      .range(from, to);
    if (data.status) q = q.eq("status", data.status);
    if (data.level) q = q.eq("level", data.level);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.mockType === "full") q = q.not("subject_id", "is", null).is("chapter_id", null);
    if (data.mockType === "chapter") q = q.not("chapter_id", "is", null);
    if (data.mockType === "level") q = q.is("subject_id", null).is("chapter_id", null);

    if (data.date === "scheduled") q = q.not("starts_at", "is", null);
    if (data.date === "unscheduled") q = q.is("starts_at", null);
    if (data.date === "upcoming") q = q.gte("starts_at", new Date().toISOString());
    if (data.date === "expired") q = q.lt("ends_at", new Date().toISOString());
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error, count } = await q;
    if (error) throw error;
    return { rows: rows ?? [], count: count ?? 0 };
  });

// Full-dataset KPI stats for the Mock Test Manager dashboard.
// Uses exact-count head queries so values reflect the entire database,
// not just the currently loaded page of rows.
export const adminMockStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    const nowIso = new Date().toISOString();

    const base = () =>
      sb.from("quizzes").select("id", { count: "exact", head: true }).eq("kind", "mock");

    const [totalRes, publishedRes, draftsRes, archivedRes, scheduledRes, liveRes, questionsAgg] =
      await Promise.all([
        base(),
        base().eq("status", "published"),
        base().eq("status", "draft"),
        base().eq("status", "archived"),
        base().gt("starts_at", nowIso),
        base()
          .eq("status", "published")
          .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
          .or(`ends_at.is.null,ends_at.gte.${nowIso}`),
        // Sum + count of total_questions across all mocks (paged to bypass 1000-row cap).
        (async () => {
          let from = 0;
          const pageSize = 1000;
          let sum = 0;
          let n = 0;

          while (true) {
            const { data, error } = await sb
              .from("quizzes")
              .select("total_questions")
              .eq("kind", "mock")
              .range(from, from + pageSize - 1);
            if (error) throw error;
            const batch = (data ?? []) as Array<{ total_questions: number | null }>;
            for (const r of batch) {
              sum += r.total_questions ?? 0;
              n += 1;
            }
            if (batch.length < pageSize) break;
            from += pageSize;
          }
          return { sum, n };
        })(),
      ]);

    for (const r of [totalRes, publishedRes, draftsRes, archivedRes, scheduledRes, liveRes]) {
      if (r.error) throw r.error;
    }

    const total = totalRes.count ?? 0;
    const totalQuestions = questionsAgg.sum;
    const avgQuestions = questionsAgg.n ? Math.round(totalQuestions / questionsAgg.n) : 0;

    return {
      total,
      published: publishedRes.count ?? 0,
      drafts: draftsRes.count ?? 0,
      archived: archivedRes.count ?? 0,
      scheduled: scheduledRes.count ?? 0,
      live: liveRes.count ?? 0,
      totalQuestions,
      avgQuestions,
    };
  });

const mockInputSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  level: levelCode.default("professional"),
  subject_id: z.string().uuid().nullable().optional(),
  chapter_id: z.string().uuid().nullable().optional(),
  duration_seconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 8)
    .default(3600),
  total_questions: z.number().int().min(1).max(500).default(20),
  difficulty: difficultyEnum.default("medium"),
  status: statusEnum.default("draft"),
  starts_at: z.string().datetime().nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
  is_public: z.boolean().default(true),
  randomize_questions: z.boolean().default(true),
  randomize_options: z.boolean().default(false),
  negative_marking: z.number().min(0).max(5).default(0),
  passing_marks: z.number().int().min(0).max(1000).default(0),
  mcq_ids: z.array(z.string().uuid()).max(500).optional(),
});

export const adminCreateMock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof mockInputSchema>) => mockInputSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { mcq_ids, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("quizzes")
      .insert({
        ...rest,
        kind: "mock",
        created_by: context.userId,
        total_questions: mcq_ids?.length || rest.total_questions,
      })
      .select("id")
      .single();
    if (error) throw error;
    if (mcq_ids && mcq_ids.length) {
      const links = mcq_ids.map((mcq_id, i) => ({ quiz_id: row.id, mcq_id, position: i }));
      const { error: le } = await context.supabase.from("quiz_questions").insert(links);
      if (le) throw le;
    }
    return { id: row.id };
  });

const updateInput = mockInputSchema.partial().extend({ id: z.string().uuid() });
export const adminUpdateMock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof updateInput>) => updateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { id, mcq_ids, ...patch } = data;
    const { error } = await context.supabase
      .from("quizzes")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    if (mcq_ids) {
      await context.supabase.from("quiz_questions").delete().eq("quiz_id", id);
      if (mcq_ids.length) {
        const links = mcq_ids.map((mcq_id, i) => ({ quiz_id: id, mcq_id, position: i }));
        const { error: le } = await context.supabase.from("quiz_questions").insert(links);
        if (le) throw le;
      }
      await context.supabase
        .from("quizzes")
        .update({ total_questions: mcq_ids.length, updated_at: new Date().toISOString() })
        .eq("id", id);
    }
    return { ok: true };
  });

export const adminDeleteMock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    await context.supabase.from("quiz_questions").delete().eq("quiz_id", data.id);
    const { error } = await context.supabase.from("quizzes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetMockStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; status: z.infer<typeof statusEnum> }) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("quizzes")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDuplicateMock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: src, error: se } = await context.supabase
      .from("quizzes")
      .select(mockSelect)
      .eq("id", data.id)
      .single();
    if (se) throw se;
    const { id: _omit, updated_at: _u, created_at: _c, ...rest } = src as Record<string, unknown>;
    const { data: copy, error: ce } = await context.supabase
      .from("quizzes")
      .insert({
        ...rest,
        kind: "mock",
        status: "draft",
        title: `${(src as { title: string }).title} (copy)`,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (ce) throw ce;
    const { data: links } = await context.supabase
      .from("quiz_questions")
      .select("mcq_id,position")
      .eq("quiz_id", data.id);
    if (links && links.length) {
      await context.supabase
        .from("quiz_questions")
        .insert(
          links.map((l: { mcq_id: string; position: number }) => ({ ...l, quiz_id: copy.id })),
        );
    }
    return { id: copy.id };
  });

export const adminGetMockQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: rows, error } = await context.supabase
      .from("quiz_questions")
      .select("mcq_id,position")
      .eq("quiz_id", data.id)
      .order("position", { ascending: true });
    if (error) throw error;
    return (rows ?? []).map((r: { mcq_id: string }) => r.mcq_id);
  });

// ---------- Auto-generate a mock test from the MCQ Practice Question Bank ----------
// Required: subjectId, chapterId, level.
// Optional: questionCount (default 10), durationMinutes (default 10),
// difficulty ("easy"|"medium"|"hard"|"mixed", default "mixed"), status (default "draft").
// Falls back to other chapters in the same subject+level when the selected
// chapter doesn't have enough published MCQs.
export const adminAutoGenerateMock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (i: {
      subjectId: string;
      chapterId: string;
      level: string;
      questionCount?: number;
      durationMinutes?: number;
      difficulty?: "easy" | "medium" | "hard" | "mixed";
      status?: "draft" | "published";
    }) =>
      z
        .object({
          subjectId: z.string().uuid(),
          chapterId: z.string().uuid(),
          level: levelCode,
          questionCount: z.number().int().min(1).max(200).default(10),
          durationMinutes: z.number().int().min(1).max(480).default(10),
          difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
          status: z.enum(["draft", "published"]).default("draft"),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const log = (...args: unknown[]) => console.log("[adminAutoGenerateMock]", ...args);
    const errLog = (...args: unknown[]) => console.error("[adminAutoGenerateMock]", ...args);
    try {
      await assertPermission(context.supabase, context.userId, "manage_content");
      const sb = context.supabase;
      log("start", { userId: context.userId, data });

      type McqRow = {
        id: string;
        chapter_id: string | null;
        difficulty: "easy" | "medium" | "hard" | null;
      };

      const fetchMcqs = async (chapterIds: string[]): Promise<McqRow[]> => {
        if (chapterIds.length === 0) return [];
        const out: McqRow[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          let q = sb
            .from("mcqs")
            .select("id,chapter_id,difficulty")
            .eq("status", "published")
            .in("chapter_id", chapterIds)
            .range(from, from + pageSize - 1);
          if (data.difficulty !== "mixed") q = q.eq("difficulty", data.difficulty);
          const { data: batch, error } = await q;
          if (error) throw new Error(`Failed to load MCQs: ${error.message}`);
          const rows = (batch ?? []) as unknown as McqRow[];
          out.push(...rows);
          if (rows.length < pageSize) break;
          from += pageSize;
        }
        return out;
      };

      // 1) Resolve scope metadata.
      const { data: chapter, error: chErr } = await sb
        .from("chapters")
        .select("id,name,subject_id")
        .eq("id", data.chapterId)
        .maybeSingle();
      if (chErr) throw chErr;
      if (!chapter) throw new Error("Selected chapter was not found.");

      const { data: subject, error: sErr } = await sb
        .from("subjects")
        .select("id,name,level")
        .eq("id", data.subjectId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!subject) throw new Error("Selected subject was not found.");

      const target = data.questionCount;

      // 2) Primary pool — selected chapter only.
      const primary = await fetchMcqs([data.chapterId]);
      log("primary pool", primary.length);

      // 3) Fallback — other chapters of same subject + level.
      let usedFallback = false;
      let fallback: McqRow[] = [];
      if (primary.length < target) {
        const { data: sameSubjectChapters, error: scErr } = await sb
          .from("chapters")
          .select("id,subject_id,subjects:subject_id(level)")
          .eq("subject_id", data.subjectId)
          .neq("id", data.chapterId);
        if (scErr) errLog("fallback chapters lookup error", scErr);
        const fallbackChapterIds = (
          (sameSubjectChapters ?? []) as Array<{
            id: string;
            subjects?: { level?: string | null } | null;
          }>
        )
          .filter((c) => !c.subjects?.level || c.subjects.level === data.level)
          .map((c) => c.id);
        if (fallbackChapterIds.length > 0) {
          fallback = await fetchMcqs(fallbackChapterIds);
        }
        if (fallback.length > 0) usedFallback = true;
        log("fallback pool", fallback.length);
      }

      const shuffle = <T>(arr: T[]) => arr.slice().sort(() => Math.random() - 0.5);

      // 4) Selection — apply difficulty mix when "mixed", else straight random.
      const picked: McqRow[] = [];
      const seen = new Set<string>();
      const pushUnique = (rows: McqRow[], limit: number) => {
        let need = limit;
        for (const m of shuffle(rows)) {
          if (need <= 0 || picked.length >= target) break;
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          picked.push(m);
          need -= 1;
        }
      };

      const combined = [...primary, ...fallback];

      if (data.difficulty === "mixed") {
        const easyT = Math.round(target * 0.3);
        const medT = Math.round(target * 0.4);
        const hardT = target - easyT - medT;
        const bucket = (pool: McqRow[], d: "easy" | "medium" | "hard") =>
          pool.filter((m) => (m.difficulty ?? "medium") === d);
        pushUnique(bucket(primary, "easy"), easyT);
        pushUnique(bucket(primary, "medium"), medT);
        pushUnique(bucket(primary, "hard"), hardT);
        // Top up from primary regardless of difficulty if buckets were short.
        if (picked.length < target) pushUnique(primary, target - picked.length);
        // Then fall back to other chapters, preserving difficulty balance.
        if (picked.length < target && fallback.length > 0) {
          const remaining = target - picked.length;
          const easyR = Math.round(remaining * 0.3);
          const medR = Math.round(remaining * 0.4);
          const hardR = remaining - easyR - medR;
          pushUnique(bucket(fallback, "easy"), easyR);
          pushUnique(bucket(fallback, "medium"), medR);
          pushUnique(bucket(fallback, "hard"), hardR);
          if (picked.length < target) pushUnique(fallback, target - picked.length);
        }
      } else {
        pushUnique(primary, target);
        if (picked.length < target) pushUnique(fallback, target - picked.length);
      }

      // If still nothing, surface a clear error.
      if (picked.length === 0) {
        const totalAvailable = combined.length;
        throw new Error(
          `No published MCQs found for the selected scope (subject + chapter + level${
            data.difficulty !== "mixed" ? ` + ${data.difficulty}` : ""
          }). Available in pool: ${totalAvailable}.`,
        );
      }

      const mcqIds = shuffle(picked.map((m) => m.id));
      const durationSeconds = data.durationMinutes * 60;

      const stamp = new Date();
      const scopeLabel = `${subject.name} — ${chapter.name}`;
      const title = `Auto Mock · ${scopeLabel} (${stamp.toLocaleDateString()} ${stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;

      const insertPayload: Record<string, unknown> = {
        kind: "mock",
        title,
        description: `Auto-generated from MCQ Practice Question Bank · ${mcqIds.length} questions from ${scopeLabel}.${
          usedFallback
            ? " Some questions were added from related chapters because the selected chapter did not contain enough questions."
            : ""
        }`,
        level: data.level,
        subject_id: data.subjectId,
        chapter_id: data.chapterId,
        duration_seconds: durationSeconds,
        total_questions: mcqIds.length,
        difficulty: data.difficulty === "mixed" ? "medium" : data.difficulty,
        status: data.status,
        is_public: true,
        randomize_questions: true,
        randomize_options: false,
        negative_marking: 0,
        passing_marks: 0,
        created_by: context.userId,
      };

      const { data: quizRow, error: qErr } = await sb
        .from("quizzes")
        .insert(insertPayload as never)
        .select("id")
        .single();
      if (qErr || !quizRow) {
        errLog("quiz insert failed", qErr);
        throw new Error(`Failed to create mock: ${qErr?.message ?? "unknown error"}`);
      }

      const links = mcqIds.map((mcq_id, i) => ({ quiz_id: quizRow.id, mcq_id, position: i }));
      const { error: linkErr } = await sb.from("quiz_questions").insert(links);
      if (linkErr) {
        errLog("quiz_questions insert failed", linkErr);
        await sb.from("quizzes").delete().eq("id", quizRow.id);
        throw new Error(`Failed to attach questions: ${linkErr.message}`);
      }

      return {
        id: quizRow.id,
        title,
        level: data.level,
        subjectId: data.subjectId,
        chapterId: data.chapterId,
        questionCount: mcqIds.length,
        durationSeconds,
        usedFallback,
        requested: target,
      };
    } catch (e) {
      errLog("FATAL", e);
      throw e;
    }
  });

// ---------- Slice 1: card drawers ----------

// Currently-live mocks: published AND inside (or open) active window.
export const adminListLiveMocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { limit?: number }) =>
    z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const nowIso = new Date().toISOString();
    const { data: rows, error } = await context.supabase
      .from("quizzes")
      .select(mockSelect)
      .eq("kind", "mock")
      .eq("status", "published")
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(data.limit);
    if (error) throw error;
    return { rows: rows ?? [] };
  });

// Bottom-card breakdowns: status counts, difficulty + level distributions,
// largest mocks by question count. All real Supabase reads.
export const adminMockBreakdowns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;

    // Page all mock quizzes for distributions (typically small per project).
    const rows: Array<{
      id: string;
      title: string;
      status: string;
      level: string;
      difficulty: string;
      total_questions: number | null;
      starts_at: string | null;
      ends_at: string | null;
      updated_at: string;
    }> = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await sb
        .from("quizzes")
        .select("id,title,status,level,difficulty,total_questions,starts_at,ends_at,updated_at")
        .eq("kind", "mock")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const batch = (data ?? []) as typeof rows;
      rows.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    const bucket = (key: "status" | "level" | "difficulty") => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const k = String((r as Record<string, unknown>)[key] ?? "—");
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return Array.from(m.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    };

    const questionBuckets = [
      { label: "1–10", min: 1, max: 10 },
      { label: "11–25", min: 11, max: 25 },
      { label: "26–50", min: 26, max: 50 },
      { label: "51–100", min: 51, max: 100 },
      { label: "100+", min: 101, max: Infinity },
    ].map((b) => ({
      label: b.label,
      count: rows.filter(
        (r) => (r.total_questions ?? 0) >= b.min && (r.total_questions ?? 0) <= b.max,
      ).length,
    }));

    const largest = [...rows]
      .sort((a, b) => (b.total_questions ?? 0) - (a.total_questions ?? 0))
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        title: r.title,
        total_questions: r.total_questions ?? 0,
        status: r.status,
      }));

    const totalQuestions = rows.reduce((s, r) => s + (r.total_questions ?? 0), 0);
    const avgQuestions = rows.length ? Math.round(totalQuestions / rows.length) : 0;

    return {
      totalMocks: rows.length,
      totalQuestions,
      avgQuestions,
      byStatus: bucket("status"),
      byLevel: bucket("level"),
      byDifficulty: bucket("difficulty"),
      questionBuckets,
      largest,
    };
  });

// Attempts overview from exam_attempts where kind='mock'. Real Supabase reads.
export const adminMockAttemptsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { rangeDays?: number } | undefined) =>
    z.object({ rangeDays: z.number().int().min(1).max(365).default(30) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    const rangeDays = data.rangeDays;
    const sinceIso = new Date(Date.now() - rangeDays * 86400_000).toISOString();

    const [{ count: totalAttempts }, { count: completed }, { data: recent }] = await Promise.all([
      sb.from("exam_attempts").select("id", { count: "exact", head: true }).eq("kind", "mock"),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("kind", "mock")
        .not("completed_at", "is", null),
      sb
        .from("exam_attempts")
        .select(
          "quiz_id,status,started_at,completed_at,title,score,duration_seconds,correct_count,total_count",
        )
        .eq("kind", "mock")
        .gte("started_at", sinceIso)
        .limit(10000),
    ]);

    const tot = totalAttempts ?? 0;
    const done = completed ?? 0;
    const abandoned = Math.max(0, tot - done);

    type AttemptRow = {
      quiz_id: string | null;
      status: string | null;
      started_at: string | null;
      completed_at: string | null;
      title: string | null;
      score: number | null;
      duration_seconds: number | null;
      correct_count: number | null;
      total_count: number | null;
    };
    const rows = (recent ?? []) as AttemptRow[];

    const dailyMap = new Map<
      string,
      { attempts: number; completed: number; scoreSum: number; scoreN: number }
    >();
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      dailyMap.set(d, { attempts: 0, completed: 0, scoreSum: 0, scoreN: 0 });
    }
    for (const r of rows) {
      const d = r.started_at ? r.started_at.slice(0, 10) : null;
      if (!d) continue;
      const slot = dailyMap.get(d);
      if (!slot) continue;
      slot.attempts += 1;
      if (r.completed_at) slot.completed += 1;
      if (typeof r.score === "number") {
        slot.scoreSum += r.score;
        slot.scoreN += 1;
      }
    }
    const daily = Array.from(dailyMap.entries()).map(([day, v]) => ({
      day,
      count: v.attempts,
      completed: v.completed,
      avgScore: v.scoreN ? Math.round((v.scoreSum / v.scoreN) * 10) / 10 : 0,
    }));

    const buckets = [
      { label: "0-20", min: 0, max: 20 },
      { label: "21-40", min: 21, max: 40 },
      { label: "41-60", min: 41, max: 60 },
      { label: "61-80", min: 61, max: 80 },
      { label: "81-100", min: 81, max: 100 },
    ];
    const scoreHistogram = buckets.map((b) => ({
      label: b.label,
      count: rows.filter((r) => typeof r.score === "number" && r.score >= b.min && r.score <= b.max)
        .length,
    }));

    const perMock = new Map<
      string,
      { count: number; title: string | null; scoreSum: number; scoreN: number }
    >();
    for (const r of rows) {
      const key = r.quiz_id ?? `__notitle__:${r.title ?? "unknown"}`;
      const cur = perMock.get(key) ?? { count: 0, title: r.title, scoreSum: 0, scoreN: 0 };
      cur.count += 1;
      if (typeof r.score === "number") {
        cur.scoreSum += r.score;
        cur.scoreN += 1;
      }
      perMock.set(key, cur);
    }
    const topRaw = Array.from(perMock.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);
    const realIds = topRaw.map(([id]) => id).filter((id) => !id.startsWith("__notitle__:"));
    const titleMap = new Map<string, string>();
    if (realIds.length) {
      const { data: titles } = await sb.from("quizzes").select("id,title").in("id", realIds);
      for (const t of (titles ?? []) as Array<{ id: string; title: string }>) {
        titleMap.set(t.id, t.title);
      }
    }
    const topMocks = topRaw.map(([id, v]) => ({
      id: id.startsWith("__notitle__:") ? null : id,
      title: titleMap.get(id) ?? v.title ?? "Untitled mock",
      attempts: v.count,
      avgScore: v.scoreN ? Math.round((v.scoreSum / v.scoreN) * 10) / 10 : 0,
    }));

    const scoreN = rows.filter((r) => typeof r.score === "number").length;
    const avgScore = scoreN
      ? Math.round((rows.reduce((s, r) => s + (r.score ?? 0), 0) / scoreN) * 10) / 10
      : 0;
    const avgDuration = rows.length
      ? Math.round(rows.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / rows.length)
      : 0;

    return {
      rangeDays,
      totalAttempts: tot,
      completed: done,
      abandoned,
      completionRate: tot ? Math.round((done / tot) * 1000) / 10 : 0,
      avgScore,
      avgDurationSeconds: avgDuration,
      daily,
      scoreHistogram,
      topMocks,
    };
  });

// Per-mock detail: attempts series, score distribution, top scorers,
// completion rate, avg duration, recent activity. Real Supabase reads.
export const adminMockDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { quizId: string; rangeDays?: number }) =>
    z
      .object({
        quizId: z.string().uuid(),
        rangeDays: z.number().int().min(1).max(365).default(30),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    const sinceIso = new Date(Date.now() - data.rangeDays * 86400_000).toISOString();

    const [{ data: mock }, attemptsAllRes, attemptsRangeRes] = await Promise.all([
      sb.from("quizzes").select(mockSelect).eq("id", data.quizId).maybeSingle(),
      sb
        .from("exam_attempts")
        .select(
          "id,user_id,status,score,correct_count,total_count,duration_seconds,started_at,completed_at",
          { count: "exact" },
        )
        .eq("kind", "mock")
        .eq("quiz_id", data.quizId),
      sb
        .from("exam_attempts")
        .select(
          "id,user_id,status,score,correct_count,total_count,duration_seconds,started_at,completed_at",
        )
        .eq("kind", "mock")
        .eq("quiz_id", data.quizId)
        .gte("started_at", sinceIso)
        .limit(10000),
    ]);
    if (!mock) throw new Error("Mock not found");

    type R = {
      id: string;
      user_id: string;
      status: string | null;
      score: number | null;
      correct_count: number | null;
      total_count: number | null;
      duration_seconds: number | null;
      started_at: string | null;
      completed_at: string | null;
    };
    const all = (attemptsAllRes.data ?? []) as R[];
    const rangeRows = (attemptsRangeRes.data ?? []) as R[];

    const total = attemptsAllRes.count ?? all.length;
    const completed = all.filter((r) => r.completed_at).length;
    const abandoned = Math.max(0, total - completed);
    const scoreN = all.filter((r) => typeof r.score === "number").length;
    const avgScore = scoreN
      ? Math.round((all.reduce((s, r) => s + (r.score ?? 0), 0) / scoreN) * 10) / 10
      : 0;
    const avgDuration = all.length
      ? Math.round(all.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / all.length)
      : 0;

    const dailyMap = new Map<
      string,
      { attempts: number; completed: number; scoreSum: number; scoreN: number }
    >();
    for (let i = data.rangeDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      dailyMap.set(d, { attempts: 0, completed: 0, scoreSum: 0, scoreN: 0 });
    }
    for (const r of rangeRows) {
      const d = r.started_at ? r.started_at.slice(0, 10) : null;
      if (!d) continue;
      const slot = dailyMap.get(d);
      if (!slot) continue;
      slot.attempts += 1;
      if (r.completed_at) slot.completed += 1;
      if (typeof r.score === "number") {
        slot.scoreSum += r.score;
        slot.scoreN += 1;
      }
    }
    const daily = Array.from(dailyMap.entries()).map(([day, v]) => ({
      day,
      count: v.attempts,
      completed: v.completed,
      avgScore: v.scoreN ? Math.round((v.scoreSum / v.scoreN) * 10) / 10 : 0,
    }));

    const buckets = [
      { label: "0-20", min: 0, max: 20 },
      { label: "21-40", min: 21, max: 40 },
      { label: "41-60", min: 41, max: 60 },
      { label: "61-80", min: 61, max: 80 },
      { label: "81-100", min: 81, max: 100 },
    ];
    const scoreHistogram = buckets.map((b) => ({
      label: b.label,
      count: all.filter((r) => typeof r.score === "number" && r.score >= b.min && r.score <= b.max)
        .length,
    }));

    const perUser = new Map<string, { score: number; attempts: number; lastAt: string | null }>();
    for (const r of all) {
      const cur = perUser.get(r.user_id) ?? { score: -1, attempts: 0, lastAt: null };
      cur.attempts += 1;
      if (typeof r.score === "number" && r.score > cur.score) cur.score = r.score;
      const t = r.completed_at ?? r.started_at;
      if (t && (!cur.lastAt || t > cur.lastAt)) cur.lastAt = t;
      perUser.set(r.user_id, cur);
    }
    const topUserIds = Array.from(perUser.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 10);
    const userIds = topUserIds.map(([id]) => id);
    const profileMap = new Map<string, { name: string }>();
    if (userIds.length) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id,display_name")
        .in("id", userIds);
      for (const p of (profiles ?? []) as unknown as Array<{
        id: string;
        display_name: string | null;
      }>) {
        profileMap.set(p.id, { name: p.display_name ?? "User" });
      }
    }
    const topScorers = topUserIds.map(([id, v]) => ({
      user_id: id,
      name: profileMap.get(id)?.name ?? "User",
      score: Math.max(0, v.score),
      attempts: v.attempts,
      lastAt: v.lastAt,
    }));

    const recent = [...all]
      .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""))
      .slice(0, 25)
      .map((r) => ({
        id: r.id,
        user_id: r.user_id,
        userName: profileMap.get(r.user_id)?.name ?? "User",
        status: r.completed_at ? "completed" : (r.status ?? "in_progress"),
        score: r.score ?? null,
        correct: r.correct_count ?? 0,
        total: r.total_count ?? 0,
        duration_seconds: r.duration_seconds ?? 0,
        started_at: r.started_at,
        completed_at: r.completed_at,
      }));

    return {
      mock,
      stats: {
        totalAttempts: total,
        completed,
        abandoned,
        completionRate: total ? Math.round((completed / total) * 1000) / 10 : 0,
        avgScore,
        avgDurationSeconds: avgDuration,
      },
      daily,
      scoreHistogram,
      topScorers,
      recent,
    };
  });

// ---------- Slice 4: platform activity feed for mock tests ----------
// Returns the most recent attempt events (starts/completions) joined with
// profile + quiz title, plus admin edit/create events sourced from quizzes.updated_at.
export const adminMockActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { quizId?: string; limit?: number } | undefined) =>
    z
      .object({
        quizId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;

    let aq = sb
      .from("exam_attempts")
      .select("id,user_id,quiz_id,title,status,score,started_at,completed_at,duration_seconds")
      .eq("kind", "mock")
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (data.quizId) aq = aq.eq("quiz_id", data.quizId);
    const { data: attempts, error: aerr } = await aq;
    if (aerr) throw aerr;

    let qq = sb
      .from("quizzes")
      .select("id,title,status,updated_at,created_at")
      .eq("kind", "mock")
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.quizId) qq = qq.eq("id", data.quizId);
    const { data: quizEdits, error: qerr } = await qq;
    if (qerr) throw qerr;

    const userIds = Array.from(
      new Set(
        ((attempts ?? []) as Array<{ user_id: string }>).map((a) => a.user_id).filter(Boolean),
      ),
    );
    const profileMap = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id,display_name")
        .in("id", userIds);
      for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
        profileMap.set(p.id, p.display_name ?? "User");
      }
    }

    type Event = {
      at: string;
      kind: "started" | "completed" | "edited" | "created";
      actor: string;
      target: string;
      quizId: string | null;
      meta: string;
    };
    const events: Event[] = [];

    for (const a of (attempts ?? []) as Array<{
      id: string;
      user_id: string;
      quiz_id: string | null;
      title: string | null;
      status: string | null;
      score: number | null;
      started_at: string | null;
      completed_at: string | null;
      duration_seconds: number | null;
    }>) {
      const actor = profileMap.get(a.user_id) ?? "User";
      const target = a.title ?? "Mock";
      if (a.completed_at) {
        events.push({
          at: a.completed_at,
          kind: "completed",
          actor,
          target,
          quizId: a.quiz_id,
          meta:
            a.score != null ? `${a.score}% · ${Math.round((a.duration_seconds ?? 0) / 60)}m` : "—",
        });
      } else if (a.started_at) {
        events.push({
          at: a.started_at,
          kind: "started",
          actor,
          target,
          quizId: a.quiz_id,
          meta: "in progress",
        });
      }
    }

    for (const q of (quizEdits ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      updated_at: string;
      created_at: string;
    }>) {
      const isNew =
        q.created_at &&
        q.updated_at &&
        Math.abs(new Date(q.updated_at).getTime() - new Date(q.created_at).getTime()) < 5000;
      events.push({
        at: q.updated_at,
        kind: isNew ? "created" : "edited",
        actor: "Admin",
        target: q.title,
        quizId: q.id,
        meta: q.status,
      });
    }

    events.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    return { events: events.slice(0, data.limit) };
  });

// ---------- Bulk Import Mock from parsed MCQs ----------
// Inserts MCQs into the bank under a chapter, then creates a mock test
// referencing those MCQs. Mirrors MCQ Practice bulk upload, but produces a
// mock test as the final artefact.
const bulkMockItem = mcqBulkImportItemSchema;

const bulkMockInput = z.object({
  chapter_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  level: levelCode.default("professional"),
  subject_id: z.string().uuid().nullable().optional(),
  duration_seconds: z.number().int().min(60).max(60 * 60 * 8).default(3600),
  difficulty: difficultyEnum.default("medium"),
  status: statusEnum.default("draft"),
  is_public: z.boolean().default(true),
  randomize_questions: z.boolean().default(true),
  randomize_options: z.boolean().default(false),
  negative_marking: z.number().min(0).max(5).default(0),
  passing_marks: z.number().int().min(0).max(1000).default(0),
  items: z.array(bulkMockItem).min(1).max(500),
  // For chunked uploads: when provided, append items to an existing mock instead
  // of creating a new one. Lets the client stream large imports in batches.
  append_to_quiz_id: z.string().uuid().nullable().optional(),
});

export const adminBulkImportMock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof bulkMockInput>) => bulkMockInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;

    let chapterIds: string[] = [];
    if (data.chapter_id) {
      chapterIds = [data.chapter_id];
    } else {
      if (!data.subject_id) throw new Error("Pick a subject (or a chapter) first");
      const { data: chs, error: chErr } = await sb
        .from("chapters")
        .select("id")
        .eq("subject_id", data.subject_id)
        .order("sort_order", { ascending: true });
      if (chErr) throw chErr;
      chapterIds = ((chs ?? []) as Array<{ id: string }>).map((c) => c.id);
      if (!chapterIds.length)
        throw new Error("Selected subject has no chapters. Create a chapter first.");
    }

    // Resolve target quiz: create new on first batch, or reuse existing one.
    let quizId: string;
    let startPosition = 0;
    if (data.append_to_quiz_id) {
      quizId = data.append_to_quiz_id;
      const { count, error: cntErr } = await sb
        .from("quiz_questions")
        .select("mcq_id", { count: "exact", head: true })
        .eq("quiz_id", quizId);
      if (cntErr) throw cntErr;
      startPosition = count ?? 0;
    } else {
      const { data: quiz, error: qErr } = await sb
        .from("quizzes")
        .insert({
          title: data.title,
          description: data.description ?? null,
          level: data.level,
          subject_id: data.subject_id ?? null,
          chapter_id: data.chapter_id ?? null,
          duration_seconds: data.duration_seconds,
          total_questions: 0,
          difficulty: data.difficulty,
          status: data.status,
          is_public: data.is_public,
          randomize_questions: data.randomize_questions,
          randomize_options: data.randomize_options,
          negative_marking: data.negative_marking,
          passing_marks: data.passing_marks,
          kind: "mock",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (qErr) throw qErr;
      quizId = (quiz as { id: string }).id;
    }

    const mcqRows = data.items.map((it, i) => ({
      chapter_id: chapterIds[(startPosition + i) % chapterIds.length],
      question: it.question,
      question_type: it.question_type,
      option_a: it.option_a,
      option_b: it.option_b,
      option_c: it.question_type === "true_false" ? null : it.option_c ?? null,
      option_d: it.question_type === "true_false" ? null : it.option_d ?? null,
      correct_option: it.correct_option,
      explanation: it.explanation ?? null,
      difficulty: "medium" as const,
      status: "published" as const,
      tags: [] as string[],
      created_by: context.userId,
    }));

    const { data: insertedMcqs, error: mcqErr } = await sb
      .from("mcqs")
      .insert(mcqRows)
      .select("id");
    if (mcqErr) throw mcqErr;
    const mcqIds = (insertedMcqs ?? []).map((r: { id: string }) => r.id);
    if (!mcqIds.length) throw new Error("No MCQs were inserted");

    const links = mcqIds.map((mcq_id, i) => ({
      quiz_id: quizId,
      mcq_id,
      position: startPosition + i,
    }));
    const { error: linkErr } = await sb.from("quiz_questions").insert(links);
    if (linkErr) throw linkErr;

    const newTotal = startPosition + mcqIds.length;
    await sb.from("quizzes").update({ total_questions: newTotal }).eq("id", quizId);

    return { mock_id: quizId, inserted: mcqIds.length, total: newTotal };
  });