import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Timer,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Send,
  Loader2,
  Trophy,
  Sparkles,
  BookOpen,
  Hash,
  Info,
} from "lucide-react";

import { useServerFn } from "@tanstack/react-start";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { primaryBtnCls, ghostBtnCls } from "./kit";
import {
  getExamBatchAttemptResult,
  getExamBatchAttemptState,
  getExamBatchAttemptStatus,
  getExamBatchExamMeta,
  saveExamBatchAnswer,
  startOrResumeExamBatchAttempt,
  submitExamBatchAttempt,
} from "@/lib/exam-batch";
import type { AttemptQuestionView, ResultVisibility } from "@/lib/exam-batch";
import { notifyExamBatchRealtime, useExamBatchRealtime } from "./use-exam-batch-realtime";

type Phase = "loading" | "exam" | "processing" | "submitted" | "error";
type QState = "answered" | "unanswered" | "current";

const examBatchTakeRoute = getRouteApi("/_student/exam-batch-take");


function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

// -------------- Main Exam Interface --------------
export function ExamInterface() {
  const search = examBatchTakeRoute.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // The exam-take route lives outside the Exam Batch layout, so it never
  // gets the shared realtime channel that broadcasts leaderboard freezes
  // to other students. Mount the same refcounted subscription here so this
  // student's `notifyExamBatchRealtime` on submit reaches the shared
  // channel (and this tab also receives freeze broadcasts from admin
  // force-close / recalculate while the exam is in progress).
  useExamBatchRealtime();


  const startFn = useServerFn(startOrResumeExamBatchAttempt);
  const stateFn = useServerFn(getExamBatchAttemptState);
  const statusFn = useServerFn(getExamBatchAttemptStatus);
  const saveFn = useServerFn(saveExamBatchAnswer);
  const submitFn = useServerFn(submitExamBatchAttempt);
  const metaFn = useServerFn(getExamBatchExamMeta);

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [current, setCurrent] = useState(0);
  const [question, setQuestion] = useState<AttemptQuestionView | null>(null);
  // Local caches keyed by position index
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [questionIds, setQuestionIds] = useState<Record<number, string>>({});
  const [remaining, setRemaining] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [meta, setMeta] = useState<{
    title: string;
    subtitle: string | null;
    subjectName: string | null | undefined;
    sessionTitle: string | null | undefined;
    level: string;
    durationMinutes: number;
  } | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);

  // Prefetch cache: display-index -> full AttemptQuestionView (already includes
  // any saved answer). Populated by loadIndex and warmed by neighbour prefetch
  // so Next/Previous feel instant.
  const questionCache = useRef<Map<number, AttemptQuestionView>>(new Map());
  const inflightIndex = useRef<Set<number>>(new Set());

  const submitInFlight = useRef(false);


  // ---- Bootstrap: resolve attempt ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!search.examId && !search.attemptId) {
          throw new Error("Missing exam reference. Please launch the exam from the Available Exams list.");
        }
        let aid = search.attemptId ?? null;
        let examId = search.examId ?? null;

        if (!aid && examId) {
          const res = await startFn({ data: { examId } });
          if (cancelled) return;
          aid = res.attemptId;
          // Replace url with attemptId so refresh resumes cleanly
          navigate({
            to: "/exam-batch-take" as never,
            search: { attemptId: aid } as never,
            replace: true,
          });
        }
        if (!aid) throw new Error("Could not start the exam.");
        setAttemptId(aid);

        // Load initial state + meta in parallel — no need to wait sequentially.
        // Also enter the exam view as soon as the state resolves so the user
        // sees Q1 immediately instead of waiting for meta.
        const stPromise = stateFn({ data: { attemptId: aid, index: 0 } });
        const metaPromise = examId
          ? metaFn({ data: { examId } }).catch(() => null)
          : Promise.resolve(null);

        const st = await stPromise;
        if (cancelled) return;
        setTotalQuestions(st.totalQuestions);
        setRemaining(st.attempt.remainingSeconds);
        setQuestion(st.question);
        if (st.question) {
          questionCache.current.set(0, st.question);
          setQuestionIds((m) => ({ ...m, 0: st.question!.questionId }));
          if (st.question.selectedDisplayIndex !== null) {
            setAnswers((a) => ({ ...a, 0: st.question!.selectedDisplayIndex! }));
          }
        }

        // If attempt already submitted (resumed after time), jump to submitted
        if (st.attempt.status !== "in_progress") {
          setPhase("submitted");
          return;
        }

        // Show the exam UI right away.
        setPhase("exam");

        // Resolve meta (already in flight if examId was known).
        let mm = await metaPromise;
        if (!mm && !examId) {
          examId = st.attempt.examId;
          try {
            mm = await metaFn({ data: { examId } });
          } catch {
            mm = null;
          }
        }
        if (!cancelled && mm) {
          setMeta({
            title: mm.title,
            subtitle: mm.subtitle,
            subjectName: mm.subjectName,
            sessionTitle: mm.sessionTitle,
            level: mm.level,
            durationMinutes: mm.durationMinutes,
          });
        }

        // Warm Q2 so the first Next is instant.
        if (!cancelled && st.totalQuestions > 1) {
          void stateFn({ data: { attemptId: aid, index: 1 } })
            .then((next) => {
              if (cancelled || !next.question) return;
              questionCache.current.set(1, next.question);
              setQuestionIds((m) => (m[1] ? m : { ...m, 1: next.question!.questionId }));
              if (next.question.selectedDisplayIndex !== null) {
                const sel = next.question.selectedDisplayIndex;
                setAnswers((a) => (a[1] === sel ? a : { ...a, 1: sel }));
              }
            })
            .catch(() => {});
        }

      } catch (e: unknown) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : "Failed to load exam.");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Fetch a single question and cache it (used by loadIndex + prefetch) ----
  const fetchQuestion = useCallback(
    async (idx: number): Promise<AttemptQuestionView | null> => {
      if (!attemptId) return null;
      if (idx < 0 || idx >= totalQuestions) return null;
      const cached = questionCache.current.get(idx);
      if (cached) return cached;
      if (inflightIndex.current.has(idx)) return null;
      inflightIndex.current.add(idx);
      try {
        const st = await stateFn({ data: { attemptId, index: idx } });
        setRemaining(st.attempt.remainingSeconds);
        if (st.attempt.status !== "in_progress") {
          setPhase("submitted");
          return null;
        }
        if (st.question) {
          questionCache.current.set(idx, st.question);
          setQuestionIds((m) => (m[idx] ? m : { ...m, [idx]: st.question!.questionId }));
          if (st.question.selectedDisplayIndex !== null) {
            const sel = st.question.selectedDisplayIndex;
            setAnswers((a) => (a[idx] === sel ? a : { ...a, [idx]: sel }));
          }
        }
        return st.question;
      } finally {
        inflightIndex.current.delete(idx);
      }
    },
    [attemptId, totalQuestions, stateFn],
  );

  // ---- Navigate to a question index (instant if cached, otherwise fetch) ----
  const loadIndex = useCallback(
    async (idx: number) => {
      if (!attemptId) return;
      if (idx < 0 || idx >= totalQuestions) return;
      if (idx === current && question) return;

      const cached = questionCache.current.get(idx);
      if (cached) {
        // Instant navigation — no network round-trip, no loader flash.
        setCurrent(idx);
        setQuestion(cached);
      } else {
        setQuestionLoading(true);
        try {
          const q = await fetchQuestion(idx);
          if (q) {
            setCurrent(idx);
            setQuestion(q);
          }
        } catch (e: unknown) {
          setErrorMsg(e instanceof Error ? e.message : "Failed to load question.");
        } finally {
          setQuestionLoading(false);
        }
      }

      // Warm neighbours in the background so subsequent Next/Prev are instant.
      void fetchQuestion(idx + 1).catch(() => {});
      void fetchQuestion(idx - 1).catch(() => {});
    },
    [attemptId, totalQuestions, current, question, fetchQuestion],
  );


  // ---- Manual submit ----
  const doSubmit = useCallback(
    async (auto = false) => {
      if (!attemptId || submitInFlight.current) return;
      submitInFlight.current = true;
      setConfirmOpen(false);
      setPhase("processing");
      try {
        await submitFn({ data: { attemptId } });
        setPhase("submitted");
        // Invalidate every exam-batch query so Available Exams, Completed
        // Exams, Dashboard counts, Progress, and any leaderboards refetch
        // immediately — no manual refresh required.
        void queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
        // If this submission caused the leaderboard to freeze (last
        // submitter of a window / post-window submit), the DB trigger will
        // have inserted leaderboard rows in the same transaction. Postgres
        // realtime is RLS-filtered and occasionally drops the fan-out for
        // other students, so broadcast a hint on the shared channel — every
        // other enrolled student's Leaderboard query invalidates at the
        // same instant this client sees the submit resolve.
        notifyExamBatchRealtime("exam_batch_leaderboards");
        notifyExamBatchRealtime("exam_batch_leaderboard_entries");
      } catch (e: unknown) {
        // On failure, revert to exam view unless auto-submit which should still show submitted
        if (auto) {
          setPhase("submitted");
          void queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
          notifyExamBatchRealtime("exam_batch_leaderboards");
          notifyExamBatchRealtime("exam_batch_leaderboard_entries");
        } else {
          setErrorMsg(e instanceof Error ? e.message : "Failed to submit.");
          setPhase("exam");
        }
      } finally {
        submitInFlight.current = false;
      }
    },
    [attemptId, submitFn, queryClient],
  );


  // ---- Countdown timer ----
  useEffect(() => {
    if (phase !== "exam") return;
    const iv = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(iv);
          // Auto-submit
          void doSubmit(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [phase, doSubmit]);

  // ---- Periodic server-time resync + auto-submit detection ----
  useEffect(() => {
    if (phase !== "exam" || !attemptId) return;
    const iv = setInterval(async () => {
      try {
        const st = await statusFn({ data: { attemptId } });
        setRemaining(st.remainingSeconds);
        if (st.status !== "in_progress") {
          setPhase("submitted");
        }
      } catch {
        /* transient */
      }
    }, 30_000);
    return () => clearInterval(iv);
  }, [phase, attemptId, statusFn]);

  // ---- Answer selection ----
  // Update UI immediately, cache the answer for palette + Result Page, and
  // save to the server in the background so clicking Next never blocks on
  // the save round-trip.
  const selectOption = useCallback(
    (displayIdx: number) => {
      if (!attemptId || !question) return;
      const qid = question.questionId;
      const idx = current;
      setAnswers((a) => ({ ...a, [idx]: displayIdx }));
      // Reflect selection in the cached AttemptQuestionView too.
      const cached = questionCache.current.get(idx);
      if (cached) {
        questionCache.current.set(idx, { ...cached, selectedDisplayIndex: displayIdx });
      }
      // Fire-and-forget: server validates + persists asynchronously.
      void saveFn({
        data: { attemptId, questionId: qid, selectedDisplayIndex: displayIdx },
      }).catch((e: unknown) => {
        setErrorMsg(e instanceof Error ? e.message : "Failed to save answer.");
      });
    },
    [attemptId, question, current, saveFn],
  );


  const answeredCount = Object.keys(answers).length;
  const time = useMemo(() => formatTime(remaining), [remaining]);

  // ---------- Render states ----------
  if (phase === "loading") {
    return <ExamInterfaceSkeleton />;
  }

  if (phase === "error") {
    return (
      <div className="mx-auto max-w-lg pt-10">
        <div className="glass shadow-card-soft rounded-3xl p-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h2 className="font-display mt-3 text-lg font-bold">Cannot start exam</h2>
          <p className="mt-1 text-sm text-muted-foreground">{errorMsg}</p>
          <button
            onClick={() => navigate({ to: "/exam-batch/available" as never })}
            className={cn(primaryBtnCls, "mt-5")}
          >
            Back to Available Exams
          </button>
        </div>
      </div>
    );
  }

  if (phase === "submitted") {
    return (
      <div className="pb-24">
        <SubmittedScreen
          attemptId={attemptId}
          answered={answeredCount}
          total={totalQuestions}
          onBack={() => navigate({ to: "/exam-batch/available" as never })}
        />
      </div>
    );
  }

  return (
    <div className="pb-28 lg:pb-6">
      <ExamHeader
        title={meta?.title ?? "Exam"}
        subtitle={meta?.subjectName ?? meta?.subtitle ?? null}
        session={meta?.sessionTitle ?? ""}
        level={meta?.level ?? ""}
        total={totalQuestions}
        durationMin={meta?.durationMinutes ?? 0}
        time={time}
        answered={answeredCount}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {question ? (
              <QuestionCard
                key={`${current}-${question.questionId}`}
                index={current}
                total={totalQuestions}
                text={question.text}
                options={question.options}
                selected={answers[current] ?? null}
                onSelect={selectOption}
                loading={questionLoading}
              />
            ) : (
              <div className="glass shadow-card-soft rounded-3xl p-8 text-center text-sm text-muted-foreground">
                No question at this position.
              </div>
            )}
          </AnimatePresence>


          <div className="glass shadow-card-soft mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 sm:p-4">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="font-semibold tabular-nums">{answeredCount}</span>
                <span className="text-muted-foreground">answered</span>
              </div>
              <div className="flex items-center gap-2">
                <Circle className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold tabular-nums">
                  {Math.max(0, totalQuestions - answeredCount)}
                </span>
                <span className="text-muted-foreground">remaining</span>
              </div>

            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => loadIndex(current - 1)}
                disabled={current === 0 || questionLoading}
                className={cn(ghostBtnCls, "disabled:cursor-not-allowed disabled:opacity-40")}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <button
                onClick={() => setConfirmOpen(true)}
                className={cn(ghostBtnCls, "border-primary/40 text-primary")}
              >
                <Send className="h-4 w-4" /> Submit Exam
              </button>
              {current < totalQuestions - 1 ? (
                <button
                  onClick={() => loadIndex(current + 1)}
                  disabled={questionLoading}
                  className={primaryBtnCls}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button onClick={() => setConfirmOpen(true)} className={primaryBtnCls}>
                  <Send className="h-4 w-4" /> Review & Submit
                </button>
              )}
            </div>
          </div>
        </div>

        <PaletteSidebar
          total={totalQuestions}
          current={current}
          answers={answers}
          questionIds={questionIds}

          onJump={loadIndex}
        />
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/85 p-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            onClick={() => loadIndex(current - 1)}
            disabled={current === 0 || questionLoading}
            className={cn(
              "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-input bg-background/60 text-sm font-semibold disabled:opacity-40",
            )}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl bg-cta-gradient text-white shadow-glow"
            aria-label="Question palette"
          >
            <Menu className="h-4 w-4" />
            <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
              {answeredCount}
            </span>
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-cta-gradient text-sm font-semibold text-white shadow-glow"
          >
            <Send className="h-4 w-4" /> Submit
          </button>
          {current < totalQuestions - 1 && (
            <button
              onClick={() => loadIndex(current + 1)}
              disabled={questionLoading}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary/40 text-sm font-semibold text-primary"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <PaletteSheet
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        total={totalQuestions}
        current={current}
        answers={answers}
        questionIds={questionIds}

        onJump={loadIndex}
      />
      <SubmitDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onSubmit={() => doSubmit(false)}
        answered={answeredCount}
        total={totalQuestions}
        time={time}
      />
      {phase === "processing" && <ProcessingScreen />}
    </div>
  );
}

// -------------- Header --------------
function ExamHeader({
  title,
  subtitle,
  session,
  level,
  total,
  durationMin,
  time,
  answered,
  onOpenPalette,
}: {
  title: string;
  subtitle: string | null;
  session: string;
  level: string;
  total: number;
  durationMin: number;
  time: string;
  answered: number;
  onOpenPalette: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 -mx-1 mb-4">
      <div className="glass shadow-card-soft relative overflow-hidden rounded-2xl p-3 sm:p-4 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-cta-gradient opacity-20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="bg-cta-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h1 className="font-display truncate text-sm font-bold sm:text-base">{title}</h1>
              {subtitle && (
                <>
                  <span className="hidden text-xs text-muted-foreground sm:inline">·</span>
                  <p className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
                </>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
              {session && <HeaderChip label={session} />}
              {level && <HeaderChip label={level} />}
              <HeaderChip icon={Hash} label={`${total} Qs`} />
              {durationMin > 0 && <HeaderChip icon={Timer} label={`${durationMin} min`} />}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CountdownPill time={time} />
            <button
              onClick={onOpenPalette}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-input bg-background/60 text-foreground/80 transition-colors hover:bg-muted lg:hidden"
              aria-label="Open question palette"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="bg-cta-gradient h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${total > 0 ? (answered / total) * 100 : 0}%` }}
            transition={{ type: "spring", stiffness: 140, damping: 22 }}
          />
        </div>
      </div>
    </header>
  );
}

function HeaderChip({ icon: Icon, label }: { icon?: typeof Hash; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2 py-0.5">
      {Icon && <Icon className="h-3 w-3" />}
      <span className="font-medium">{label}</span>
    </span>
  );
}

function CountdownPill({ time }: { time: string }) {
  return (
    <div className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-3 py-2 text-white shadow-glow">
      <Timer className="h-4 w-4" />
      <span className="font-display text-sm font-bold tabular-nums sm:text-base">{time}</span>
    </div>
  );
}

// -------------- Question card --------------
function optionLetter(i: number): string {
  return String.fromCharCode(65 + i);
}

function QuestionCard({
  index,
  total,
  text,
  options,
  selected,
  onSelect,
  loading,
}: {
  index: number;
  total: number;
  text: string;
  options: string[];
  selected: number | null;
  onSelect: (i: number) => void;
  loading: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5 sm:p-6"
    >
      <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-cta-gradient opacity-10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-cta-gradient flex h-11 w-11 items-center justify-center rounded-2xl font-display text-sm font-bold text-white shadow-glow">
            Q{index + 1}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Question
            </p>
            <p className="text-xs text-muted-foreground">
              Question {index + 1} of {total}
            </p>
          </div>
        </div>
      </div>

      <p className="relative mt-5 text-base leading-relaxed sm:text-lg">{text}</p>

      <div className={cn("relative mt-5 grid gap-2.5 sm:grid-cols-2", loading && "opacity-60")}>
        {options.map((opt, i) => {
          const isSelected = selected === i;
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              onClick={() => onSelect(i)}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all",
                isSelected
                  ? "border-transparent bg-cta-gradient text-white shadow-glow"
                  : "border-input bg-background/50 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold",
                  isSelected ? "bg-white/20 text-white" : "bg-muted text-foreground",
                )}
              >
                {optionLetter(i)}
              </div>
              <span
                className={cn(
                  "text-sm leading-snug",
                  isSelected ? "text-white" : "text-foreground",
                )}
              >
                {opt}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.section>
  );
}

// -------------- Palette --------------
function statusOf(
  i: number,
  current: number,
  answers: Record<number, number>,
): QState {
  if (i === current) return "current";
  if (answers[i] !== undefined) return "answered";
  return "unanswered";
}

function PaletteLegend() {
  const rows: { s: QState; label: string }[] = [
    { s: "answered", label: "Answered" },
    { s: "unanswered", label: "Unanswered" },
    { s: "current", label: "Current" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 text-[11px]">
      {rows.map((r) => (
        <div key={r.s} className="flex items-center gap-2">
          <PaletteDot state={r.s} />
          <span className="text-muted-foreground">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function PaletteDot({ state }: { state: QState }) {
  const cls: Record<QState, string> = {
    answered: "bg-emerald-500",
    unanswered: "bg-muted border border-border",
    current: "bg-cta-gradient ring-2 ring-primary/40",
  };
  return <span className={cn("inline-block h-3 w-3 rounded-md", cls[state])} />;
}

function PaletteGrid({
  total,
  current,
  answers,
  onJump,
}: {
  total: number;
  current: number;
  answers: Record<number, number>;
  questionIds: Record<number, string>;
  onJump: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
      {Array.from({ length: total }).map((_, i) => {
        const s = statusOf(i, current, answers);
        return (
          <button
            key={i}
            onClick={() => onJump(i)}
            className={cn(
              "aspect-square rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5",
              s === "answered" && "bg-emerald-500 text-white shadow-glow",
              s === "unanswered" &&
                "border border-border bg-background/60 text-foreground hover:bg-muted",
              s === "current" && "bg-cta-gradient text-white shadow-glow ring-2 ring-primary/50",
            )}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}


function PaletteSidebar(props: {
  total: number;
  current: number;
  answers: Record<number, number>;
  questionIds: Record<number, string>;

  onJump: (i: number) => void;
}) {
  return (
    <aside className="glass shadow-card-soft sticky top-[168px] hidden h-fit rounded-3xl p-4 lg:block">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">Question Palette</h3>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {Object.keys(props.answers).length}/{props.total}
        </span>
      </div>
      <PaletteGrid {...props} />
      <div className="mt-4 border-t border-border/60 pt-3">
        <PaletteLegend />
      </div>
    </aside>
  );
}

function PaletteSheet({
  open,
  onClose,
  ...props
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  current: number;
  answers: Record<number, number>;
  questionIds: Record<number, string>;

  onJump: (i: number) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="glass shadow-card-soft fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-3xl p-5 lg:hidden"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-semibold">Question Palette</h3>
                <p className="text-xs text-muted-foreground">
                  {Object.keys(props.answers).length}/{props.total} answered
                </p>
              </div>
              <button
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-input bg-background/60 hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <PaletteGrid {...props} onJump={(i) => (props.onJump(i), onClose())} />
            <div className="mt-4 border-t border-border/60 pt-3">
              <PaletteLegend />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// -------------- Submit dialog --------------
function SubmitDialog({
  open,
  onClose,
  onSubmit,
  answered,
  total,
  time,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  answered: number;
  total: number;
  time: string;
}) {
  const unanswered = Math.max(0, total - answered);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="glass shadow-card-soft relative w-full max-w-md overflow-hidden rounded-3xl p-6"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cta-gradient opacity-25 blur-3xl" />
              <div className="relative">
                <div className="bg-cta-gradient flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-glow">
                  <Send className="h-5 w-5" />
                </div>
                <h2 className="mt-4 font-display text-xl font-bold">
                  Are you sure you want to submit your exam?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You will not be able to change your answers after submission.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2 text-center">
                  <SummaryTile label="Total" value={total} tone="info" />
                  <SummaryTile label="Answered" value={answered} tone="success" />
                  <SummaryTile label="Unanswered" value={unanswered} tone="warn" />
                  <SummaryTile label="Time left" value={time} tone="primary" />
                </div>

                {unanswered > 0 && (
                  <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      You still have <b>{unanswered}</b> unanswered question
                      {unanswered === 1 ? "" : "s"}. Unanswered questions will be marked as skipped.
                    </p>
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
                  <button onClick={onSubmit} className={cn(primaryBtnCls, "flex-1")}>
                    <Send className="h-4 w-4" />
                    Yes, Submit
                  </button>
                  <button onClick={onClose} className={cn(ghostBtnCls, "flex-1")}>
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "info" | "success" | "warn" | "primary";
}) {
  const toneCls: Record<string, string> = {
    info: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
    primary: "bg-cta-gradient text-white ring-primary/20",
  };
  return (
    <div className={cn("rounded-2xl p-3 ring-1 ring-inset", toneCls[tone])}>
      <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

// -------------- Processing screen --------------
function ProcessingScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="glass shadow-card-soft relative w-full max-w-sm overflow-hidden rounded-3xl p-8 text-center"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-cta-gradient opacity-25 blur-3xl" />
        <div className="relative">
          <div className="mx-auto flex h-16 w-16 items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              className="bg-cta-gradient flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-glow"
            >
              <Loader2 className="h-7 w-7" />
            </motion.div>
          </div>
          <h2 className="mt-5 font-display text-lg font-bold">Submitting your exam</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitting your answers securely — please wait.
          </p>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Do not close this tab
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// -------------- Submitted screen --------------
function SubmittedScreen({
  attemptId,
  answered,
  total,
  onBack,
}: {
  attemptId: string | null;
  answered: number;
  total: number;
  onBack: () => void;
}) {
  const resultFn = useServerFn(getExamBatchAttemptResult);
  const [result, setResult] = useState<ResultVisibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let iv: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const r = await resultFn({ data: { attemptId } });
        if (cancelled) return;
        setResult(r);
        setLoading(false);
        // Once the rank is visible, no need to keep polling.
        if (r.rankVisible && iv) {
          clearInterval(iv);
          iv = null;
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load result.");
        setLoading(false);
      }
    };
    void load();
    // Poll every 30s so the rank appears automatically once the window closes.
    iv = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
    };
  }, [attemptId, resultFn]);

  const fallbackSkipped = Math.max(0, total - answered);
  const stats = result
    ? {
        total: result.totalQuestions,
        attempted: result.correct + result.wrong,
        correct: result.correct,
        wrong: result.wrong,
        unanswered: result.skipped,
        score: `${result.marks}/${result.maxMarks}`,
        percentage: `${Number(result.percentage).toFixed(2)}%`,
        timeTaken:
          result.timeUsedSeconds != null ? formatTime(result.timeUsedSeconds) : "--",
      }
    : {
        total,
        attempted: answered,
        correct: "--",
        wrong: "--",
        unanswered: fallbackSkipped,
        score: "--",
        percentage: "--",
        timeTaken: "--",
      };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-3xl"
    >
      <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6 text-center sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-cta-gradient opacity-25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-52 w-52 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.15 }}
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-glow"
          >
            <Trophy className="h-9 w-9" />
          </motion.div>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-500 ring-1 ring-emerald-500/30">
            <Sparkles className="h-3.5 w-3.5" /> Exam submitted
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold">
            Your response has been recorded
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Calculating your result…"
              : error
                ? error
                : "Here is your performance summary."}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ResultTile label="Total" value={stats.total} tone="primary" />
            <ResultTile label="Attempted" value={stats.attempted} tone="info" />
            <ResultTile label="Correct" value={stats.correct} tone="success" />
            <ResultTile label="Wrong" value={stats.wrong} tone="danger" />
            <ResultTile label="Unanswered" value={stats.unanswered} tone="warn" />
            <ResultTile label="Score" value={stats.score} tone="primary" />
            <ResultTile label="Percentage" value={stats.percentage} tone="success" />
            <ResultTile label="Time Taken" value={stats.timeTaken} tone="info" />
          </div>

          <div className="mt-6">
            {result?.rankVisible && result.rank != null ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                  Your Rank
                </p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                  #{result.rank}
                  {result.entryCount ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      of {result.entryCount}
                    </span>
                  ) : null}
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-left text-xs text-foreground/80">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>Rank will be available after the exam ends.</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-center">
            <button type="button" onClick={onBack} className={cn(primaryBtnCls)}>
              <ChevronLeft className="h-4 w-4" /> Back to Exam Batch
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}


function ResultTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "primary" | "success" | "danger" | "warn" | "info";
}) {
  const toneCls: Record<string, string> = {
    primary: "bg-cta-gradient text-white",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/25",
    danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/25",
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/25",
    info: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/25",
  };
  return (
    <div className={cn("rounded-2xl p-3", toneCls[tone])}>
      <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

// -------------- Skeleton --------------
export function ExamInterfaceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="glass shadow-card-soft h-24 animate-pulse rounded-2xl bg-muted/30" />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="glass shadow-card-soft h-96 animate-pulse rounded-3xl bg-muted/30" />
        <div className="glass shadow-card-soft hidden h-96 animate-pulse rounded-3xl bg-muted/30 lg:block" />
      </div>
    </div>
  );
}
