import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Award,
  Crown,
  Calculator,
  Scale,
  Receipt,
  Briefcase,
  Landmark,
  PiggyBank,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Bookmark,
  Flame,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Lightbulb,
  Loader2,
  Trophy,
  RotateCw,
  Eye,
  Clock,
  Target,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Search,
  Play,
  Layers,
  TrendingUp,
  Zap,
  Lock,
  Settings2,
  Timer,
  Shuffle,
} from "lucide-react";

import {
  listSubjects,
  listChapters,
  listMcqs,
  listSubjectProgress,
  listChapterProgress,
  listChapterPracticeAnswers,
  recordMcqPracticeProgress,
  revealMcqAnswers,
} from "@/lib/learning.functions";
import { useLevels } from "@/hooks/use-levels";
import { saveSessionAttempt } from "@/lib/student-performance.functions";
import {
  toggleMcqBookmark,
  listMyBookmarkIds,
  recordMcqOutcomes,
} from "@/lib/mcq-review.functions";

type Step = 0 | 1 | 2 | 3;

const LEVEL_TONES = [
  "var(--neon-purple)",
  "var(--neon-blue)",
  "oklch(0.82 0.16 85)",
  "var(--neon-pink)",
  "oklch(0.75 0.18 150)",
];
const LEVEL_ICONS = [Sparkles, Award, Crown];

const subjectIconMap: Record<string, { i: typeof Calculator; tone: string }> = {
  accounting: { i: Calculator, tone: "var(--neon-purple)" },
  "financial-accounting": { i: Calculator, tone: "var(--neon-purple)" },
  "management-accounting": { i: PiggyBank, tone: "oklch(0.78 0.15 200)" },
  "cost-accounting": { i: PiggyBank, tone: "oklch(0.78 0.15 200)" },
  audit: { i: Briefcase, tone: "var(--neon-blue)" },
  auditing: { i: Briefcase, tone: "var(--neon-blue)" },
  taxation: { i: Receipt, tone: "var(--neon-pink)" },
  tax: { i: Receipt, tone: "var(--neon-pink)" },
  vat: { i: Receipt, tone: "var(--neon-pink)" },
  law: { i: Scale, tone: "oklch(0.75 0.18 150)" },
  "business-law": { i: Scale, tone: "oklch(0.75 0.18 150)" },
  finance: { i: Landmark, tone: "oklch(0.82 0.16 85)" },
  "corporate-finance": { i: Landmark, tone: "oklch(0.82 0.16 85)" },
};
function iconFor(slug: string) {
  return subjectIconMap[slug?.toLowerCase()] ?? { i: BookOpen, tone: "var(--neon-purple)" };
}

const stepLabels = ["Level", "Subject", "Chapter", "Practice"];

type Mcq = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string | null;
};

type Choice = "A" | "B" | "C" | "D";
type AnswerRec = { chosen: Choice | null; timeMs: number } | undefined;

// ─── localStorage-based persistence for MCQ Practice resume ──────────────
// Stores both an "active session" snapshot (for refresh hydration on the
// practice page) and a per-chapter copy (for the Resume / Start From
// Beginning dialog when a student re-enters a chapter that has an
// unfinished session).
const MCQ_SESSION_KEY = "mcq-practice-session-v1";
const MCQ_RESUME_PREFIX = "mcq-practice-resume-v1:";
const mcqResumeKey = (chapterId: string) => `${MCQ_RESUME_PREFIX}${chapterId}`;
type PersistedMcq = {
  step: 0 | 1 | 2 | 3;
  level: string | null;
  subjectId: string | null;
  subjectName: string | null;
  chapterId: string | null;
  chapterName: string | null;
  current: number;
  batchIndex: number;
  allAnswers: AnswerRec[];
  sessionStart: number;
  sessionCount: "10" | "25" | "50" | "all";
  sessionTimerMin: number;
  customTimerOn: boolean;
  customTimerInput: string;
  sessionMode: "instant" | "submit-end";
  timeLeft: number;
  timeLeftSavedAt: number;
  finished: boolean;
  reviewMode: boolean;
  selectedOption: Choice | null;
  savedAttemptId: string | null;
};
function readMcqPersisted(): PersistedMcq | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(MCQ_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedMcq;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}
function readMcqChapterResume(chapterId: string): PersistedMcq | null {
  if (typeof window === "undefined" || !chapterId) return null;
  try {
    const raw = window.localStorage.getItem(mcqResumeKey(chapterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedMcq;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}
function writeMcqChapterResume(snapshot: PersistedMcq) {
  if (typeof window === "undefined") return;
  if (!snapshot.chapterId) return;
  try {
    window.localStorage.setItem(mcqResumeKey(snapshot.chapterId), JSON.stringify(snapshot));
  } catch {
    /* quota — ignore */
  }
}
function clearMcqChapterResume(chapterId: string | null | undefined) {
  if (typeof window === "undefined" || !chapterId) return;
  try {
    window.localStorage.removeItem(mcqResumeKey(chapterId));
  } catch {
    /* ignore */
  }
}
function clearMcqPersisted() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(MCQ_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

import { sanitizeOptionText } from "@/lib/sanitize-option";

function normalizeChoice(value: string | null | undefined): Choice | null {
  const normalized = (value ?? "").trim().toUpperCase();
  return normalized === "A" || normalized === "B" || normalized === "C" || normalized === "D"
    ? normalized
    : null;
}

function getNextUnansweredPosition(answers: AnswerRec[], total: number) {
  const safeTotal = Math.max(0, total || answers.length);
  const firstUnanswered = Array.from({ length: safeTotal }).findIndex((_, i) => !answers[i]);
  const absolute = firstUnanswered >= 0 ? firstUnanswered : Math.max(0, safeTotal - 1);
  const batchIndex = safeTotal > 0 ? Math.floor(absolute / BATCH_SIZE) : 0;
  return { absolute, batchIndex, current: absolute - batchIndex * BATCH_SIZE };
}

function buildAnswersFromSavedProgress(
  savedAnswers: Array<{ mcq_id: string; chosen_option: string | null; time_spent_ms: number | null }>,
  questions: Mcq[],
) {
  const savedByMcq = new Map(savedAnswers.map((a) => [a.mcq_id, a]));
  return questions.map((m) => {
    const saved = savedByMcq.get(m.id);
    const chosen = normalizeChoice(saved?.chosen_option);
    return chosen ? { chosen, timeMs: Math.max(0, saved?.time_spent_ms ?? 0) } : undefined;
  });
}

function debugMcq(label: string, payload?: unknown) {
  console.debug(`[MCQ Practice] ${label}`, payload ?? "");
}

function fmtDuration(sec: number) {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

type OptionState = "idle" | "correct" | "wrong" | "selected";

type OptionButtonProps = {
  questionId: string;
  optionKey: Choice;
  text: string;
  state: OptionState;
  clickable: boolean;
  onPick: (k: Choice) => void;
};

const OptionButton = memo(function OptionButton({
  optionKey,
  text,
  state,
  clickable,
  onPick,
}: OptionButtonProps) {
  const tone =
    state === "correct"
      ? "border-emerald-400/60 bg-emerald-400/10"
      : state === "wrong"
        ? "border-red-400/60 bg-red-400/10"
        : state === "selected"
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/50 hover:bg-muted/40";
  return (
    <button
      type="button"
      onClick={() => clickable && onPick(optionKey)}
      disabled={!clickable}
      className={`group relative flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors duration-150 ${tone} disabled:cursor-default`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-base font-bold transition-colors duration-150 ${
          state === "correct"
            ? "bg-emerald-500 text-white"
            : state === "wrong"
              ? "bg-red-500 text-white"
              : state === "selected"
                ? "bg-cta-gradient text-white shadow-glow"
                : "bg-muted text-foreground group-hover:bg-cta-gradient group-hover:text-white"
        }`}
      >
        {state === "correct" ? (
          <Check className="h-4 w-4" />
        ) : state === "wrong" ? (
          <X className="h-4 w-4" />
        ) : (
          optionKey
        )}
      </span>
      <span className="text-sm font-medium">{text}</span>
    </button>
  );
});

const BATCH_SIZE = 25;

export function McqFlow() {
  // ── Hydration: read persisted MCQ session once on mount. ──
  // Page-entry reset: always start from Level Selection on fresh mount.
  // Session resume data (localStorage chapter snapshots) is preserved;
  // the Resume Previous Progress dialog still appears after re-selecting
  // a chapter with unfinished progress.
  const persistedRef = useRef<PersistedMcq | null>(null);
  const persisted = persistedRef.current;
  const hydrated = !!persisted && !persisted.finished;

  const [step, _setStep] = useState<Step>(hydrated ? persisted!.step : 0);
  // Browser-history-aware step setter: pushes a history entry when moving
  // deeper into the flow so the phone/browser Back button walks back through
  // Level → Subject → Chapter → Practice instead of leaving the page (e.g.
  // jumping to Daily Progress where the user came from).
  const stepRef = useRef<Step>(hydrated ? persisted!.step : 0);
  const skipPushRef = useRef<boolean>(false);
  const setStep = useCallback((next: Step) => {
    _setStep((prev) => {
      if (next === prev) return prev;
      if (typeof window !== "undefined" && !skipPushRef.current && next > prev) {
        try {
          window.history.pushState({ __mcqStep: next }, "");
        } catch {
          /* ignore */
        }
      }
      skipPushRef.current = false;
      stepRef.current = next;
      return next;
    });
  }, []);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      const cur = stepRef.current;
      if (cur > 0) {
        skipPushRef.current = true;
        _setStep((cur - 1) as Step);
        stepRef.current = (cur - 1) as Step;
        // Re-push our own state so the next Back press can walk again
        try {
          window.history.pushState({ __mcqStep: cur - 1 }, "");
        } catch {
          /* ignore */
        }
      }
    };
    // Seed an initial entry so the very first Back press is captured.
    try {
      window.history.replaceState({ __mcqStep: stepRef.current }, "");
    } catch {
      /* ignore */
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [level, setLevel] = useState<string | null>(hydrated ? persisted!.level : null);
  const [subjectId, setSubjectId] = useState<string | null>(hydrated ? persisted!.subjectId : null);
  const [subjectName, setSubjectName] = useState<string | null>(hydrated ? persisted!.subjectName : null);
  const [chapterId, setChapterId] = useState<string | null>(hydrated ? persisted!.chapterId : null);
  const [chapterName, setChapterName] = useState<string | null>(hydrated ? persisted!.chapterName : null);
  const [openChapter, setOpenChapter] = useState<string | null>(null);

  const [current, setCurrent] = useState(hydrated ? persisted!.current : 0); // index within the current batch
  const [batchIndex, setBatchIndex] = useState(hydrated ? persisted!.batchIndex : 0);
  const [showExp, setShowExp] = useState(false);
  // Chapter-wide answer array. Index = global MCQ index across the whole chapter.
  const [allAnswers, setAllAnswers] = useState<AnswerRec[]>(
    hydrated ? (persisted!.allAnswers ?? []) : [],
  );
  const [selectedOption, setSelectedOption] = useState<Choice | null>(
    hydrated ? persisted!.selectedOption : null,
  );
  const [sessionStart, setSessionStart] = useState<number>(
    hydrated ? persisted!.sessionStart : 0,
  );
  const questionStartRef = useRef<number>(Date.now());
  const [finished, setFinished] = useState(false);
  const [reviewMode, setReviewMode] = useState(hydrated ? persisted!.reviewMode : false);
  const [saving, setSaving] = useState(false);
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(
    hydrated ? persisted!.savedAttemptId : null,
  );

  const [levelQuery, setLevelQuery] = useState("");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [chapterQuery, setChapterQuery] = useState("");
  const [pendingChapter, setPendingChapter] = useState<{
    id: string;
    name: string;
    description: string | null;
  } | null>(null);

  // Session config (chosen on the pre-session card)
  const [sessionCount, setSessionCount] = useState<"10" | "25" | "50" | "all">(
    hydrated ? persisted!.sessionCount : "all",
  );
  const [sessionTimerMin, setSessionTimerMin] = useState<number>(
    hydrated ? persisted!.sessionTimerMin : 0,
  ); // 0 = off
  const [customTimerOn, setCustomTimerOn] = useState<boolean>(
    hydrated ? persisted!.customTimerOn : false,
  );
  const [customTimerInput, setCustomTimerInput] = useState<string>(
    hydrated ? persisted!.customTimerInput : "15",
  );
  const [sessionMode, setSessionMode] = useState<"instant" | "submit-end">(
    hydrated ? persisted!.sessionMode : "instant",
  );
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    if (!hydrated) return 0;
    const elapsedSec = Math.max(
      0,
      Math.floor((Date.now() - (persisted!.timeLeftSavedAt || Date.now())) / 1000),
    );
    return Math.max(0, (persisted!.timeLeft || 0) - elapsedSec);
  });
  const autoFinishKeyRef = useRef<string | null>(null);
  const forceFreshChapterRef = useRef<string | null>(null);
  const pendingSnapshotAnswersRef = useRef<AnswerRec[] | null>(
    hydrated ? (persisted!.allAnswers ?? null) : null,
  );
  // Mark the chapter buffer as already-initialized when hydrating so the
  // auto-init effect doesn't wipe restored answers.
  const initializedChapterRef = useRef<string | null>(null);



  const listSubjectsFn = useServerFn(listSubjects);
  const listChaptersFn = useServerFn(listChapters);
  const listMcqsFn = useServerFn(listMcqs);
  const listSubjectProgressFn = useServerFn(listSubjectProgress);
  const listChapterProgressFn = useServerFn(listChapterProgress);
  const listChapterPracticeAnswersFn = useServerFn(listChapterPracticeAnswers);
  const recordPracticeProgressFn = useServerFn(recordMcqPracticeProgress);
  const revealMcqAnswersFn = useServerFn(revealMcqAnswers);

  // P3a-McQ-C1: server no longer ships correct_option/explanation in listMcqs.
  // We accumulate reveals from (a) per-submit `recordMcqPracticeProgress`
  // response, and (b) `revealMcqAnswers` calls for review / hydrate paths
  // (those calls are server-gated to MCQs the user has actually attempted).
  const revealMapRef = useRef<Map<string, { correct_option: string | null; explanation: string | null }>>(new Map());
  const [revealVersion, setRevealVersion] = useState(0);
  const bumpReveal = useCallback(() => setRevealVersion((v) => v + 1), []);
  const ingestReveals = useCallback(
    (items: Array<{ id: string; correct_option: string | null; explanation: string | null }>) => {
      if (!items?.length) return;
      let changed = false;
      for (const it of items) {
        if (!it?.id) continue;
        const prev = revealMapRef.current.get(it.id);
        if (!prev || prev.correct_option !== it.correct_option || prev.explanation !== it.explanation) {
          revealMapRef.current.set(it.id, {
            correct_option: it.correct_option ?? null,
            explanation: it.explanation ?? null,
          });
          changed = true;
        }
      }
      if (changed) bumpReveal();
    },
    [bumpReveal],
  );
  const saveAttemptFn = useServerFn(saveSessionAttempt);
  const toggleBookmarkFn = useServerFn(toggleMcqBookmark);
  const listBookmarkIdsFn = useServerFn(listMyBookmarkIds);
  const recordOutcomesFn = useServerFn(recordMcqOutcomes);
  const qc = useQueryClient();

  const refreshPracticeProgress = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["subject-progress", level], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: ["chapter-progress", subjectId], refetchType: "active" }),
      chapterId
        ? qc.invalidateQueries({ queryKey: ["chapter-practice-answers", chapterId] })
        : Promise.resolve(),
      qc.invalidateQueries({ queryKey: ["student-performance-center"], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: ["student-completion-tracker"], refetchType: "active" }),
    ]);
  }, [chapterId, level, qc, subjectId]);

  const levelsQ = useLevels({ includeLocked: true });
  const levelsList = levelsQ.data ?? [];
  const levelName = useMemo(
    () => levelsList.find((l) => l.code === level)?.name ?? level ?? "",
    [levelsList, level],
  );

  const bookmarksQ = useQuery({
    queryKey: ["my-bookmark-ids"],
    queryFn: () => listBookmarkIdsFn(),
    staleTime: 60_000,
  });
  const bookmarkSet = useMemo(() => new Set<string>(bookmarksQ.data ?? []), [bookmarksQ.data]);

  async function toggleBookmark(mcqId: string) {
    const wasBookmarked = bookmarkSet.has(mcqId);
    try {
      await toggleBookmarkFn({
        data: {
          mcqId,
          bookmarked: !wasBookmarked,
          chapterId: chapterId ?? null,
          subjectId: subjectId ?? null,
          level: level ?? null,
        },
      });
      qc.invalidateQueries({ queryKey: ["my-bookmark-ids"] });
      qc.invalidateQueries({ queryKey: ["mcq-bookmarks"] });
      qc.invalidateQueries({ queryKey: ["mcq-review-counts"] });
    } catch (e) {
      debugMcq("bookmark failed", e);
    }
  }

  const subjectsQ = useQuery({
    queryKey: ["subjects", level],
    queryFn: () => listSubjectsFn({ data: { level: level ?? undefined } }),
    enabled: !!level,
  });
  const subjectProgressQ = useQuery({
    queryKey: ["subject-progress", level],
    queryFn: () => listSubjectProgressFn({ data: { level: level ?? undefined } }),
    enabled: !!level,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  const subjectProgressMap = useMemo(() => {
    const m = new Map<string, { total: number; completed: number; percent: number }>();
    const rows = (subjectProgressQ.data ?? []) as Array<{
      subject_id: string;
      total: number;
      completed: number;
      percent: number;
    }>;
    rows.forEach((r) =>
      m.set(r.subject_id, { total: r.total, completed: r.completed, percent: r.percent }),
    );
    return m;
  }, [subjectProgressQ.data]);

  const chaptersQ = useQuery({
    queryKey: ["chapters", subjectId],
    queryFn: () => listChaptersFn({ data: { subjectId: subjectId! } }),
    enabled: !!subjectId,
  });
  const chapterProgressQ = useQuery({
    queryKey: ["chapter-progress", subjectId],
    queryFn: () => listChapterProgressFn({ data: { subjectId: subjectId! } }),
    enabled: !!subjectId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  const chapterProgressMap = useMemo(() => {
    const m = new Map<
      string,
      { total: number; completed: number; percent: number; correct: number; accuracy: number }
    >();
    const rows = (chapterProgressQ.data ?? []) as Array<{
      chapter_id: string;
      total: number;
      completed: number;
      percent: number;
      correct: number;
      accuracy: number;
    }>;
    rows.forEach((r) =>
      m.set(r.chapter_id, {
        total: r.total,
        completed: r.completed,
        percent: r.percent,
        correct: r.correct,
        accuracy: r.accuracy,
      }),
    );
    return m;
  }, [chapterProgressQ.data]);

  const mcqsQ = useQuery({
    queryKey: ["mcqs", chapterId],
    queryFn: () => listMcqsFn({ data: { chapterId: chapterId!, limit: 2000 } }),
    enabled: !!chapterId && step === 3,
  });
  const practiceAnswersQ = useQuery({
    queryKey: ["chapter-practice-answers", chapterId],
    queryFn: () => listChapterPracticeAnswersFn({ data: { chapterId: chapterId! } }),
    enabled: !!chapterId && step === 3,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Full chapter (all MCQs), optionally truncated by session config.
  // P3a-McQ-C1: merge revealMap so any downstream code reading m.correct_option
  // / m.explanation keeps working. Pre-submit MCQs read null, which the UI
  // already treats as "not yet revealed" (selection state, review chip).
  const rawMcqs = useMemo(() => {
    const base = (mcqsQ.data ?? []) as Mcq[];
    if (!revealMapRef.current.size) return base;
    return base.map((m) => {
      const rv = revealMapRef.current.get(m.id);
      if (!rv) return m;
      return {
        ...m,
        correct_option: rv.correct_option ?? m.correct_option ?? null,
        explanation: rv.explanation ?? m.explanation ?? null,
      };
    });
    // revealVersion is intentional: bump triggers recomputation of the merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcqsQ.data, revealVersion]);
  const allMcqs = useMemo(() => {
    if (sessionCount === "all") return rawMcqs;
    const n = Number(sessionCount);
    return rawMcqs.slice(0, n);
  }, [rawMcqs, sessionCount]);
  const totalAll = allMcqs.length;
  const numBatches = Math.max(1, Math.ceil(totalAll / BATCH_SIZE));
  const safeBatchIndex = Math.min(batchIndex, Math.max(0, numBatches - 1));
  const batchStart = safeBatchIndex * BATCH_SIZE;
  const batchEnd = Math.min(batchStart + BATCH_SIZE, totalAll);
  // Current batch view — keeps existing render code thinking in terms of "mcqs".
  const mcqs = useMemo(() => allMcqs.slice(batchStart, batchEnd), [allMcqs, batchStart, batchEnd]);
  const answers = useMemo(
    () => allAnswers.slice(batchStart, batchEnd),
    [allAnswers, batchStart, batchEnd],
  );
  const total = mcqs.length;
  const q = mcqs[current];
  const currentAnswer = answers[current];
  const submittedNow = !!currentAnswer; // true once student clicks Submit (or Skip) for this question
  // Reveal correct/wrong + explanation as soon as this question is submitted, plus in review/finish.
  const revealResults = reviewMode || finished || submittedNow;
  const picked: Choice | null = submittedNow ? (currentAnswer?.chosen ?? null) : selectedOption;

  // Initialize the chapter-wide answer buffer once MCQs and saved progress load.
  // Resume from the first actual unanswered MCQ based on saved answer rows, not
  // just a local/batch index.
  useEffect(() => {
    if (!chapterId || !mcqsQ.isSuccess || !practiceAnswersQ.isSuccess) return;
    if (initializedChapterRef.current === chapterId && allAnswers.length === totalAll) return;
    initializedChapterRef.current = chapterId;
    const freshStart = forceFreshChapterRef.current === chapterId;
    const snapshotAnswers = pendingSnapshotAnswersRef.current;
    const savedProgressAnswers = buildAnswersFromSavedProgress(practiceAnswersQ.data ?? [], allMcqs);
    const restoredAnswers = freshStart
      ? new Array<AnswerRec>(totalAll).fill(undefined)
      : allMcqs.map((_, i) => savedProgressAnswers[i] ?? snapshotAnswers?.[i]);
    const resume = freshStart
      ? { absolute: 0, batchIndex: 0, current: 0 }
      : getNextUnansweredPosition(restoredAnswers, totalAll);

    setAllAnswers(restoredAnswers);
    setBatchIndex(Math.min(resume.batchIndex, Math.max(0, numBatches - 1)));
    setCurrent(resume.current);
    setSelectedOption(restoredAnswers[resume.absolute]?.chosen ?? null);
    setSavedAttemptId(null);
    setSessionStart(Date.now());
    forceFreshChapterRef.current = null;
    pendingSnapshotAnswersRef.current = null;
    questionStartRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, mcqsQ.isSuccess, practiceAnswersQ.isSuccess, totalAll]);

  // P3a-McQ-C1: hydrate revealMap for MCQs the user has already attempted
  // (rows present in practiceAnswers). Server gates `revealMcqAnswers` to
  // attempted-only MCQs, so unattempted IDs are filtered out before sending.
  useEffect(() => {
    if (!chapterId || !mcqsQ.isSuccess || !practiceAnswersQ.isSuccess) return;
    const attempted = new Set(
      ((practiceAnswersQ.data ?? []) as Array<{ mcq_id?: string }>)
        .map((r) => r?.mcq_id)
        .filter((x): x is string => !!x),
    );
    const missing: string[] = [];
    for (const m of allMcqs) {
      if (attempted.has(m.id) && !revealMapRef.current.has(m.id)) missing.push(m.id);
    }
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await revealMcqAnswersFn({ data: { mcqIds: missing.slice(0, 500) } });
        if (cancelled) return;
        ingestReveals(
          (res as Array<{ id: string; correct_option: string | null; explanation: string | null }>) ?? [],
        );
      } catch (e) {
        debugMcq("reveal hydrate failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, mcqsQ.isSuccess, practiceAnswersQ.isSuccess, totalAll]);

  // ── Persist MCQ Practice session to sessionStorage on relevant changes. ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (finished) return; // cleared by the finish effect below
    try {
      const snapshot: PersistedMcq = {
        step,
        level,
        subjectId,
        subjectName,
        chapterId,
        chapterName,
        current,
        batchIndex,
        allAnswers,
        sessionStart,
        sessionCount,
        sessionTimerMin,
        customTimerOn,
        customTimerInput,
        sessionMode,
        timeLeft,
        timeLeftSavedAt: Date.now(),
        finished,
        reviewMode,
        selectedOption,
        savedAttemptId,
      };
      window.sessionStorage.setItem(MCQ_SESSION_KEY, JSON.stringify(snapshot));
      // Per-chapter durable copy for the Resume / Start From Beginning
      // dialog when the student re-enters this chapter later (survives
      // browser close). Only write a meaningful in-practice snapshot.
      if (
        step === 3 &&
        chapterId &&
        !reviewMode &&
        allAnswers.length > 0 &&
        allAnswers.some(Boolean)
      ) {
        writeMcqChapterResume(snapshot);
      }
    } catch {
      /* quota or serialization issues — ignore */
    }
  }, [
    step,
    level,
    subjectId,
    subjectName,
    chapterId,
    chapterName,
    current,
    batchIndex,
    allAnswers,
    sessionStart,
    sessionCount,
    sessionTimerMin,
    customTimerOn,
    customTimerInput,
    sessionMode,
    timeLeft,
    finished,
    reviewMode,
    selectedOption,
    savedAttemptId,
  ]);

  // Clear the persisted session as soon as practice is completed.
  useEffect(() => {
    if (finished) {
      clearMcqPersisted();
      clearMcqChapterResume(chapterId);
    }
  }, [finished, chapterId]);


  const options = useMemo(
    () =>
      q
        ? (
            [
              { k: "A" as Choice, t: sanitizeOptionText(q.option_a) },
              { k: "B" as Choice, t: sanitizeOptionText(q.option_b) },
              { k: "C" as Choice, t: sanitizeOptionText(q.option_c) },
              { k: "D" as Choice, t: sanitizeOptionText(q.option_d) },
            ] as ReadonlyArray<{ k: Choice; t: string }>
          ).filter((o) => o.t.length > 0)
        : ([] as ReadonlyArray<{ k: Choice; t: string }>),
    [q?.id, q?.option_a, q?.option_b, q?.option_c, q?.option_d],
  );

  const correctChoice = useMemo(
    () => (q ? normalizeChoice(q.correct_option) : null),
    [q?.id, q?.correct_option],
  );

  // Stable click handler — ignores re-selecting the same option (prevents
  // duplicate state writes / re-renders from rapid clicks).
  const pickOption = useCallback((k: Choice) => {
    setSelectedOption((prev) => (prev === k ? prev : k));
  }, []);

  // Derived metrics for the current batch (drives the in-question UI).
  const stats = useMemo(() => {
    let correct = 0,
      wrong = 0,
      skipped = 0,
      attempted = 0;
    answers.forEach((a, i) => {
      if (!a || !mcqs[i]) return;
      if (a.chosen === null) skipped++;
      else {
        attempted++;
        if (a.chosen === normalizeChoice(mcqs[i].correct_option)) correct++;
        else wrong++;
      }
    });
    const submitted = answers.filter(Boolean).length;
    const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;
    const score = total ? Math.round((correct / total) * 100) : 0;
    return { correct, wrong, skipped, attempted, submitted, accuracy, score };
  }, [answers, mcqs, total]);

  // Chapter-wide rollup — drives the "X / Total Completed" progress chip & sidebar.
  const statsAll = useMemo(() => {
    let correct = 0,
      wrong = 0,
      skipped = 0,
      attempted = 0;
    allAnswers.forEach((a, i) => {
      if (!a || !allMcqs[i]) return;
      if (a.chosen === null) skipped++;
      else {
        attempted++;
        if (a.chosen === normalizeChoice(allMcqs[i].correct_option)) correct++;
        else wrong++;
      }
    });
    const submitted = allAnswers.filter(Boolean).length;
    const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;
    return { correct, wrong, skipped, attempted, submitted, accuracy };
  }, [allAnswers, allMcqs]);

  const allSubmitted = total > 0 && stats.submitted === total; // batch complete
  const chapterAllSubmitted = totalAll > 0 && statsAll.submitted === totalAll;
  const isLastBatch = safeBatchIndex >= numBatches - 1;

  // reset question timer on navigation; rehydrate selectedOption from prior answer
  useEffect(() => {
    questionStartRef.current = Date.now();
    setShowExp(false);
    setSelectedOption(answers[current]?.chosen ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, batchIndex, chapterId]);

  // Resume dialog state: shown when the student re-enters a chapter that
  // has a saved unfinished session in localStorage.
  const [resumePrompt, setResumePrompt] = useState<{
    id: string;
    name: string;
    snapshot: PersistedMcq;
  } | null>(null);

  function hydrateFromSnapshot(snap: PersistedMcq) {
    setLevel(snap.level ?? level);
    setSubjectId(snap.subjectId ?? subjectId);
    setSubjectName(snap.subjectName ?? subjectName);
    setChapterId(snap.chapterId);
    setChapterName(snap.chapterName);
    const restoredAnswers = snap.allAnswers ?? [];
    pendingSnapshotAnswersRef.current = restoredAnswers;
    setAllAnswers(restoredAnswers);
    const resume = getNextUnansweredPosition(restoredAnswers, restoredAnswers.length);
    const resumeAbs = resume.absolute;
    setCurrent(resume.current);
    setBatchIndex(resume.batchIndex);
    // selectedOption is only meaningful for the question being displayed; if
    // the resume target is unanswered, ensure no stale selection is shown.
    setSelectedOption(restoredAnswers[resumeAbs]?.chosen ?? null);
    setSessionStart(snap.sessionStart || Date.now());
    setSessionCount(snap.sessionCount ?? "all");
    setSessionTimerMin(snap.sessionTimerMin ?? 0);
    setCustomTimerOn(!!snap.customTimerOn);
    setCustomTimerInput(snap.customTimerInput ?? "15");
    setSessionMode(snap.sessionMode ?? "instant");
    const elapsedSec = Math.max(
      0,
      Math.floor((Date.now() - (snap.timeLeftSavedAt || Date.now())) / 1000),
    );
    setTimeLeft(Math.max(0, (snap.timeLeft || 0) - elapsedSec));
    setFinished(false);
    setReviewMode(!!snap.reviewMode);
    setSavedAttemptId(snap.savedAttemptId ?? null);
    initializedChapterRef.current = null;
    forceFreshChapterRef.current = null;
    autoFinishKeyRef.current = null;
    questionStartRef.current = Date.now();
    setStep(3);
  }

  function gotoChapter(id: string, name: string, opts?: { force?: boolean }) {
    // If a saved session for this exact chapter is still in progress, resume
    // it instead of resetting answers/timer/progress.
    if (
      !opts?.force &&
      id === chapterId &&
      !finished &&
      allAnswers.length > 0 &&
      allAnswers.some(Boolean)
    ) {
      const resume = getNextUnansweredPosition(allAnswers, totalAll);
      setBatchIndex(Math.min(resume.batchIndex, Math.max(0, numBatches - 1)));
      setCurrent(resume.current);
      setSelectedOption(allAnswers[resume.absolute]?.chosen ?? null);
      setStep(3);
      debugMcq("chapter resume (in-memory)", { chapterId: id });
      return;
    }
    // Cross-session resume: durable per-chapter snapshot in localStorage.
    if (!opts?.force) {
      const snap = readMcqChapterResume(id);
      const cprog = chapterProgressMap.get(id);
      const isComplete = !!cprog && cprog.total > 0 && cprog.completed >= cprog.total;
      const snapAnswers = snap?.allAnswers ?? [];
      const snapHasUnanswered = snapAnswers.some(Boolean) && snapAnswers.some((a) => !a);
      if (
        snap &&
        !snap.finished &&
        !isComplete &&
        snapHasUnanswered
      ) {
        setResumePrompt({ id, name, snapshot: snap });
        return;
      }
    }
    // Starting a brand-new practice (different chapter or no prior state):
    // clear any persisted snapshot from a prior chapter first.
    clearMcqPersisted();
    clearMcqChapterResume(id);
    forceFreshChapterRef.current = opts?.force ? id : null;
    setChapterId(id);
    setChapterName(name);
    setStep(3);
    setCurrent(0);
    setBatchIndex(0);
    setShowExp(false);
    setAllAnswers([]);
    initializedChapterRef.current = null;
    setSelectedOption(null);
    setFinished(false);
    setReviewMode(false);
    setSavedAttemptId(null);
    autoFinishKeyRef.current = null;
    setSessionStart(Date.now());
    questionStartRef.current = Date.now();
    debugMcq("chapter start", { chapterId: id, chapterName: name, level, subjectId, subjectName });
  }


  function gotoBatch(nextBatch: number) {
    const clamped = Math.max(0, Math.min(numBatches - 1, nextBatch));
    setBatchIndex(clamped);
    setCurrent(0);
    setShowExp(false);
    setSelectedOption(null);
    setSavedAttemptId(null);
    setSessionStart(Date.now());
    questionStartRef.current = Date.now();
  }

  function recordAnswer(chosen: Choice | null) {
    if (!q) return;
    const elapsed = Math.max(0, Date.now() - questionStartRef.current);
    const globalIndex = batchStart + current;
    setAllAnswers((prev) => {
      const base = prev.length === totalAll ? [...prev] : new Array(totalAll).fill(undefined);
      base[globalIndex] = { chosen, timeMs: Math.min(elapsed, 60 * 60 * 1000) };
      debugMcq("answer recorded", {
        globalIndex,
        batchIndex: safeBatchIndex,
        chosen,
        answeredInChapter: base.filter(Boolean).length,
        totalChapter: totalAll,
      });
      return base;
    });
  }

  // P3a-McQ-H3: prevent double-submit on rapid clicks. submitAnswer kicks
  // off async progress + outcome writes; a second click would call the
  // incrementing `record_mcq_practice_answer` RPC twice and corrupt the
  // "MCQs Solved" counter.
  const submittingRef = useRef<string | null>(null);
  async function submitAnswer(chosen: Choice | null) {
    if (!q || reviewMode) return;
    if (submittingRef.current === q.id) return;
    submittingRef.current = q.id;
    // Manual submit only — records answer, reveals correctness + explanation, NO auto-advance.
    debugMcq("submit trigger", {
      currentIndex: current,
      globalIndex: batchStart + current,
      chosen,
      isLastInBatch: current === total - 1,
      isLastBatch,
    });

    const mcqId = q.id;
    const timeMs = Math.min(Math.max(0, Date.now() - questionStartRef.current), 60 * 60 * 1000);

    // SPEED: if the reveal for this MCQ is already cached (previously attempted
    // + hydrated, or fetched by a prior submit), the UI can render green/red
    // on the very next frame without any network wait. The DB write still
    // runs — just in the background — so re-submission counters stay correct.
    const revealCached =
      chosen === null || revealMapRef.current.has(mcqId);

    const runWrite = () =>
      recordPracticeProgressFn({
        data: {
          level: level ?? null,
          subjectId: subjectId ?? null,
          chapterId: chapterId ?? null,
          answers: [{ mcqId, chosen: chosen!, timeMs }],
        },
      })
        .then((res) => {
          ingestReveals(
            ((res as { reveals?: Array<{ id: string; correct_option: string | null; explanation: string | null }> } | undefined)?.reveals) ?? [],
          );
        })
        .catch(async (e) => {
          debugMcq("practice progress record failed", e);
          try {
            const rev = await revealMcqAnswersFn({ data: { mcqIds: [mcqId] } });
            ingestReveals(
              (rev as Array<{ id: string; correct_option: string | null; explanation: string | null }>) ?? [],
            );
          } catch (e2) {
            debugMcq("reveal fallback failed", e2);
          }
        });

    // FLICKER FIX (first attempt only): await the reveal BEFORE flipping
    // submittedNow so the first render post-submit already has correctChoice.
    // For cached reveals (retries), skip the await entirely — the picked
    // option renders as green/red instantly on the next frame.
    if (chosen !== null && !revealCached) {
      await runWrite();
    } else if (chosen !== null) {
      void runWrite();
    }

    // Atomic reveal: batched into a single render.
    recordAnswer(chosen);
    setShowExp(true);

    // Background: refresh persisted progress + wrong/mastery outcomes.
    // These do NOT block the reveal UI.
    void (async () => {
      try {
        if (chosen !== null) {
          try {
            await refreshPracticeProgress();
          } catch (e) {
            debugMcq("practice progress refresh failed", e);
          }
        }
        if (sessionMode === "instant") {
          try {
            await recordOutcomesFn({
              data: {
                level: level ?? null,
                subjectId: subjectId ?? null,
                chapterId: chapterId ?? null,
                outcomes: [{ mcqId, chosen }],
              },
            });
            qc.invalidateQueries({ queryKey: ["mcq-wrong"] });
            qc.invalidateQueries({ queryKey: ["mcq-review-counts"] });
          } catch (e) {
            debugMcq("wrong/mastery outcome record failed", e);
          }
        }
      } finally {
        if (submittingRef.current === mcqId) submittingRef.current = null;
      }
    })();
  }


  function nextQ() {
    if (current < total - 1) {
      setCurrent((c) => c + 1);
    } else if (!isLastBatch) {
      // Seamlessly cross into the next batch — saves the current batch in the
      // background and lands on the first question of the next batch.
      finishPractice({ finalize: false, auto: true });
    }
  }
  function prevQ() {
    if (current > 0) {
      setCurrent((c) => c - 1);
    } else if (safeBatchIndex > 0) {
      // Cross-batch back: land on the last question of the previous batch.
      const prev = safeBatchIndex - 1;
      const prevStart = prev * BATCH_SIZE;
      const prevEnd = Math.min(prevStart + BATCH_SIZE, totalAll);
      setBatchIndex(prev);
      setCurrent(prevEnd - prevStart - 1);
      setShowExp(false);
      setSelectedOption(null);
      questionStartRef.current = Date.now();
    }
  }
  function jumpTo(i: number) {
    if (i >= 0 && i < total) setCurrent(i);
  }

  // Persist a single batch (or the final chapter completion) as an exam attempt.
  // For non-final batches, this also rolls forward to the next batch.
  const finishPractice = useCallback(
    async (opts?: { auto?: boolean; finalize?: boolean }) => {
      if (saving) return;
      const finalize = opts?.finalize ?? isLastBatch;
      if (finished && savedAttemptId && finalize) return;

      const batchAnswersRaw = allAnswers.slice(batchStart, batchEnd);
      const finalizedAnswers = mcqs.map(
        (_, i) => batchAnswersRaw[i] ?? { chosen: null, timeMs: 0 },
      );
      const totalDurationSec = Math.max(
        1,
        Math.round((Date.now() - (sessionStart || Date.now())) / 1000),
      );
      const localCorrect = finalizedAnswers.reduce(
        (sum, a, i) =>
          sum +
          (a?.chosen !== null && a?.chosen === normalizeChoice(mcqs[i]?.correct_option) ? 1 : 0),
        0,
      );
      const localSkipped = finalizedAnswers.filter((a) => a?.chosen === null).length;
      const localWrong = Math.max(0, total - localCorrect - localSkipped);
      const localAttempted = total - localSkipped;
      const localScore = total ? Math.round((localCorrect / total) * 100) : 0;
      const localAccuracy = localAttempted ? Math.round((localCorrect / localAttempted) * 100) : 0;

      debugMcq("save batch", {
        auto: !!opts?.auto,
        finalize,
        batchIndex: safeBatchIndex,
        numBatches,
        batchSize: total,
        totalChapter: totalAll,
        localCorrect,
        localWrong,
        localSkipped,
        localScore,
        localAccuracy,
      });

      // Mount the final result screen immediately when finalizing. The DB save
      // runs after so a network/RLS failure can never strand the student.
      setAllAnswers((prev) => {
        const base = prev.length === totalAll ? [...prev] : new Array(totalAll).fill(undefined);
        finalizedAnswers.forEach((a, i) => {
          base[batchStart + i] = a;
        });
        return base;
      });
      if (finalize) {
        setFinished(true);
        setReviewMode(false);
      }

      // Advance to the next batch IMMEDIATELY so the UI never gets stuck on a
      // slow/failing save. The DB save below runs in the background and does
      // not block pagination. For the final batch (finalize=true) we keep the
      // user on the results screen.
      if (!finalize && safeBatchIndex < numBatches - 1) {
        gotoBatch(safeBatchIndex + 1);
      }

      setSaving(true);

      // Ensure answer record for every question in this batch (missing = skipped)
      const finalAnswers = mcqs.map((m, i) => {
        const a = finalizedAnswers[i];
        return {
          mcqId: m.id,
          chosen: a?.chosen ?? null,
          timeMs: Math.min(a?.timeMs ?? 0, 60 * 60 * 1000),
        };
      });

      try {
        const res = await saveAttemptFn({
          data: {
            kind: "mcq_practice",
            subjectId: subjectId ?? null,
            chapterId: chapterId ?? null,
            level: level ?? null,
            title: `${chapterName ?? "MCQ Practice"} · Batch ${safeBatchIndex + 1}/${numBatches}`,
            durationSeconds: totalDurationSec,
            answers: finalAnswers,
            meta: {
              auto: !!opts?.auto,
              batchIndex: safeBatchIndex,
              numBatches,
              batchStart,
              batchEnd,
              totalChapter: totalAll,
              score: localScore,
              accuracy: localAccuracy,
              correct: localCorrect,
              wrong: localWrong,
              skipped: localSkipped,
              finalize,
            },
          },
        });
        setSavedAttemptId(res.attemptId);
        debugMcq("DB save success", {
          attemptId: res.attemptId,
          score: res.score,
          correct: res.correct,
          total: res.total,
        });
        try {
          const progressAnswers = mcqs.map((m, i) => {
            const a = finalizedAnswers[i];
            return {
              mcqId: m.id,
              chosen: a?.chosen ?? null,
              timeMs: Math.min(a?.timeMs ?? 0, 60 * 60 * 1000),
            };
          });
          // P3a-McQ-H4: in instant mode, submitAnswer already recorded each
          // answer per-question via record_mcq_practice_answer, which
          // increments attempt_count. Re-recording the whole batch here
          // would double-count every submission. Only submit-end mode
          // needs the batch flush.
          if (sessionMode === "submit-end") {
            const res = await recordPracticeProgressFn({
              data: {
                level: level ?? null,
                subjectId: subjectId ?? null,
                chapterId: chapterId ?? null,
                answers: progressAnswers,
              },
            });
            ingestReveals(
              ((res as { reveals?: Array<{ id: string; correct_option: string | null; explanation: string | null }> } | undefined)?.reveals) ?? [],
            );
          }
        } catch (e) {
          debugMcq("record practice progress failed", e);
        }

        // Record wrong/mastered outcomes for the Wrong Questions section only
        // when per-question instant sync has not already recorded them.
        if (sessionMode === "submit-end") {
          try {
            const outcomes = mcqs.map((m, i) => {
              const a = finalizedAnswers[i];
              return {
                mcqId: m.id,
                chosen: a?.chosen ?? null,
              };
            });
            await recordOutcomesFn({
              data: {
                level: level ?? null,
                subjectId: subjectId ?? null,
                chapterId: chapterId ?? null,
                outcomes,
              },
            });
          } catch (e) {
            debugMcq("record outcomes failed", e);
          }
        }
        // Refresh dashboard views immediately
        await refreshPracticeProgress();
        qc.invalidateQueries({ queryKey: ["exam-attempts"] });
        qc.invalidateQueries({ queryKey: ["mcq-wrong"] });
        qc.invalidateQueries({ queryKey: ["mcq-review-counts"] });
      } catch (e) {
        debugMcq("DB save failed", e);
      } finally {
        setSaving(false);
      }
    },
    [
      allAnswers,
      batchEnd,
      batchStart,
      chapterId,
      chapterName,
      current,
      finished,
      isLastBatch,
      level,
      mcqs,
      numBatches,
      qc,
      recordOutcomesFn,
      recordPracticeProgressFn,
      refreshPracticeProgress,
      safeBatchIndex,
      saveAttemptFn,
      savedAttemptId,
      saving,
      sessionMode,
      sessionStart,
      subjectId,
      total,
      totalAll,
    ],
  );

  useEffect(() => {
    if (step !== 3 || total === 0) return;
    debugMcq("state", {
      currentIndex: current,
      answeredCount: stats.submitted,
      totalQuestions: total,
      allSubmitted,
      finished,
      saving,
      reviewMode,
    });
  }, [allSubmitted, current, finished, reviewMode, saving, stats.submitted, step, total]);

  function restartSame() {
    if (!chapterId || !chapterName) return;
    clearMcqPersisted();
    gotoChapter(chapterId, chapterName, { force: true });
    mcqsQ.refetch();
  }



  const inPractice = step === 3;

  // "Ready to start" panel — rendered inline directly under the selected
  // chapter row (closes over current state).
  const renderReadyPanel = () => {
    if (!pendingChapter) return null;
    const cprog = chapterProgressMap.get(pendingChapter.id);
    const total = cprog?.total ?? 0;
    const accuracy = cprog?.accuracy ?? 0;
    const completed = cprog?.completed ?? 0;
    const estMin = Math.max(1, Math.round((total || 10) * 0.6));
    // ── Resume detection: prefer the precise localStorage snapshot; fall
    // back to server-side chapter progress (works across devices). The
    // resume choice is offered ONLY when the chapter is unfinished AND
    // the student has at least one submitted answer.
    const localSnap =
      typeof window !== "undefined" ? readMcqChapterResume(pendingChapter.id) : null;
    const snapAnswered = (localSnap?.allAnswers ?? []).filter(Boolean).length;
    const isChapterComplete = total > 0 && completed >= total;
    const resumeAnswered = Math.max(snapAnswered, completed);
    const resumeTotal = Math.max(
      total,
      localSnap?.allAnswers?.length ?? 0,
    );
    const hasResume =
      !isChapterComplete &&
      resumeAnswered > 0 &&
      (resumeTotal === 0 || resumeAnswered < resumeTotal) &&
      (!localSnap || !localSnap.finished);
    const nextQ = Math.min(resumeAnswered + 1, Math.max(1, resumeTotal || resumeAnswered + 1));
    return (
      <div className="glass shadow-glow relative overflow-hidden rounded-3xl p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--neon-purple)]/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-[var(--neon-blue)]/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--neon-purple)]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--neon-purple)] ring-1 ring-[var(--neon-purple)]/30">
              <Play className="h-3 w-3" /> Ready to start
            </span>
            <h3 className="font-display mt-3 text-2xl font-bold leading-snug">
              {pendingChapter.name}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {levelName} · {subjectName}
            </p>
          </div>
          {!hasResume && (
            <button
              onClick={() => {
                const pc = pendingChapter;
                setPendingChapter(null);
                gotoChapter(pc.id, pc.name);
              }}
              className="bg-cta-gradient group inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-glow transition-transform hover:scale-[1.03]"
            >
              <Play className="h-4 w-4" /> Start Practice{" "}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          )}
        </div>
        {hasResume && (
          <div
            className="relative mt-5 rounded-2xl border border-[var(--neon-purple)]/30 bg-[var(--neon-purple)]/5 p-4"
            role="region"
            aria-label="Resume previous progress"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-cta-gradient text-white shadow-glow">
                <RotateCw className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold leading-tight">
                  Unfinished practice detected
                </p>
                <p className="text-[11px] text-muted-foreground">
                  You previously solved{" "}
                  <span className="font-semibold text-foreground">{resumeAnswered}</span>
                  {resumeTotal ? (
                    <>
                      {" "}
                      of <span className="font-semibold text-foreground">{resumeTotal}</span>
                    </>
                  ) : null}{" "}
                  MCQs. Your next question is{" "}
                  <span className="font-semibold text-foreground">#{nextQ}</span>.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  const pc = pendingChapter;
                  setPendingChapter(null);
                  // Continue: gotoChapter will hydrate from the localStorage
                  // snapshot when present (precise restore); otherwise it
                  // opens the chapter and the existing batch-resume effect
                  // auto-skips to the next unanswered batch using
                  // server-side completed count.
                  gotoChapter(pc.id, pc.name);
                }}
                className="bg-cta-gradient group inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-glow transition-transform hover:scale-[1.02]"
              >
                <Play className="h-4 w-4" /> Continue Previous Progress
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const pc = pendingChapter;
                  setPendingChapter(null);
                  // Start From Beginning: clear this chapter's local session
                  // snapshot only — server-side analytics / progress remain
                  // untouched per spec.
                  clearMcqChapterResume(pc.id);
                  clearMcqPersisted();
                  gotoChapter(pc.id, pc.name, { force: true });
                }}
                className="glass inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-colors hover:bg-muted/50"
              >
                <RotateCw className="h-4 w-4" /> Start From Beginning
              </button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Recommended: Continue keeps your submitted answers, timer state, and current
              question position. Start From Beginning only resets this chapter&rsquo;s
              practice session — analytics and history are unchanged.
            </p>
          </div>
        )}
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat icon={Layers} label="Total Questions" value={String(total || "—")} tone="var(--neon-purple)" />
          <SummaryStat icon={Clock} label="Estimated Time" value={`${estMin} min`} tone="var(--neon-blue)" />
          <SummaryStat icon={Target} label="Previous Accuracy" value={completed ? `${accuracy}%` : "—"} tone="oklch(0.75 0.18 150)" />
          <SummaryStat icon={Trophy} label="Recommended Goal" value="80%+" tone="oklch(0.82 0.16 85)" />
        </div>
        <div className="relative mt-5 rounded-2xl border border-border/60 bg-background/40 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            <Settings2 className="h-3.5 w-3.5" /> Session settings
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Shuffle className="h-3 w-3" /> Question count
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(["10", "25", "50", "all"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setSessionCount(c)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition-all ${sessionCount === c ? "bg-cta-gradient text-white shadow-glow" : "glass text-foreground/70 hover:text-foreground"}`}
                  >
                    {c === "all" ? "All" : c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Timer className="h-3 w-3" /> Timer
              </label>
              <div className="flex flex-wrap gap-1.5">
                {([0, 5, 10, 20] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setCustomTimerOn(false);
                      setSessionTimerMin(m);
                      setTimeLeft(m * 60);
                    }}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${!customTimerOn && sessionTimerMin === m ? "bg-cta-gradient text-white shadow-glow" : "glass text-foreground/70 hover:text-foreground"}`}
                  >
                    {m === 0 ? "Off" : `${m}m`}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setCustomTimerOn(true);
                    const parsed = Math.max(1, Math.min(300, Math.floor(Number(customTimerInput) || 0)));
                    setSessionTimerMin(parsed);
                    setTimeLeft(parsed * 60);
                  }}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${customTimerOn ? "bg-cta-gradient text-white shadow-glow" : "glass text-foreground/70 hover:text-foreground"}`}
                >
                  Custom
                </button>
                {customTimerOn && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={300}
                      value={customTimerInput}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "");
                        setCustomTimerInput(v);
                        const parsed = Math.max(1, Math.min(300, Math.floor(Number(v) || 0)));
                        if (parsed > 0) {
                          setSessionTimerMin(parsed);
                          setTimeLeft(parsed * 60);
                        }
                      }}
                      className="w-16 rounded-full bg-background/60 px-2 py-1 text-[11px] font-semibold text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-[var(--neon-purple)]"
                      placeholder="min"
                      aria-label="Custom timer in minutes"
                    />
                    <span className="text-[10px] font-semibold text-muted-foreground">min</span>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Lightbulb className="h-3 w-3" /> Mode
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSessionMode("instant")}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${sessionMode === "instant" ? "bg-cta-gradient text-white shadow-glow" : "glass text-foreground/70 hover:text-foreground"}`}
                >
                  Instant explanation
                </button>
                <button
                  onClick={() => setSessionMode("submit-end")}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${sessionMode === "submit-end" ? "bg-cta-gradient text-white shadow-glow" : "glass text-foreground/70 hover:text-foreground"}`}
                >
                  Submit at end
                </button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {timeLeft > 0
              ? `Live countdown will auto-submit after ${sessionTimerMin}m.`
              : "Untimed practice."}{" "}
            · Active scope:{" "}
            {sessionCount === "all"
              ? `${total || 0} MCQs`
              : `${Math.min(Number(sessionCount), total || 0)} of ${total || 0}`}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className={`grid grid-cols-1 gap-5 ${inPractice ? "xl:grid-cols-[1fr_320px]" : ""}`}>
      {resumePrompt && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mcq-resume-title"
        >
          <div className="glass shadow-glow w-full max-w-md rounded-3xl p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cta-gradient text-white shadow-glow">
                <RotateCw className="h-5 w-5" />
              </div>
              <div>
                <h3 id="mcq-resume-title" className="font-display text-lg font-bold">
                  Continue Previous Progress?
                </h3>
                <p className="text-xs text-muted-foreground">{resumePrompt.name}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              You have an unfinished practice session for this chapter. Continue from where you left off, or start over from Question 1.
            </p>
            {(() => {
              const snap = resumePrompt.snapshot;
              const answered = (snap.allAnswers ?? []).filter(Boolean).length;
              const totalSnap = snap.allAnswers?.length ?? 0;
              const nextQ = Math.min(answered + 1, Math.max(1, totalSnap));
              return (
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Progress</p>
                    <p className="mt-1 font-display text-base font-bold">
                      {answered}/{totalSnap || "—"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Next Question</p>
                    <p className="mt-1 font-display text-base font-bold">Q{nextQ}</p>
                  </div>
                </div>
              );
            })()}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  const p = resumePrompt;
                  setResumePrompt(null);
                  hydrateFromSnapshot(p.snapshot);
                }}
                className="bg-cta-gradient inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-glow transition-transform hover:scale-[1.02]"
              >
                <Play className="h-4 w-4" /> Continue Practice
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = resumePrompt;
                  setResumePrompt(null);
                  clearMcqChapterResume(p.id);
                  clearMcqPersisted();
                  gotoChapter(p.id, p.name, { force: true });
                }}
                className="glass inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-colors hover:bg-muted/50"
              >
                <RotateCw className="h-4 w-4" /> Start From Beginning
              </button>
            </div>
            <button
              type="button"
              onClick={() => setResumePrompt(null)}
              className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="min-w-0 space-y-5">
        {/* Premium connected stepper — only on practice step */}
        {inPractice && (
          <div className="glass shadow-card-soft relative overflow-hidden rounded-2xl p-4 sm:p-5">
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[var(--neon-purple)]/15 blur-3xl" />
            <div className="pointer-events-none absolute -left-16 -bottom-16 h-40 w-40 rounded-full bg-[var(--neon-blue)]/15 blur-3xl" />
            <div className="relative flex items-center gap-1 overflow-x-auto">
              {stepLabels.map((l, i) => {
                const active = step === i;
                const done = i < step;
                const locked = i > step;
                const ctxName =
                  i === 0 ? null : i === 1 ? levelName : i === 2 ? subjectName : chapterName;
                return (
                  <div key={l} className="flex min-w-fit flex-1 items-center gap-1">
                    <button
                      onClick={() => i <= step && setStep(i as Step)}
                      disabled={locked}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all ${
                        active
                          ? "bg-gradient-to-r from-[var(--neon-purple)]/15 via-[var(--neon-blue)]/10 to-transparent ring-1 ring-inset ring-[var(--neon-purple)]/40 shadow-glow"
                          : done
                            ? "hover:bg-muted/50"
                            : "opacity-60"
                      } ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span
                        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                          active
                            ? "bg-cta-gradient text-white shadow-[0_0_18px_var(--neon-purple)]"
                            : done
                              ? "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/40"
                              : "bg-muted/60 text-muted-foreground ring-1 ring-border"
                        }`}
                      >
                        {done ? <Check className="h-4 w-4" /> : i + 1}
                        {active && (
                          <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[var(--neon-purple)]/30" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-[10px] uppercase tracking-widest ${active ? "text-[var(--neon-purple)]" : "text-muted-foreground"}`}
                        >
                          Step {i + 1}
                        </p>
                        <p
                          className={`truncate text-sm font-bold ${active || done ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          {l}
                        </p>
                        {ctxName && (done || active) && (
                          <p className="truncate text-[10px] text-muted-foreground">{ctxName}</p>
                        )}
                      </div>
                    </button>
                    {i < stepLabels.length - 1 && (
                      <div className="hidden h-px w-6 shrink-0 sm:block">
                        <div
                          className={`h-full w-full rounded-full ${done ? "bg-gradient-to-r from-emerald-500/60 to-[var(--neon-purple)]/60" : "bg-border"}`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 1 — LEVEL */}
        {step === 0 && (
          <section className="animate-fade-up">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">Step 1: Select Your Level</h2>
                <p className="text-sm text-muted-foreground">
                  Choose the level of exam you are preparing for.
                </p>
              </div>
              <SearchInput
                value={levelQuery}
                onChange={setLevelQuery}
                placeholder="Search level…"
              />
            </div>

            {levelsQ.isLoading ? (
              <LoadingBlock />
            ) : levelsList.length === 0 ? (
              <EmptyState text="No levels published yet. Ask an admin to add levels." />
            ) : (
              (() => {
                const qq = levelQuery.trim().toLowerCase();
                const filtered = qq
                  ? levelsList.filter(
                      (l) =>
                        l.name.toLowerCase().includes(qq) ||
                        (l.description ?? "").toLowerCase().includes(qq),
                    )
                  : levelsList;
                if (filtered.length === 0)
                  return (
                    <div className="mt-5">
                      <EmptyState text={`No levels match “${levelQuery}”.`} />
                    </div>
                  );
                return (
                  <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((l, idx) => {
                      const Icon = LEVEL_ICONS[idx % LEVEL_ICONS.length];
                      const tone = l.color || LEVEL_TONES[idx % LEVEL_TONES.length];
                      const active = level === l.code;
                      const recommended = idx === 0;
                      return (
                        <button
                          key={l.code}
                          onClick={() => {
                            if (l.is_locked) return;
                            setLevel(l.code);
                            setStep(1);
                          }}
                          disabled={!!l.is_locked}
                          className={`group relative rounded-3xl p-px text-left transition-transform ${l.is_locked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-1"} ${active ? "ring-2 ring-primary shadow-glow" : ""}`}
                          style={{
                            background: `linear-gradient(135deg, ${tone}, transparent 65%)`,
                          }}
                        >
                          <div className="glass relative h-full overflow-hidden rounded-[calc(theme(borderRadius.3xl)-1px)] p-6">
                            <div
                              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-40 blur-3xl transition-opacity group-hover:opacity-80"
                              style={{ background: tone }}
                            />
                            <div className="relative flex items-start justify-between">
                              <div
                                className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-glow"
                                style={{
                                  background: `linear-gradient(135deg, ${tone}, oklch(0.55 0.2 270))`,
                                }}
                              >
                                <Icon className="h-6 w-6" />
                              </div>
                              {l.is_locked ? (
                                <span className="flex h-6 items-center gap-1 rounded-full bg-zinc-900/70 px-2 text-[10px] font-bold uppercase tracking-wide text-zinc-100 ring-1 ring-white/10">
                                  <Lock className="h-3 w-3" /> Locked
                                </span>
                              ) : active ? (
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cta-gradient text-white shadow-glow">
                                  <Check className="h-3.5 w-3.5" />
                                </span>
                              ) : null}
                            </div>
                            {recommended && !l.is_locked && (
                              <span className="relative mt-4 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-500 ring-1 ring-amber-400/30">
                                <Sparkles className="h-3 w-3" /> Recommended
                              </span>
                            )}
                            <h3 className="font-display relative mt-3 text-xl font-bold">
                              {l.name}
                            </h3>
                            <p className="relative mt-1 text-sm text-muted-foreground line-clamp-2">
                              {l.description ?? "Tap to begin practising at this level."}
                            </p>
                            <div className="relative mt-5 flex items-center justify-between">
                              <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                                {l.is_locked ? "Unavailable" : "Continue"}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-bold transition-all ${l.is_locked ? "text-muted-foreground" : "text-gradient group-hover:gap-2"}`}
                              >
                                {l.is_locked ? (
                                  "Ask an admin"
                                ) : (
                                  <>
                                    Select level <ArrowRight className="h-3.5 w-3.5" />
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()
            )}

            {levelsList.length > 0 && (
              <div className="mt-5 glass shadow-card-soft rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cta-gradient text-white shadow-glow">
                    <Zap className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-bold">Smart Recommendation</p>
                    <p className="text-xs text-muted-foreground">
                      Pick a level above to load its subjects and continue practising.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* STEP 2 — SUBJECT */}
        {step === 1 && (
          <section className="animate-fade-up">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">Step 2: Select Your Subject</h2>
                <p className="text-sm text-muted-foreground">
                  {levelName} Level · choose the subject you want to practise.
                </p>
              </div>
              <SearchInput
                value={subjectQuery}
                onChange={setSubjectQuery}
                placeholder="Search subject…"
              />
            </div>

            {subjectsQ.isLoading ? (
              <LoadingBlock />
            ) : (
              (() => {
                const qq = subjectQuery.trim().toLowerCase();
                const all = subjectsQ.data ?? [];
                const filtered = qq
                  ? all.filter(
                      (s) =>
                        s.name.toLowerCase().includes(qq) ||
                        (s.description ?? "").toLowerCase().includes(qq),
                    )
                  : all;
                if (all.length === 0)
                  return (
                    <div className="mt-5">
                      <EmptyState text="No subjects published for this level yet." />
                    </div>
                  );
                if (filtered.length === 0)
                  return (
                    <div className="mt-5">
                      <EmptyState text={`No subjects match “${subjectQuery}”.`} />
                    </div>
                  );
                return (
                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {filtered.map((s) => {
                      const { i: Icon, tone } = iconFor(s.slug);
                      const active = subjectId === s.id;
                      const prog = subjectProgressMap.get(s.id);
                      const pct = prog?.percent ?? 0;
                      const inProgress = (prog?.completed ?? 0) > 0 && pct < 100;
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSubjectId(s.id);
                            setSubjectName(s.name);
                            setStep(2);
                          }}
                          className={`group relative rounded-3xl p-px text-left transition-transform hover:-translate-y-1 ${active ? "ring-2 ring-primary shadow-glow" : ""}`}
                          style={{
                            background: `linear-gradient(135deg, ${tone}, transparent 65%)`,
                          }}
                        >
                          <div className="glass relative h-full overflow-hidden rounded-[calc(theme(borderRadius.3xl)-1px)] p-5">
                            <div
                              className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl transition-opacity group-hover:opacity-70"
                              style={{ background: tone }}
                            />
                            <div className="relative flex items-start justify-between">
                              <div
                                className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
                                style={{
                                  background: `linear-gradient(135deg, ${tone}, oklch(0.55 0.2 270))`,
                                }}
                              >
                                <Icon className="h-5 w-5" />
                              </div>
                              {inProgress ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--neon-blue)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--neon-blue)] ring-1 ring-[var(--neon-blue)]/30">
                                  <TrendingUp className="h-3 w-3" /> Continue
                                </span>
                              ) : null}
                            </div>
                            <h3 className="font-display relative mt-4 text-lg font-bold">
                              {s.name}
                            </h3>
                            <p className="relative text-xs text-muted-foreground line-clamp-2">
                              {s.description ?? "Tap to explore chapters"}
                            </p>
                            <div className="relative mt-3">
                              <div className="flex items-center justify-between text-[11px] font-semibold">
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  <BookOpen className="h-3 w-3" />
                                  {prog ? `${prog.completed} / ${prog.total}` : "—"} MCQs
                                </span>
                                <span className="text-gradient">{pct}%</span>
                              </div>
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()
            )}

            <StepFooter onBack={() => setStep(0)} backLabel="Back: Select Level" />
          </section>
        )}

        {/* STEP 3 — CHAPTER */}
        {step === 2 && (
          <section className="animate-fade-up">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">Step 3: Select Chapter</h2>
                <p className="text-sm text-muted-foreground">
                  {levelName} · {subjectName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="glass rounded-full px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                  {(chaptersQ.data ?? []).length} chapters
                </span>
                <SearchInput
                  value={chapterQuery}
                  onChange={setChapterQuery}
                  placeholder="Search chapter…"
                />
              </div>
            </div>

            {/* Your Progress in {subject} — premium hero card */}
            {(() => {
              const rows = (chapterProgressQ.data ?? []) as Array<{
                chapter_id: string;
                total: number;
                completed: number;
                percent: number;
                correct: number;
                accuracy: number;
              }>;
              const totalCh = (chaptersQ.data ?? []).length;
              const completedCh = rows.filter((r) => r.total > 0 && r.completed >= r.total).length;
              const totalMcqs = rows.reduce((s, r) => s + (r.total || 0), 0);
              const solvedMcqs = rows.reduce((s, r) => s + (r.completed || 0), 0);
              const correctMcqs = rows.reduce((s, r) => s + (r.correct || 0), 0);
              const avgAccuracy = solvedMcqs ? Math.round((correctMcqs / solvedMcqs) * 100) : 0;
              const overallPct = totalMcqs ? Math.round((solvedMcqs / totalMcqs) * 100) : 0;
              return (
                <div className="mt-5 glass shadow-card-soft relative overflow-hidden rounded-3xl p-5 sm:p-6">
                  <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[var(--neon-purple)]/20 blur-3xl" />
                  <div className="pointer-events-none absolute -left-16 -bottom-16 h-44 w-44 rounded-full bg-[var(--neon-blue)]/15 blur-3xl" />
                  <div className="relative flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--neon-purple)]">
                        Your Progress
                      </p>
                      <h3 className="font-display mt-1 truncate text-lg font-bold sm:text-xl">
                        in {subjectName}
                      </h3>
                    </div>
                    <div className="relative h-20 w-20 shrink-0">
                      <svg viewBox="0 0 100 100" className="h-20 w-20 -rotate-90">
                        <defs>
                          <linearGradient id="subjProg" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="var(--neon-purple)" />
                            <stop offset="100%" stopColor="var(--neon-blue)" />
                          </linearGradient>
                        </defs>
                        <circle
                          cx="50"
                          cy="50"
                          r="42"
                          stroke="currentColor"
                          strokeWidth="9"
                          fill="none"
                          className="text-muted/50"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="42"
                          strokeWidth="9"
                          fill="none"
                          strokeLinecap="round"
                          stroke="url(#subjProg)"
                          strokeDasharray={`${(overallPct / 100) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`}
                          style={{
                            transition: "stroke-dasharray 600ms cubic-bezier(.2,.8,.2,1)",
                            filter: "drop-shadow(0 0 6px var(--neon-purple))",
                          }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="font-display text-base font-bold tabular-nums text-gradient">
                          {overallPct}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="relative mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Chapters Completed
                      </p>
                      <p className="font-display mt-1 text-lg font-bold tabular-nums">
                        <span className="text-gradient">{completedCh}</span>
                        <span className="text-muted-foreground"> / {totalCh}</span>
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        MCQs Solved
                      </p>
                      <p className="font-display mt-1 text-lg font-bold tabular-nums text-gradient">
                        {solvedMcqs}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Accuracy
                      </p>
                      <p className="font-display mt-1 text-lg font-bold tabular-nums text-gradient">
                        {avgAccuracy}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {chaptersQ.isLoading ? (
              <div className="mt-5">
                <LoadingBlock />
              </div>
            ) : (chaptersQ.data ?? []).length === 0 ? (
              <div className="mt-5">
                <EmptyState text="No chapters in this subject yet." />
              </div>
            ) : (
              (() => {
                const qq = chapterQuery.trim().toLowerCase();
                const all = chaptersQ.data ?? [];
                const filtered = qq
                  ? all.filter(
                      (c) =>
                        c.name.toLowerCase().includes(qq) ||
                        (c.description ?? "").toLowerCase().includes(qq),
                    )
                  : all;
                if (filtered.length === 0)
                  return (
                    <div className="mt-5">
                      <EmptyState text={`No chapters match “${chapterQuery}”.`} />
                    </div>
                  );
                return (
                  <div className="mt-5 space-y-3">
                    {filtered.map((c, idx) => {
                      const cprog = chapterProgressMap.get(c.id);
                      const cpct = cprog?.percent ?? 0;
                      const total = cprog?.total ?? 0;
                      const completed = cprog?.completed ?? 0;
                      const accuracy = cprog?.accuracy ?? 0;
                      const isComplete = total > 0 && completed >= total;
                      const isActive = pendingChapter?.id === c.id;
                      const status: "not-started" | "in-progress" | "completed" | "mastered" =
                        isComplete && accuracy >= 90
                          ? "mastered"
                          : isComplete
                            ? "completed"
                            : completed > 0
                              ? "in-progress"
                              : "not-started";
                      const statusTone =
                        status === "mastered"
                          ? "from-amber-400/15 to-amber-400/5 text-amber-500 ring-amber-400/30"
                          : status === "completed"
                            ? "from-emerald-500/15 to-emerald-500/5 text-emerald-500 ring-emerald-500/30"
                            : status === "in-progress"
                              ? "from-[var(--neon-blue)]/15 to-[var(--neon-blue)]/5 text-[var(--neon-blue)] ring-[var(--neon-blue)]/30"
                              : "from-muted/40 to-muted/10 text-muted-foreground ring-border";
                      return (
                        <div key={c.id} className="space-y-3">
                        <button
                          onClick={() =>
                            setPendingChapter({
                              id: c.id,
                              name: c.name,
                              description: c.description,
                            })
                          }
                          className={`group glass shadow-card-soft relative flex w-full items-center gap-4 overflow-hidden rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-glow ${
                            isActive ? "ring-2 ring-[var(--neon-purple)] shadow-glow" : ""
                          }`}
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cta-gradient font-display text-base font-bold text-white shadow-glow">
                            {String(idx + 1).padStart(2, "0")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-display truncate text-base font-bold leading-snug">
                                {c.name}
                              </h3>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-br px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${statusTone}`}
                              >
                                {status.replace("-", " ")}
                              </span>
                            </div>
                            <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <BookOpen className="h-3 w-3" /> {total || "—"} MCQs
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Target className="h-3 w-3" /> {accuracy}% accuracy
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" /> ~
                                {Math.max(1, Math.round((total || 10) * 0.6))} min
                              </span>
                            </p>
                            {total > 0 && (
                              <div className="mt-2 flex items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-[var(--neon-purple)] via-[var(--neon-blue)] to-emerald-400 transition-all duration-700"
                                    style={{ width: `${cpct}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-bold text-gradient tabular-nums">
                                  {cpct}%
                                </span>
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                        </button>
                        {isActive && pendingChapter && renderReadyPanel()}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}


            <StepFooter onBack={() => setStep(1)} backLabel="Back: Select Subject" />
          </section>
        )}

        {/* STEP 4 — PRACTICE / RESULT */}
        {step === 3 && (
          <section className="animate-fade-up">
            {/* RESULT SCREEN */}
            {finished && !reviewMode ? (
              <ResultScreen
                stats={stats}
                total={total}
                chapterName={chapterName}
                subjectName={subjectName}
                level={levelName}
                durationSec={Math.max(1, Math.round((Date.now() - sessionStart) / 1000))}
                mcqs={mcqs}
                answers={answers}
                onReview={() => {
                  setReviewMode(true);
                  setCurrent(0);
                }}
                onRetry={restartSame}
                onNewChapter={() => setStep(2)}
                savedAttemptId={savedAttemptId}
                saving={saving}
                onSaveRetry={() => finishPractice()}
              />
            ) : (
              <div className="glass shadow-glow relative overflow-hidden rounded-3xl p-6">
                <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[var(--neon-purple)]/25 blur-3xl" />
                <div className="pointer-events-none absolute -left-20 -bottom-20 h-60 w-60 rounded-full bg-[var(--neon-blue)]/20 blur-3xl" />

                {mcqsQ.isLoading || practiceAnswersQ.isLoading ? (
                  <LoadingBlock />
                ) : total === 0 ? (
                  <EmptyState text="No questions published in this chapter yet." />
                ) : q ? (
                  <>
                    <div className="relative flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="glass rounded-xl px-3 py-1.5 text-xs font-semibold">
                          Q {String(batchStart + current + 1).padStart(2, "0")} / {totalAll}
                        </span>
                        <span className="rounded-full bg-[var(--neon-purple)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--neon-purple)] ring-1 ring-[var(--neon-purple)]/30">
                          Batch {safeBatchIndex + 1} / {numBatches} · {statsAll.submitted} /{" "}
                          {totalAll} completed
                        </span>
                        {reviewMode && (
                          <span className="rounded-full bg-[var(--neon-blue)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--neon-blue)]">
                            <Eye className="mr-1 inline h-3 w-3" /> Review mode
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => q && toggleBookmark(q.id)}
                          title={
                            bookmarkSet.has(q.id) ? "Remove bookmark" : "Bookmark this question"
                          }
                          className={`glass flex h-9 w-9 items-center justify-center rounded-xl transition-transform hover:scale-105 ${
                            bookmarkSet.has(q.id) ? "text-[var(--neon-purple)]" : ""
                          }`}
                        >
                          <Bookmark
                            className="h-4 w-4"
                            fill={bookmarkSet.has(q.id) ? "currentColor" : "none"}
                          />
                        </button>
                      </div>
                    </div>

                    <h3 className="font-display relative mt-6 text-xl font-bold leading-snug sm:text-2xl">
                      {sanitizeOptionText(q.question)}
                    </h3>

                    <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {options.map((o) => {
                        const isPicked = picked === o.k;
                        const isCorrect = correctChoice === o.k;
                        let state: OptionState = "idle";
                        // Only enter reveal (green/red) state once we know the
                        // correct answer — otherwise a freshly-submitted correct
                        // pick flashes red until the server round-trip returns
                        // correct_option. While waiting, keep the picked option
                        // in the neutral "selected" state so there is no
                        // red → green transition.
                        if (revealResults && correctChoice) {
                          if (isCorrect) state = "correct";
                          else if (isPicked) state = "wrong";
                        } else if (isPicked) state = "selected";
                        const clickable = !reviewMode && !submittedNow;
                        return (
                          <OptionButton
                            key={`${q.id}:${o.k}`}
                            questionId={q.id}
                            optionKey={o.k}
                            text={o.t}
                            state={state}
                            clickable={clickable}
                            onPick={pickOption}
                          />
                        );
                      })}
                    </div>

                    {revealResults && q.explanation && (
                      <div className="relative mt-5">
                        <button
                          onClick={() => setShowExp((s) => !s)}
                          className="glass inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-transform hover:scale-[1.02]"
                        >
                          <Lightbulb className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
                          Explanation
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${showExp ? "rotate-180" : ""}`}
                          />
                        </button>
                        {showExp && (
                          <div className="animate-fade-up mt-3 rounded-2xl border border-border bg-background/40 p-4 text-sm text-muted-foreground">
                            {q.explanation}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        onClick={prevQ}
                        disabled={current === 0 && safeBatchIndex === 0}
                        className="glass inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02] disabled:opacity-40"
                      >
                        <ArrowLeft className="h-4 w-4" /> Previous
                      </button>
                      <div className="flex flex-wrap gap-3">
                        {!reviewMode && !submittedNow && (
                          <>
                            <button
                              onClick={() => submitAnswer(null)}
                              className="rounded-xl border border-border bg-background/40 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
                            >
                              Skip
                            </button>
                            <button
                              onClick={() => selectedOption && submitAnswer(selectedOption)}
                              disabled={!selectedOption}
                              className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                            >
                              <Check className="h-4 w-4" /> Submit Answer
                            </button>
                          </>
                        )}
                        {!(current === total - 1 && isLastBatch) ? (
                          <button
                            onClick={nextQ}
                            disabled={!reviewMode && !submittedNow}
                            className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                          >
                            Next <ArrowRight className="h-4 w-4" />
                          </button>
                        ) : reviewMode ? (
                          <button
                            onClick={() => setReviewMode(false)}
                            className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02]"
                          >
                            Back to Result
                          </button>
                        ) : (
                          <button
                            onClick={() => finishPractice({ finalize: true })}
                            disabled={saving || !chapterAllSubmitted}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                              chapterAllSubmitted
                                ? "Complete the chapter"
                                : `Finish all ${totalAll} chapter MCQs first`
                            }
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trophy className="h-4 w-4" />
                            )}
                            {saving
                              ? "Saving…"
                              : chapterAllSubmitted
                                ? "Finish Chapter"
                                : `Finish (${statsAll.submitted}/${totalAll})`}
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </section>
        )}
      </div>

      {/* RIGHT PANEL — only during practice */}
      {inPractice && (
        <aside className="space-y-4">
          <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5 backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[var(--neon-purple)]/20 blur-3xl" />
            <div className="pointer-events-none absolute -left-12 -bottom-12 h-32 w-32 rounded-full bg-[var(--neon-blue)]/15 blur-3xl" />

            <div className="relative flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold">Session</h3>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Live progress
                </p>
              </div>
              <Flame className="h-4 w-4 text-[var(--neon-pink)]" />
            </div>

            {/* Circular progress */}
            <div className="relative mt-5 flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0">
                <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
                  <defs>
                    <linearGradient id="sessProg" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="var(--neon-purple)" />
                      <stop offset="100%" stopColor="var(--neon-blue)" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-muted/50"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    stroke="url(#sessProg)"
                    strokeDasharray={`${(totalAll ? statsAll.submitted / totalAll : 0) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`}
                    style={{
                      transition: "stroke-dasharray 600ms cubic-bezier(.2,.8,.2,1)",
                      filter: "drop-shadow(0 0 8px var(--neon-purple))",
                    }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-xl font-bold tabular-nums">
                    {statsAll.submitted}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    / {totalAll || 0}
                  </span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Chapter Accuracy
                </p>
                <p className="font-display text-2xl font-bold text-gradient tabular-nums">
                  {statsAll.accuracy}%
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-[var(--neon-blue)] to-[var(--neon-purple)] transition-all duration-700"
                    style={{ width: `${statsAll.accuracy}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Batch {safeBatchIndex + 1}/{numBatches} · {stats.submitted}/{total} in batch
                </p>
              </div>
            </div>

            {/* Stat pills (chapter-wide) */}
            <div className="relative mt-5 grid grid-cols-3 gap-2">
              <StatPill label="Correct" value={statsAll.correct} tone="emerald" />
              <StatPill label="Wrong" value={statsAll.wrong} tone="rose" />
              <StatPill label="Skipped" value={statsAll.skipped} tone="amber" />
            </div>
          </div>

          {step === 3 && totalAll > 0 && (
            <div className="glass shadow-card-soft rounded-3xl p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold">Question Map</h3>
                <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-bold text-foreground/70">
                  Batch {safeBatchIndex + 1} / {numBatches}
                </span>
              </div>
              <p className="text-xs font-medium text-foreground/70">{chapterName}</p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                Q {batchStart + 1}–{batchEnd} of {totalAll} · {statsAll.submitted}/{totalAll}{" "}
                completed
              </p>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  onClick={() => gotoBatch(safeBatchIndex - 1)}
                  disabled={safeBatchIndex === 0}
                  className="glass inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40"
                >
                  <ArrowLeft className="h-3 w-3" /> Prev Batch
                </button>
                <button
                  onClick={() => gotoBatch(safeBatchIndex + 1)}
                  disabled={safeBatchIndex >= numBatches - 1}
                  className="glass inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40"
                >
                  Next Batch <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-5 gap-2">
                {mcqs.map((m, i) => {
                  const a = answers[i];
                  const isCurrent = i === current;
                  const globalNum = batchStart + i + 1;
                  let cls =
                    "border border-border bg-muted/60 text-foreground/80 dark:bg-zinc-800/80 dark:text-zinc-200";
                  if (isCurrent) {
                    cls =
                      "bg-blue-600 text-white border border-blue-700 shadow-[0_0_0_2px_rgba(37,99,235,0.35)] dark:bg-blue-500 dark:border-blue-400";
                  } else if (a) {
                    if (a.chosen === null)
                      cls =
                        "bg-amber-600 text-white border border-amber-700 dark:bg-amber-500 dark:border-amber-400";
                    else if (a.chosen === normalizeChoice(m.correct_option))
                      cls =
                        "bg-emerald-700 text-white border border-emerald-800 dark:bg-emerald-600 dark:border-emerald-500";
                    else
                      cls =
                        "bg-rose-700 text-white border border-rose-800 dark:bg-rose-600 dark:border-rose-500";
                  }
                  return (
                    <button
                      key={m.id}
                      onClick={() => jumpTo(i)}
                      className={`relative flex h-10 items-center justify-center rounded-lg text-[11px] font-bold tracking-tight transition-transform hover:scale-110 ${cls}`}
                      title={`Q${globalNum}${a ? (a.chosen === null ? " · skipped" : a.chosen === normalizeChoice(m.correct_option) ? " · correct" : " · wrong") : " · unattempted"}`}
                    >
                      {globalNum}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-medium text-foreground/80">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-700 dark:bg-emerald-600" />{" "}
                  Correct
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-rose-700 dark:bg-rose-600" /> Wrong
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-600 dark:bg-amber-500" /> Skipped
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-blue-600 dark:bg-blue-500" /> Current
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-muted border border-border" />{" "}
                  Unattempted
                </span>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">Tip: click a number to jump</p>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Result screen                                                      */
/* ------------------------------------------------------------------ */

function ResultScreen({
  stats,
  total,
  chapterName,
  subjectName,
  level,
  durationSec,
  mcqs,
  answers,
  onReview,
  onRetry,
  onNewChapter,
  savedAttemptId,
  saving,
  onSaveRetry,
}: {
  stats: {
    correct: number;
    wrong: number;
    skipped: number;
    attempted: number;
    accuracy: number;
    score: number;
    submitted: number;
  };
  total: number;
  chapterName: string | null;
  subjectName: string | null;
  level: string | null;
  durationSec: number;
  mcqs: Mcq[];
  answers: AnswerRec[];
  onReview: () => void;
  onRetry: () => void;
  onNewChapter: () => void;
  savedAttemptId: string | null;
  saving: boolean;
  onSaveRetry: () => void;
}) {
  const passed = stats.score >= 60;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="glass shadow-glow relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full blur-3xl"
          style={{ background: passed ? "oklch(0.75 0.18 150 / 0.3)" : "var(--neon-pink) / 0.25" }}
        />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-60 w-60 rounded-full bg-[var(--neon-blue)]/20 blur-3xl" />

        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Practice Complete
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              {passed ? "Great work!" : "Keep going — you got this."}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {level} · {subjectName} · {chapterName}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {new Date().toLocaleString()} {savedAttemptId ? "· saved" : ""}
            </p>
          </div>

          {/* Circular score */}
          <div className="relative">
            <svg width="140" height="140" className="-rotate-90">
              <circle
                cx="70"
                cy="70"
                r="60"
                stroke="currentColor"
                strokeWidth="10"
                fill="none"
                className="text-muted/40"
              />
              <circle
                cx="70"
                cy="70"
                r="60"
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
                stroke={passed ? "oklch(0.75 0.18 150)" : "var(--neon-pink)"}
                strokeDasharray={`${(stats.score / 100) * 2 * Math.PI * 60} ${2 * Math.PI * 60}`}
                style={{
                  filter: `drop-shadow(0 0 10px ${passed ? "oklch(0.75 0.18 150)" : "var(--neon-pink)"})`,
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={`font-display text-4xl font-bold ${passed ? "text-emerald-400" : "text-rose-400"}`}
              >
                {stats.score}%
              </span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Score
              </span>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <ResultStat
            icon={Target}
            label="Accuracy"
            value={`${stats.accuracy}%`}
            tone="var(--neon-purple)"
          />
          <ResultStat
            icon={CheckCircle2}
            label="Correct"
            value={`${stats.correct}/${total}`}
            tone="oklch(0.75 0.18 150)"
          />
          <ResultStat
            icon={XCircle}
            label="Wrong"
            value={String(stats.wrong)}
            tone="var(--neon-pink)"
          />
          <ResultStat
            icon={MinusCircle}
            label="Skipped"
            value={String(stats.skipped)}
            tone="oklch(0.78 0.15 60)"
          />
          <ResultStat
            icon={Clock}
            label="Time"
            value={fmtDuration(durationSec)}
            tone="var(--neon-blue)"
          />
        </div>

        {/* Actions */}
        <div className="relative mt-6 flex flex-wrap gap-3">
          <button
            onClick={onReview}
            className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02]"
          >
            <Eye className="h-4 w-4" /> Review Answers
          </button>
          <button
            onClick={onRetry}
            className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02]"
          >
            <RotateCw className="h-4 w-4" /> Retry Chapter
          </button>
          <button
            onClick={onNewChapter}
            className="rounded-xl border border-border bg-background/40 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Pick Another Chapter
          </button>
          {!savedAttemptId && (
            <button
              onClick={onSaveRetry}
              disabled={saving}
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-400/15 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Attempt"}
            </button>
          )}
        </div>
      </div>

      {/* Weak spots */}
      <div className="grid grid-cols-1 gap-5">
        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[var(--neon-purple)]" />
            <h3 className="font-display text-lg font-bold">Weak Spots</h3>
          </div>
          <p className="text-xs text-muted-foreground">Questions you got wrong — revisit these</p>
          <ul className="mt-4 space-y-2 max-h-64 overflow-y-auto pr-1">
            {mcqs.map((m, i) => {
              const a = answers[i];
              if (!a || a.chosen === null || a.chosen === normalizeChoice(m.correct_option))
                return null;
              return (
                <li key={m.id} className="rounded-xl bg-background/40 p-3 text-xs">
                  <p className="font-medium line-clamp-2">
                    Q{i + 1}. {sanitizeOptionText(m.question)}
                  </p>
                  <p className="mt-1 text-[10px] text-rose-400">
                    Your answer: {a.chosen} · Correct: <b>{m.correct_option}</b>
                  </p>
                </li>
              );
            })}
            {stats.wrong === 0 && stats.skipped === 0 && (
              <li className="text-xs text-emerald-400">🎯 No weak spots — perfect run.</li>
            )}
            {stats.skipped > 0 && (
              <li className="rounded-xl border border-dashed border-amber-400/30 p-2 text-[10px] text-amber-400">
                {stats.skipped} skipped — open Review to attempt them.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ResultStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-3">
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-30 blur-xl"
        style={{ background: tone }}
      />
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" style={{ color: tone }} />
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <p className="font-display mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "amber";
}) {
  const toneCls =
    tone === "emerald"
      ? "from-emerald-500/15 to-emerald-500/5 text-emerald-500 ring-emerald-500/20"
      : tone === "rose"
        ? "from-rose-500/15 to-rose-500/5 text-rose-500 ring-rose-500/20"
        : "from-amber-500/15 to-amber-500/5 text-amber-500 ring-amber-500/20";
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${toneCls} px-2.5 py-2 ring-1 ring-inset transition-transform hover:-translate-y-0.5`}
    >
      <p className="text-[9px] uppercase tracking-widest opacity-80">{label}</p>
      <p className="font-display mt-0.5 text-lg font-bold tabular-nums">{value}</p>
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

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/30 p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2 transition-shadow focus-within:ring-2 focus-within:ring-primary/40 w-full sm:w-72">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
        >
          clear
        </button>
      )}
    </div>
  );
}

function StepFooter({ onBack, backLabel }: { onBack: () => void; backLabel: string }) {
  return (
    <div className="mt-6 flex justify-start">
      <button
        onClick={onBack}
        className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02]"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </button>
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-3">
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-30 blur-xl"
        style={{ background: tone }}
      />
      <div className="relative flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
          style={{ background: `linear-gradient(135deg, ${tone}, oklch(0.55 0.2 270))` }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <p className="font-display relative mt-1.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
