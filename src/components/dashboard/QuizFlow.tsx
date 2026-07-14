import { useEffect, useState } from "react";
import { sanitizeOptionText } from "@/lib/sanitize-option";
import { stripAutoTitle, stripAutoDescription } from "@/lib/strip-auto";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles,
  Award,
  Crown,
  ChevronRight,
  Bookmark,
  Clock,
  ArrowLeft,
  ArrowRight,
  Check,
  LogOut,
  Trophy,
  RotateCw,
  Eye,
  Loader2,
  BookOpen,
} from "lucide-react";
import {
  listQuizzes,
  getQuiz,
  submitAttempt,
  listSubjects,
  listChapters,
  listMyAttempts,
  revealAnswers,
} from "@/lib/learning.functions";
import { useLevels, type LevelRow } from "@/hooks/use-levels";
import { confirmDialog } from "@/components/ui/confirm-imperative";
import {
  useBeforeUnloadGuard,
  persistAnswers,
  loadAnswers,
  clearAnswers,
} from "@/lib/exam-safety";

type Step = 0 | 1 | 2 | 3 | 4;

const LEVEL_TONES = [
  "var(--neon-purple)",
  "var(--neon-blue)",
  "oklch(0.82 0.16 85)",
  "var(--neon-pink)",
  "oklch(0.75 0.18 150)",
];
const LEVEL_ICONS = [Sparkles, Award, Crown];

type LevelChoice = Omit<LevelRow, "icon"> & {
  t: string;
  d: string;
  tone: string;
  icon: typeof Sparkles;
};

const stepLabels = ["Level", "Subject", "Chapter", "Quiz", "Play"];

type QuizQ = {
  position: number;
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  // correct_option and explanation are intentionally NOT sent pre-submission.
  // Use revealAnswers(attemptId) post-submit to fetch them.
};

export function QuizFlow() {
  const [step, setStep] = useState<Step>(0);
  const [level, setLevel] = useState<LevelChoice | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: number; total: number; score: number } | null>(
    null,
  );
  const [timeLeft, setTimeLeft] = useState(600);
  const [startedAt, setStartedAt] = useState<number>(0);
  const listQuizzesFn = useServerFn(listQuizzes);
  const getQuizFn = useServerFn(getQuiz);
  const submitFn = useServerFn(submitAttempt);
  const revealFn = useServerFn(revealAnswers);
  const listSubjectsFn = useServerFn(listSubjects);
  const listChaptersFn = useServerFn(listChapters);
  const listMyAttemptsFn = useServerFn(listMyAttempts);
  const qc = useQueryClient();
  const levelsQ = useLevels();
  const levelChoices: LevelChoice[] = (levelsQ.data ?? []).map((l, idx) => {
    const { icon: _omit, ...rest } = l;
    void _omit;
    return {
      ...rest,
      t: l.name,
      d: l.description ?? "Tap to begin",
      tone: l.color || LEVEL_TONES[idx % LEVEL_TONES.length],
      icon: LEVEL_ICONS[idx % LEVEL_ICONS.length],
    };
  });

  // Realtime: any quiz/question change on admin side refreshes student view
  useEffect(() => {
    const ch = supabase
      .channel(`student-quiz-live-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quizzes" }, () => {
        qc.invalidateQueries({ queryKey: ["quizzes"] });
        qc.invalidateQueries({ queryKey: ["quiz"] });
        qc.invalidateQueries({ queryKey: ["student-dashboard-snapshot"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_questions" }, () => {
        qc.invalidateQueries({ queryKey: ["quizzes"] });
        qc.invalidateQueries({ queryKey: ["quiz"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_attempts" }, () => {
        qc.invalidateQueries({ queryKey: ["my-attempts"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const subjectsQ = useQuery({
    queryKey: ["subjects", level?.code ?? null],
    queryFn: () => listSubjectsFn({ data: { level: level?.code } }),
    enabled: step >= 1 && !!level,
  });
  const chaptersQ = useQuery({
    queryKey: ["chapters", subjectId],
    queryFn: () => listChaptersFn({ data: { subjectId: subjectId! } }),
    enabled: !!subjectId && step >= 2,
  });
  const quizzesQ = useQuery({
    queryKey: ["quizzes", level?.code ?? null, subjectId, chapterId],
    queryFn: () =>
      listQuizzesFn({
        data: {
          level: level?.code,
          subjectId: subjectId ?? undefined,
          chapterId: chapterId ?? undefined,
          kind: "quiz",
        },
      }),
    enabled: step >= 3,
  });
  const quizQ = useQuery({
    queryKey: ["quiz", quizId],
    queryFn: () => getQuizFn({ data: { quizId: quizId! } }),
    enabled: !!quizId && step === 4,
  });
  const attemptsQ = useQuery({
    queryKey: ["my-attempts"],
    queryFn: () => listMyAttemptsFn(),
    staleTime: 15_000,
  });

  const questions = (quizQ.data?.questions ?? []) as unknown as QuizQ[];
  const meta = quizQ.data?.quiz;
  const total = questions.length;
  const q = questions[current];

  useEffect(() => {
    if (step !== 4 || submitted || !meta) return;
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [step, submitted, meta]);

  useEffect(() => {
    if (quizQ.data?.quiz && step === 4 && !submitted) {
      setTimeLeft(quizQ.data.quiz.duration_seconds ?? 600);
      setStartedAt(Date.now());
      // Restore any persisted draft so a refresh during an exam doesn't lose work.
      const draft = quizId ? loadAnswers(`quiz:${quizId}`) : null;
      if (draft) {
        setAnswers(draft.answers as Record<number, string>);
        setBookmarks(new Set(draft.bookmarks));
        if (typeof draft.current === "number") setCurrent(draft.current);
      }
    }
  }, [quizQ.data, step, submitted, quizId]);

  // Autosave answers to localStorage so refresh/close doesn't destroy progress.
  useEffect(() => {
    if (!quizId || step !== 4 || submitted) return;
    persistAnswers(`quiz:${quizId}`, {
      answers: answers as Record<string, string>,
      bookmarks: Array.from(bookmarks),
      current,
      savedAt: Date.now(),
    });
  }, [answers, bookmarks, current, quizId, step, submitted]);

  // Native browser leave-site prompt while an exam is in progress.
  useBeforeUnloadGuard(step === 4 && !submitted && Object.keys(answers).length > 0);

  useEffect(() => {
    if (step === 4 && !submitted && timeLeft === 0 && total > 0) {
      void doSubmit({ skipConfirm: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const m = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const s = String(timeLeft % 60).padStart(2, "0");
  const attempted = Object.keys(answers).length;
  const progress = total ? (attempted / total) * 100 : 0;

  const submitMut = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          quizId: quizId!,
          durationSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
          answers: questions.map((qq) => ({
            mcqId: qq.id,
            chosen: (answers[qq.position - 1] as "A" | "B" | "C" | "D") ?? null,
            timeMs: 0,
          })),
        },
      }),
    onSuccess: (r) => {
      setResult({ correct: r.correct, total: r.total, score: r.score });
      setSubmitted(true);
      setAttemptId((r as { attemptId?: string }).attemptId ?? null);
      // Clear the saved draft now that the attempt is recorded server-side.
      if (quizId) clearAnswers(`quiz:${quizId}`);
      qc.invalidateQueries({ queryKey: ["student-dashboard-snapshot"] });
      qc.invalidateQueries({ queryKey: ["student-performance-center"] });
      qc.invalidateQueries({ queryKey: ["student-completion-tracker"] });
      qc.invalidateQueries({ queryKey: ["my-attempts"] });
    },
  });

  // Fetch correct answers + explanations for review (lazy — only when reviewing).
  const revealQ = useQuery({
    queryKey: ["quiz-reveal", attemptId],
    queryFn: () => revealFn({ data: { attemptId: attemptId! } }),
    enabled: !!attemptId && reviewing,
    staleTime: Infinity,
  });
  const revealMap = new Map<string, { correct_option: string | null; chosen_option: string | null; is_correct: boolean | null; explanation: string | null }>();
  for (const r of revealQ.data ?? []) revealMap.set(r.mcq_id, r);

  async function doSubmit(opts?: { skipConfirm?: boolean }) {
    if (submitMut.isPending || submitted) return;
    if (!opts?.skipConfirm) {
      const unanswered = total - Object.keys(answers).length;
      const ok = await confirmDialog({
        title: "Submit this quiz?",
        description:
          unanswered > 0
            ? `${unanswered} question${unanswered === 1 ? "" : "s"} still unanswered. You won't be able to change answers after submitting.`
            : "You won't be able to change answers after submitting.",
        confirmLabel: "Submit",
      });
      if (!ok) return;
    }
    submitMut.mutate();
  }

  async function doExit() {
    const ok = await confirmDialog({
      title: "Exit this quiz?",
      description:
        "Your progress is saved on this device, but the timer keeps running. You can resume by reopening this quiz.",
      confirmLabel: "Exit",
      variant: "destructive",
    });
    if (ok) setStep(3);
  }

  function resetAll() {
    setAnswers({});
    setBookmarks(new Set());
    setCurrent(0);
    setSubmitted(false);
    setReviewing(false);
    setResult(null);
    setAttemptId(null);
    if (quizId) clearAnswers(`quiz:${quizId}`);
    setTimeLeft(meta?.duration_seconds ?? 600);
    setStartedAt(Date.now());
  }




  const allQuizzes = quizzesQ.data ?? [];
  const filteredQuizzes = allQuizzes;
  const attemptCountByQuiz = new Map<string, { count: number; best: number }>();
  for (const a of attemptsQ.data ?? []) {
    if (!a.quiz_id) continue;
    const prev = attemptCountByQuiz.get(a.quiz_id) ?? { count: 0, best: 0 };
    attemptCountByQuiz.set(a.quiz_id, {
      count: prev.count + 1,
      best: Math.max(prev.best, a.score ?? 0),
    });
  }
  const quizTitleById = new Map<string, string>(allQuizzes.map((q) => [q.id, q.title]));
  const recentAttempts = (attemptsQ.data ?? []).slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        {/* Stepper */}
        <div className="glass shadow-card-soft rounded-2xl p-4">
          <div className="flex items-center gap-2 overflow-x-auto">
            {stepLabels.map((l, i) => {
              const active = step === i;
              const done = i < step;
              return (
                <div key={l} className="flex items-center gap-2">
                  <button
                    onClick={() => i <= step && setStep(i as Step)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? "bg-cta-gradient text-white shadow-glow"
                        : done
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                        active ? "bg-white/20" : done ? "bg-foreground/10" : "border border-border"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    {l}
                  </button>
                  {i < stepLabels.length - 1 && (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* STEP 1 — LEVEL */}
        {step === 0 && (
          <section className="animate-fade-up">
            <h2 className="font-display text-2xl font-bold">Choose Quiz Level</h2>
            <p className="text-sm text-muted-foreground">Select your level to begin.</p>
            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
              {levelChoices.length === 0 && !levelsQ.isLoading && (
                <p className="col-span-full text-sm text-muted-foreground">
                  No levels published yet.
                </p>
              )}
              {levelChoices.map((l) => {
                const Icon = l.icon;
                return (
                  <button
                    key={l.code}
                    onClick={() => {
                      setLevel(l);
                      setSubjectId(null);
                      setChapterId(null);
                      setStep(1);
                    }}
                    className="group relative rounded-3xl p-px text-left transition-transform hover:-translate-y-1"
                    style={{ background: `linear-gradient(135deg, ${l.tone}, transparent 65%)` }}
                  >
                    <div className="glass relative h-full overflow-hidden rounded-[calc(theme(borderRadius.3xl)-1px)] p-6">
                      <div
                        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-40 blur-3xl transition-opacity group-hover:opacity-80"
                        style={{ background: l.tone }}
                      />
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-glow"
                        style={{
                          background: `linear-gradient(135deg, ${l.tone}, oklch(0.55 0.2 270))`,
                        }}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="font-display mt-5 text-xl font-bold">{l.t}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{l.d}</p>
                      <div className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-gradient">
                        Browse Subjects <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* STEP 2 — SUBJECT */}
        {step === 1 && (
          <section className="animate-fade-up">
            <h2 className="font-display text-2xl font-bold">Pick a Subject</h2>
            <p className="text-sm text-muted-foreground">{level?.t} Level · choose a subject.</p>
            {subjectsQ.isLoading ? (
              <Loading />
            ) : (subjectsQ.data ?? []).length === 0 ? (
              <Empty text="No subjects available yet." />
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {(subjectsQ.data ?? []).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSubjectId(s.id);
                      setChapterId(null);
                      setStep(2);
                    }}
                    className="glass shadow-card-soft group rounded-3xl p-5 text-left transition-transform hover:-translate-y-1"
                  >
                    <div
                      className="bg-cta-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-glow"
                      style={s.color ? { background: s.color } : undefined}
                    >
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <h3 className="font-display mt-4 text-lg font-bold">{s.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {s.description ?? "Tap to see chapters"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* STEP 3 — CHAPTER */}
        {step === 2 && (
          <section className="animate-fade-up">
            <h2 className="font-display text-2xl font-bold">Pick a Chapter</h2>
            <p className="text-sm text-muted-foreground">
              Or skip to see all quizzes for this subject.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <button
                onClick={() => {
                  setChapterId(null);
                  setStep(3);
                }}
                className="glass shadow-card-soft group rounded-3xl p-5 text-left transition-transform hover:-translate-y-1"
              >
                <div className="bg-cta-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-glow">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="font-display mt-4 text-lg font-bold">All Chapters</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Show every quiz in this subject
                </p>
              </button>
              {chaptersQ.isLoading ? (
                <Loading />
              ) : (
                (chaptersQ.data ?? []).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setChapterId(c.id);
                      setStep(3);
                    }}
                    className="glass shadow-card-soft group rounded-3xl p-5 text-left transition-transform hover:-translate-y-1"
                  >
                    <div className="bg-cta-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-glow">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <h3 className="font-display mt-4 text-lg font-bold">{c.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {c.description ?? ""}
                    </p>
                  </button>
                ))
              )}
            </div>
          </section>
        )}

        {/* STEP 4 — QUIZ PICKER */}
        {step === 3 && (
          <section className="animate-fade-up">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">Pick a Quiz</h2>
                <p className="text-sm text-muted-foreground">
                  {level?.t} Level · choose a quiz to attempt.
                </p>
              </div>
            </div>
            {quizzesQ.isLoading ? (
              <Loading />
            ) : filteredQuizzes.length === 0 ? (
              <Empty text="No quizzes published here yet. Try another chapter or subject." />
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {filteredQuizzes.map((qz) => {
                  const stats = attemptCountByQuiz.get(qz.id);
                  return (
                    <button
                      key={qz.id}
                      onClick={() => {
                        setQuizId(qz.id);
                        setStep(4);
                        resetAll();
                      }}
                      className="glass shadow-card-soft group rounded-3xl p-5 text-left transition-all hover:-translate-y-1 hover:shadow-glow"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="bg-cta-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-glow">
                          <BookOpen className="h-5 w-5" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          {stats && (
                            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                              Best {stats.best}%
                            </span>
                          )}
                        </div>
                      </div>
                      <h3 className="font-display mt-4 text-lg font-bold">{stripAutoTitle(qz.title)}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {stripAutoDescription(qz.description) ?? "Tap to start"}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {(qz as { mcq_count?: number }).mcq_count ?? qz.total_questions} questions
                          · {Math.round((qz.duration_seconds ?? 600) / 60)} min
                        </span>
                        {stats && (
                          <span>
                            {stats.count} attempt{stats.count > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {recentAttempts.length > 0 && (
              <div className="glass shadow-card-soft mt-6 rounded-3xl p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold">Recent Attempts</h3>
                  <span className="text-[11px] text-muted-foreground">Live · synced</span>
                </div>
                <div className="mt-3 divide-y divide-border/60">
                  {recentAttempts.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {(a.quiz_id && stripAutoTitle(quizTitleById.get(a.quiz_id))) || "Quiz attempt"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(a.completed_at ?? a.started_at).toLocaleString()} ·{" "}
                          {a.correct_count}/{a.total_count}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          (a.score ?? 0) >= 70
                            ? "bg-emerald-500/15 text-emerald-400"
                            : (a.score ?? 0) >= 40
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {a.score ?? 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* STEP 5 — PLAY */}
        {step === 4 && (!submitted || reviewing) && (
          <section className="animate-fade-up space-y-4">
            <div className="glass shadow-card-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {level?.t}
                  </p>
                  <h3 className="font-display text-lg font-bold">{stripAutoTitle(meta?.title) || "Loading…"}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`glass flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold ${timeLeft < 60 ? "text-red-400" : "text-gradient"}`}
                  >
                    <Clock className="h-4 w-4" /> {m}:{s}
                  </div>
                  <button
                    onClick={() => void doExit()}
                    className="glass inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Exit
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] transition-all"
                    style={{ width: `${progress}%`, boxShadow: "0 0 12px var(--neon-purple)" }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {attempted}/{total}
                </span>
              </div>
            </div>

            <div className="glass shadow-glow relative overflow-hidden rounded-3xl p-6">
              <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[var(--neon-purple)]/25 blur-3xl" />
              <div className="pointer-events-none absolute -left-20 -bottom-20 h-60 w-60 rounded-full bg-[var(--neon-blue)]/20 blur-3xl" />

              {quizQ.isLoading || !q ? (
                <Loading />
              ) : (
                <>
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="glass rounded-xl px-3 py-1.5 text-xs font-semibold">
                        Q {String(current + 1).padStart(2, "0")} / {total}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const b = new Set(bookmarks);
                        b.has(current) ? b.delete(current) : b.add(current);
                        setBookmarks(b);
                      }}
                      className={`glass flex h-9 w-9 items-center justify-center rounded-xl transition-transform hover:scale-105 ${bookmarks.has(current) ? "text-[var(--neon-pink)]" : ""}`}
                    >
                      <Bookmark
                        className="h-4 w-4"
                        fill={bookmarks.has(current) ? "currentColor" : "none"}
                      />
                    </button>
                  </div>

                  <h3 className="font-display relative mt-6 text-xl font-bold leading-snug sm:text-2xl">
                    {sanitizeOptionText(q.question)}
                  </h3>

                  <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(["A", "B", "C", "D"] as const).map((k) => {
                      const text = sanitizeOptionText(
                        (q as unknown as Record<string, string>)[`option_${k.toLowerCase()}`],
                      );
                      const isPicked = answers[current] === k;
                      const review = reviewing ? revealMap.get(q.id) : null;
                      const isCorrect = review?.correct_option === k;
                      const isWrongPick = review && isPicked && !isCorrect;
                      // Visual review states use color tokens already in the design system.
                      const reviewClass = review
                        ? isCorrect
                          ? "border-emerald-500/60 bg-emerald-500/15"
                          : isWrongPick
                            ? "border-destructive/60 bg-destructive/10"
                            : "border-border opacity-70"
                        : isPicked
                          ? "border-primary bg-primary/10 shadow-glow"
                          : "border-border hover:border-primary/50 hover:bg-muted/40";
                      return (
                        <button
                          key={k}
                          onClick={() => {
                            if (reviewing) return;
                            setAnswers({ ...answers, [current]: k });
                          }}
                          disabled={reviewing}
                          aria-pressed={isPicked}
                          className={`group relative flex items-center gap-4 rounded-2xl border p-4 text-left transition-all disabled:cursor-default ${reviewClass}`}
                        >
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-base font-bold transition-all ${
                              review && isCorrect
                                ? "bg-emerald-500 text-white"
                                : review && isWrongPick
                                  ? "bg-destructive text-destructive-foreground"
                                  : isPicked
                                    ? "bg-cta-gradient text-white shadow-glow"
                                    : "bg-muted text-foreground group-hover:bg-cta-gradient group-hover:text-white"
                            }`}
                          >
                            {k}
                          </span>
                          <span className="text-sm font-medium">{text}</span>
                          {review && isCorrect && (
                            <span className="ml-auto text-[11px] font-semibold text-emerald-500">Correct</span>
                          )}
                          {review && isWrongPick && (
                            <span className="ml-auto text-[11px] font-semibold text-destructive">Your answer</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {reviewing && revealMap.get(q.id)?.explanation && (
                    <div className="relative mt-4 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Explanation: </span>
                      {revealMap.get(q.id)?.explanation}
                    </div>
                  )}
                  {reviewing && revealQ.isLoading && (
                    <p className="relative mt-4 text-xs text-muted-foreground">Loading explanations…</p>
                  )}

                  <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                      disabled={current === 0}
                      className="glass inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02] disabled:opacity-40"
                    >
                      <ArrowLeft className="h-4 w-4" /> Previous
                    </button>
                    <div className="flex gap-3">
                      {!reviewing && (
                        <button
                          onClick={() => void doSubmit()}
                          disabled={submitMut.isPending}
                          className="rounded-xl border border-border bg-background/40 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-40"
                        >
                          {submitMut.isPending ? "Submitting…" : "Submit Quiz"}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (current === total - 1) {
                            if (reviewing) return;
                            void doSubmit();
                          } else {
                            setCurrent((c) => Math.min(total - 1, c + 1));
                          }
                        }}
                        disabled={submitMut.isPending}
                        className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:opacity-50"
                      >
                        {current === total - 1 ? (reviewing ? "End" : "Finish") : "Next"}{" "}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {submitMut.isError && (
                    <p className="mt-3 text-xs text-red-400">Could not submit. Please try again.</p>
                  )}
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {/* RIGHT PANEL */}
      {step === 4 && !submitted && total > 0 && (
        <aside className="space-y-4">
          <div className="glass shadow-card-soft rounded-3xl p-5">
            <h3 className="font-display text-base font-bold">Question Navigator</h3>
            <p className="text-xs text-muted-foreground">Click any number to jump</p>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {questions.map((_, i) => {
                const isCurrent = i === current;
                const isDone = answers[i] !== undefined;
                const isBookmarked = bookmarks.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`relative flex h-10 items-center justify-center rounded-lg text-xs font-semibold transition-transform hover:scale-110 ${
                      isCurrent
                        ? "bg-cta-gradient text-white shadow-glow"
                        : isDone
                          ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-400"
                          : "border border-border bg-card/40 text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                    {isBookmarked && (
                      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[var(--neon-pink)] shadow-[0_0_6px_var(--neon-pink)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass shadow-card-soft rounded-3xl p-5">
            <h3 className="font-display text-base font-bold">Live Status</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Attempted" value={`${attempted}/${total}`} />
              <Stat label="Time Left" value={`${m}:${s}`} gradient />
              <Stat label="Bookmarked" value={String(bookmarks.size)} />
              <Stat label="Remaining" value={String(total - attempted)} />
            </div>
          </div>
        </aside>
      )}

      {/* RESULT POPUP */}
      {submitted && result && !reviewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-md xl:col-span-2">
          <div className="glass shadow-glow animate-fade-up relative w-full max-w-lg overflow-hidden rounded-3xl p-px">
            <div className="bg-cta-gradient absolute inset-0 opacity-90" />
            <div className="relative rounded-[calc(theme(borderRadius.3xl)-1px)] bg-background/90 p-7 backdrop-blur-xl">
              <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[var(--neon-purple)]/30 blur-3xl" />
              <div className="pointer-events-none absolute -left-20 -bottom-20 h-60 w-60 rounded-full bg-[var(--neon-blue)]/25 blur-3xl" />

              <div className="relative text-center">
                <div className="bg-cta-gradient mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-glow">
                  <Trophy className="h-6 w-6" />
                </div>
                <h2 className="font-display mt-4 text-2xl font-bold">Quiz Complete!</h2>
                <p className="text-sm text-muted-foreground">Saved to your attempt history.</p>

                <div className="relative mx-auto mt-6 h-40 w-40">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                    <defs>
                      <linearGradient id="qres" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="oklch(0.7 0.25 295)" />
                        <stop offset="100%" stopColor="oklch(0.72 0.2 235)" />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="60"
                      cy="60"
                      r="54"
                      stroke="currentColor"
                      strokeWidth="10"
                      fill="none"
                      className="text-muted/40"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r="54"
                      stroke="url(#qres)"
                      strokeWidth="10"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray="339"
                      strokeDashoffset={339 - (339 * result.score) / 100}
                      style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="font-display text-3xl font-bold text-gradient">{result.score}%</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Score
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-2">
                  <Stat label="Correct" value={String(result.correct)} />
                  <Stat label="Wrong" value={String(Math.max(0, attempted - result.correct))} />
                  <Stat label="Skipped" value={String(Math.max(0, total - attempted))} />
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => {
                      setReviewing(true);
                      setCurrent(0);
                    }}
                    className="glass inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-transform hover:scale-[1.02]"
                  >
                    <Eye className="h-4 w-4" /> Review Answers
                  </button>
                  <button
                    onClick={resetAll}
                    className="bg-cta-gradient inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02]"
                  >
                    <RotateCw className="h-4 w-4" /> Try Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, gradient }: { label: string; value: string; gradient?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display mt-1 text-xl font-bold ${gradient ? "text-gradient" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-border bg-card/30 p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
