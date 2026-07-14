// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";

export type SearchHit = {
  kind: "user" | "subject" | "chapter" | "mcq" | "quiz" | "mock" | "note";
  id: string;
  label: string;
  sub?: string | null;
  to: string;
};

export type AdminGlobalSearchResult = {
  q: string;
  hits: SearchHit[];
  counts: Record<SearchHit["kind"], number>;
};

export const adminGlobalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const parsed = z
      .object({ q: z.string().trim().max(80).default("") })
      .parse(d ?? {});
    return parsed;
  })
  .handler(async ({ data, context }): Promise<AdminGlobalSearchResult> => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const q = data.q;
    const empty: AdminGlobalSearchResult = {
      q,
      hits: [],
      counts: { user: 0, subject: 0, chapter: 0, mcq: 0, quiz: 0, mock: 0, note: 0 },
    };
    if (q.length < 2) return empty;
    const sb = context.supabase;
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

    const [users, subjects, chapters, mcqs, quizzes, mocks, notes] = await Promise.all([
      sb.from("profiles").select("id,display_name,level").ilike("display_name", like).limit(6),
      sb.from("subjects").select("id,name,slug,level").ilike("name", like).limit(6),
      sb.from("chapters").select("id,name,subject_id").ilike("name", like).limit(6),
      sb.from("mcqs").select("id,question,chapter_id").ilike("question", like).limit(6),
      sb.from("quizzes").select("id,title,kind").eq("kind", "quiz").ilike("title", like).limit(6),
      sb.from("quizzes").select("id,title,kind").eq("kind", "mock").ilike("title", like).limit(6),
      sb.from("short_notes").select("id,title,level").ilike("title", like).limit(6),
    ]);

    const hits: SearchHit[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of (users.data ?? []) as any[]) {
      hits.push({
        kind: "user",
        id: u.id,
        label: u.display_name ?? "Unnamed user",
        sub: u.level ?? null,
        to: `/admin/users?focus=${u.id}`,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (subjects.data ?? []) as any[]) {
      hits.push({
        kind: "subject",
        id: s.id,
        label: s.name,
        sub: s.level ?? null,
        to: `/admin/academic-manager?subject=${s.id}`,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (chapters.data ?? []) as any[]) {
      hits.push({
        kind: "chapter",
        id: c.id,
        label: c.name,
        sub: "Chapter",
        to: `/admin/academic-manager?chapter=${c.id}`,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (mcqs.data ?? []) as any[]) {
      hits.push({
        kind: "mcq",
        id: m.id,
        label: (m.question as string).slice(0, 80),
        sub: "MCQ",
        to: `/admin/mcq?focus=${m.id}`,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const q1 of (quizzes.data ?? []) as any[]) {
      hits.push({
        kind: "quiz",
        id: q1.id,
        label: q1.title,
        sub: "Quiz",
        to: `/admin/quiz?focus=${q1.id}`,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const mk of (mocks.data ?? []) as any[]) {
      hits.push({
        kind: "mock",
        id: mk.id,
        label: mk.title,
        sub: "Mock Test",
        to: `/admin/mock-test?focus=${mk.id}`,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const n of (notes.data ?? []) as any[]) {
      hits.push({
        kind: "note",
        id: n.id,
        label: n.title,
        sub: n.level ?? "Note",
        to: `/admin/short-notes?focus=${n.id}`,
      });
    }

    const counts = hits.reduce((acc, h) => ({ ...acc, [h.kind]: (acc[h.kind] ?? 0) + 1 }), {
      user: 0,
      subject: 0,
      chapter: 0,
      mcq: 0,
      quiz: 0,
      mock: 0,
      note: 0,
    } as AdminGlobalSearchResult["counts"]);
    return { q, hits, counts };
  });