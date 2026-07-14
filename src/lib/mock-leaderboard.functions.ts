// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  quizId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const getMockLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof schema>) => schema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 10;
    const { data: rows, error } = await supabaseAdmin
      .from("exam_attempts")
      .select("id,user_id,score,duration_seconds,completed_at")
      .eq("quiz_id", data.quizId)
      .eq("status", "completed")
      .order("score", { ascending: false })
      .order("duration_seconds", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    let names = new Map<string, { name: string; avatar: string | null }>();
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name,avatar_url")
        .in("id", userIds);
      names = new Map(
        (profs ?? []).map((p) => [
          p.id,
          { name: p.display_name ?? "Learner", avatar: p.avatar_url },
        ]),
      );
    }
    // C-2 / M-3 / M-4: do NOT return user_id to clients (UUIDs leak student
    // identity and let attackers cross-reference users across endpoints).
    // Also compute dense-rank server-side so tied scores share a rank
    // instead of getting silently re-ordered by array index.
    const sorted = rows ?? [];
    let rank = 0;
    let prevScore: number | null = null;
    let prevDuration: number | null = null;
    return sorted.map((r, i) => {
      if (r.score !== prevScore || r.duration_seconds !== prevDuration) {
        rank = i + 1;
        prevScore = r.score;
        prevDuration = r.duration_seconds;
      }
      return {
        attempt_id: r.id,
        rank,
        score: r.score,
        duration_seconds: r.duration_seconds,
        completed_at: r.completed_at,
        name: names.get(r.user_id)?.name ?? "Learner",
        avatar_url: names.get(r.user_id)?.avatar ?? null,
        is_you: r.user_id === context.userId,
      };
    });
  });


const myAttemptsSchema = z.object({ quizId: z.string().uuid() });

export const getMyMockAttempts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof myAttemptsSchema>) => myAttemptsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("exam_attempts")
      .select("id,score,correct_count,total_count,duration_seconds,status,started_at,completed_at")
      .eq("quiz_id", data.quizId)
      .eq("user_id", context.userId)
      .order("started_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });