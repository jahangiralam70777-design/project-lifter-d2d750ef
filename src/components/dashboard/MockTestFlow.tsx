import { useEffect, useMemo, useRef, useState } from "react";
import { sanitizeOptionText } from "@/lib/sanitize-option";
import { stripAutoTitle } from "@/lib/strip-auto";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Trophy,
  Clock,
  Users,
  ShieldCheck,
  Sparkles,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Crown,
  Target,
  TrendingUp,
  RotateCcw,
  Play,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  Filter,
  Calendar,
  Layers,
} from "lucide-react";
import { useLevels } from "@/hooks/use-levels";
import {
  listQuizzes,
  listSubjects,
  listChapters,
  getQuiz,
  submitAttempt,
  revealAnswers,
} from "@/lib/learning.functions";
import { getMockLeaderboard, getMyMockAttempts } from "@/lib/mock-leaderboard.functions";
import { confirmDialog } from "@/components/ui/confirm-imperative";
import {
  useBeforeUnloadGuard,
  persistAnswers,
  loadAnswers,
  clearAnswers,
} from "@/lib/exam-safety";

type Stage = "browse" | "exam" | "result";
type ScopeFilter = "all" | "level" | "subject" | "chapter";

type MockRow = {
  id: string;
  title: string;
  description: string | null;
  total_questions: number;
  duration_seconds: number;
  passing_marks: number;
  negative_marking: number;
  subject_id: string | null;
  chapter_id: string | null;
  level: string;
  starts_at: string | null;
  ends_at: string | null;
  subjects?: { name: string } | null;
  chapters?: { name: string } | null;
  mcq_count: number;
};

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function fmtSeconds(s: number) {
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function fmtCountdown(target: string | null): string | null {
  if (!target) return null;
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

export function MockTestFlow() {
  const [stage, setStage] = useState<Stage>("browse");
  const [selected, setSelected] = useState<MockRow | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{
    correct: number;
    total: number;
    score: number;
    attemptId: string;
  } | null>(null);

  return (
    <div className="space-y-6">
      {stage === "browse" && (
        <BrowseStage
          onStart={(m) => {
            setSelected(m);
            setStage("exam");
          }}
        />
      )}
      {stage === "exam" && selected && (
        <ExamStage
          mock={selected}
          onSubmit={(r) => {
            setLastAttempt(r);
            setStage("result");
          }}
          onExit={() => setStage("browse")}
        />
      )}
      {stage === "result" && selected && lastAttempt && (
        <ResultStage
          mock={selected}
          result={lastAttempt}
          onRetry={() => setStage("exam")}
          onBack={() => setStage("browse")}
        />
      )}
    </div>
  );
}

/* ----------------------------- BROWSE ----------------------------- */

function BrowseStage({ onStart }: { onStart: (m: MockRow) => void }) {
  const qc = useQueryClient();
  const listQuizzesFn = useServerFn(listQuizzes);
  const listSubjectsFn = useServerFn(listSubjects);
  const listChaptersFn = useServerFn(listChapters);

  const [levelCode, setLevelCode] = useState<string>("all");
  const [subjectId, setSubjectId] = useState<string>("all");
  const [chapterId, setChapterId] = useState<string>("all");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [search, setSearch] = useState("");

  // Realtime: refresh when admin publishes / edits mock tests
  useEffect(() => {
    const ch = supabase
      .channel(`student-mock-live-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quizzes" }, () => {
        qc.invalidateQueries({ queryKey: ["mocks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_questions" }, () => {
        qc.invalidateQueries({ queryKey: ["mocks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_attempts" }, () => {
        qc.invalidateQueries({ queryKey: ["my-mock-attempts"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const levelsQ = useLevels();
  const subjectsQ = useQuery({
    queryKey: ["mock-subjects", levelCode],
    queryFn: () => listSubjectsFn({ data: levelCode === "all" ? {} : { level: levelCode } }),
  });
  const chaptersQ = useQuery({
    queryKey: ["mock-chapters", subjectId],
    queryFn: () => listChaptersFn({ data: { subjectId } }),
    enabled: subjectId !== "all",
  });
  const mocksQ = useQuery({
    queryKey: ["mocks", levelCode, subjectId, chapterId],
    queryFn: () =>
      listQuizzesFn({
        data: {
          kind: "mock",
          level: levelCode === "all" ? undefined : levelCode,
          subjectId: subjectId === "all" ? undefined : subjectId,
          chapterId: chapterId === "all" ? undefined : chapterId,
        },
      }),
  });

  // Tick once a second to refresh countdowns/live status
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const all = (mocksQ.data ?? []) as unknown as MockRow[];
  const filtered = useMemo(() => {
    const now = Date.now();
    return all
      .filter((m) => {
        if (m.starts_at && new Date(m.starts_at).getTime() > now + 1000 * 60 * 60 * 24 * 365)
          return false;
        if (scope === "level") return m.subject_id == null;
        if (scope === "subject") return m.subject_id != null && m.chapter_id == null;
        if (scope === "chapter") return m.chapter_id != null;
        return true;
      })
      .filter((m) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          m.title.toLowerCase().includes(q) ||
          (m.subjects?.name ?? "").toLowerCase().includes(q) ||
          (m.chapters?.name ?? "").toLowerCase().includes(q)
        );
      });
  }, [all, scope, search]);

  const liveCount = all.filter((m) => {
    const now = Date.now();
    const started = !m.starts_at || new Date(m.starts_at).getTime() <= now;
    const open = !m.ends_at || new Date(m.ends_at).getTime() > now;
    return started && open;
  }).length;

  return (
    <>
      {/* Header */}
      <div className="glass rounded-3xl p-6 shadow-card-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <Trophy className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
              Mock Test Arena
            </div>
            <h1 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Mock Tests <span className="text-gradient">Live</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Real exams published by admins. Filter by level, subject or chapter.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Stat label="Available" value={String(all.length)} icon={Layers} />
            <Stat label="Live Now" value={String(liveCount)} icon={Sparkles} />
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="glass rounded-3xl p-4 shadow-card-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mock by title, subject or chapter..."
              className="w-full rounded-full border border-border/60 bg-muted/30 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[var(--neon-purple)]/50"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={levelCode}
              onChange={(v) => {
                setLevelCode(v);
                setSubjectId("all");
                setChapterId("all");
              }}
              options={[
                { value: "all", label: "All levels" },
                ...(levelsQ.data ?? []).map((l) => ({ value: l.code, label: l.name })),
              ]}
            />
            <Select
              value={subjectId}
              onChange={(v) => {
                setSubjectId(v);
                setChapterId("all");
              }}
              options={[
                { value: "all", label: "All subjects" },
                ...(subjectsQ.data ?? []).map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <Select
              value={chapterId}
              onChange={setChapterId}
              disabled={subjectId === "all"}
              options={[
                { value: "all", label: "All chapters" },
                ...(chaptersQ.data ?? []).map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["level", "Level-wide"],
              ["subject", "Full Subject"],
              ["chapter", "Chapter-wise"],
            ] as [ScopeFilter, string][]
          ).map(([k, label]) => {
            const active = scope === k;
            return (
              <button
                key={k}
                onClick={() => setScope(k)}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-transparent bg-cta-gradient text-white shadow-glow"
                    : "border-border/60 bg-muted/30 text-foreground/80 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      {mocksQ.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass h-64 animate-pulse rounded-3xl p-5 shadow-card-soft" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-3xl p-12 text-center shadow-card-soft">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 font-display text-lg font-bold">No mock tests yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            New mocks published by admin will appear here instantly.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m, i) => (
            <MockCard key={m.id} mock={m} delay={i * 50} onStart={() => onStart(m)} />
          ))}
        </div>
      )}
    </>
  );
}

function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-xs font-medium outline-none focus:border-[var(--neon-purple)]/50 disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 shadow-card-soft">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cta-gradient text-white shadow-glow">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="font-display text-base font-bold">{value}</div>
      </div>
    </div>
  );
}

function MockCard({ mock, delay, onStart }: { mock: MockRow; delay: number; onStart: () => void }) {
  const getMyAttemptsFn = useServerFn(getMyMockAttempts);
  const { data: attempts } = useQuery({
    queryKey: ["my-mock-attempts", mock.id],
    queryFn: () => getMyAttemptsFn({ data: { quizId: mock.id } }),
    staleTime: 30_000,
  });

  const now = Date.now();
  const notStarted = mock.starts_at && new Date(mock.starts_at).getTime() > now;
  const ended = mock.ends_at && new Date(mock.ends_at).getTime() <= now;
  const startsIn = notStarted ? fmtCountdown(mock.starts_at) : null;
  const endsIn = !notStarted && mock.ends_at ? fmtCountdown(mock.ends_at) : null;

  const inProgress = (attempts ?? []).find((a) => a.status === "in_progress");
  const best = (attempts ?? [])
    .filter((a) => a.status === "completed")
    .reduce<number | null>((acc, a) => (acc == null || a.score > acc ? a.score : acc), null);
  const attemptCount = (attempts ?? []).filter((a) => a.status === "completed").length;

  const scopeLabel =
    mock.subject_id == null
      ? "Level-wide"
      : mock.chapter_id == null
        ? "Full Subject"
        : "Chapter-wise";

  const subjectName = mock.subjects?.name ?? "General";
  const chapterName = mock.chapters?.name;
  const durationMin = Math.max(1, Math.round(mock.duration_seconds / 60));

  return (
    <div
      className="group relative animate-fade-in"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="glass relative h-full overflow-hidden rounded-3xl p-5 shadow-card-soft transition-transform duration-300 group-hover:-translate-y-1">
        <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-[var(--neon-blue)]/30 bg-[var(--neon-blue)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--neon-blue)]">
          <ShieldCheck className="h-3 w-3" /> {cap(mock.level)}
        </div>

        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cta-gradient text-white shadow-glow">
          <Trophy className="h-5 w-5" />
        </div>

        <h3 className="font-display mt-3 line-clamp-2 text-lg font-bold tracking-tight">
          {stripAutoTitle(mock.title)}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted/60 px-2 py-0.5">{subjectName}</span>
          {chapterName && (
            <span className="rounded-full bg-muted/60 px-2 py-0.5">{chapterName}</span>
          )}
          <span className="rounded-full bg-muted/60 px-2 py-0.5">{scopeLabel}</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Mini label="MCQs" value={mock.mcq_count || mock.total_questions} />
          <Mini label="Pass" value={mock.passing_marks || mock.mcq_count} />
          <Mini label="Mins" value={durationMin} />
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {attemptCount} attempt{attemptCount === 1 ? "" : "s"}
          </span>
          {best != null && (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <Trophy className="h-3.5 w-3.5" /> Best {best}%
            </span>
          )}
        </div>

        {(startsIn || endsIn) && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
            {startsIn ? (
              <>
                <Calendar className="h-3 w-3" /> Starts in {startsIn}
              </>
            ) : (
              <>
                <Clock className="h-3 w-3 text-amber-400" /> Ends in {endsIn}
              </>
            )}
          </div>
        )}

        {ended ? (
          <button
            disabled
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-muted/60 px-4 py-2.5 text-sm font-semibold text-muted-foreground"
          >
            Closed
          </button>
        ) : notStarted ? (
          <button
            disabled
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-sm font-semibold text-muted-foreground"
          >
            <Calendar className="h-4 w-4" /> Scheduled
          </button>
        ) : (
          <button
            onClick={onStart}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cta-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02]"
          >
            {inProgress ? (
              <>
                <RotateCcw className="h-4 w-4" /> Resume
              </>
            ) : attemptCount > 0 ? (
              <>
                <RotateCcw className="h-4 w-4" /> Retry
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Start Exam
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/30 px-2 py-2">
      <div className="font-display text-base font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

/* ----------------------------- EXAM ----------------------------- */

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

function ExamStage({
  mock,
  onSubmit,
  onExit,
}: {
  mock: MockRow;
  onSubmit: (r: { correct: number; total: number; score: number; attemptId: string }) => void;
  onExit: () => void;
}) {
  const getQuizFn = useServerFn(getQuiz);
  const submitFn = useServerFn(submitAttempt);
  const qc = useQueryClient();

  const quizQ = useQuery({
    queryKey: ["mock-quiz", mock.id],
    queryFn: () => getQuizFn({ data: { quizId: mock.id } }),
  });
  const questions = (quizQ.data?.questions ?? []) as unknown as QuizQ[];

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(mock.duration_seconds);
  const startedAtRef = useRef<number>(Date.now());
  const qStartedAtRef = useRef<number>(Date.now());
  const timesMs = useRef<Record<string, number>>({});
  const restoredRef = useRef(false);

  const draftKey = `mock:${mock.id}`;

  // Restore persisted draft once questions are loaded.
  useEffect(() => {
    if (restoredRef.current || !questions.length) return;
    const draft = loadAnswers(draftKey);
    if (draft) {
      setAnswers(draft.answers ?? {});
      setBookmarks(new Set(draft.bookmarks ?? []));
      if (typeof draft.current === "number") setIdx(draft.current);
    }
    restoredRef.current = true;
  }, [questions.length, draftKey]);

  useEffect(() => {
    qStartedAtRef.current = Date.now();
  }, [idx]);

  const submitMut = useMutation({
    mutationFn: async () => {
      const payload = questions.map((q) => ({
        mcqId: q.id,
        chosen: (answers[q.id] as "A" | "B" | "C" | "D" | undefined) ?? null,
        timeMs: Math.min(60 * 60 * 1000, timesMs.current[q.id] ?? 0),
      }));
      const duration = Math.min(
        60 * 60 * 4,
        Math.round((Date.now() - startedAtRef.current) / 1000),
      );
      return submitFn({
        data: {
          quizId: mock.id,
          durationSeconds: duration,
          answers: payload,
        },
      });
    },
    onSuccess: (res) => {
      // Drop the local draft now that the attempt is persisted server-side.
      clearAnswers(draftKey);
      qc.invalidateQueries({ queryKey: ["my-mock-attempts", mock.id] });
      qc.invalidateQueries({ queryKey: ["mock-leaderboard", mock.id] });
      onSubmit({
        correct: res.correct,
        total: res.total,
        score: res.score,
        attemptId: res.attemptId,
      });
    },
  });

  // Autosave answers locally so a refresh/close doesn't wipe in-progress work.
  useEffect(() => {
    if (!questions.length || submitMut.isPending) return;
    persistAnswers(draftKey, {
      answers,
      bookmarks: Array.from(bookmarks),
      current: idx,
      savedAt: Date.now(),
    });
  }, [answers, bookmarks, idx, draftKey, questions.length, submitMut.isPending]);

  // Native browser leave-site prompt while an attempt is in progress.
  useBeforeUnloadGuard(
    !submitMut.isPending && !submitMut.isSuccess && questions.length > 0,
  );

  useEffect(() => {
    if (submitMut.isPending || !questions.length) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          // Timeout auto-submit bypasses the confirm dialog by design.
          submitMut.mutate();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [submitMut, questions.length]);

  async function doSubmit() {
    if (submitMut.isPending) return;
    const total = questions.length;
    const unanswered = total - Object.keys(answers).length;
    const ok = await confirmDialog({
      title: "Submit this mock test?",
      description:
        unanswered > 0
          ? `${unanswered} question${unanswered === 1 ? "" : "s"} still unanswered. You won't be able to change answers after submitting.`
          : "You won't be able to change answers after submitting.",
      confirmLabel: "Submit",
    });
    if (!ok) return;
    submitMut.mutate();
  }

  async function doExit() {
    const ok = await confirmDialog({
      title: "Exit this mock test?",
      description:
        "Your progress is saved on this device, but the timer keeps running. You can resume by reopening this mock.",
      confirmLabel: "Exit",
      variant: "destructive",
    });
    if (ok) onExit();
  }

  if (quizQ.isLoading) {
    return (
      <div className="glass flex items-center justify-center rounded-3xl p-16 shadow-card-soft">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!questions.length) {
    return (
      <div className="glass rounded-3xl p-12 text-center shadow-card-soft">
        <XCircle className="mx-auto h-10 w-10 text-rose-400" />
        <h3 className="mt-3 font-display text-lg font-bold">No questions assigned</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The admin hasn't added questions to this mock yet.
        </p>
        <button
          onClick={onExit}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-cta-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow"
        >
          Back
        </button>
      </div>
    );
  }

  const q = questions[idx];
  const total = questions.length;
  const attempted = Object.keys(answers).length;

  const select = (letter: "A" | "B" | "C" | "D") => {
    const dt = Date.now() - qStartedAtRef.current;
    timesMs.current[q.id] = (timesMs.current[q.id] ?? 0) + dt;
    qStartedAtRef.current = Date.now();
    setAnswers((a) => ({ ...a, [q.id]: letter }));
  };

  const toggleBookmark = () =>
    setBookmarks((b) => {
      const n = new Set(b);
      if (n.has(idx)) n.delete(idx);
      else n.add(idx);
      return n;
    });

  const options: [string, "A" | "B" | "C" | "D"][] = (
    [
      [sanitizeOptionText(q.option_a), "A"],
      [sanitizeOptionText(q.option_b), "B"],
      [sanitizeOptionText(q.option_c), "C"],
      [sanitizeOptionText(q.option_d), "D"],
    ] as [string, "A" | "B" | "C" | "D"][]
  ).filter(([t]) => t && t.length > 0);

  return (
    <>
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 shadow-card-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cta-gradient text-white shadow-glow">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-sm font-bold">{stripAutoTitle(mock.title)}</div>
            <div className="text-xs text-muted-foreground">
              {mock.subjects?.name ?? "General"} · {cap(mock.level)}
            </div>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end gap-3">
          <div className="hidden flex-1 sm:block">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-full rounded-full bg-cta-gradient transition-all"
                style={{ width: `${((idx + 1) / total) * 100}%` }}
              />
            </div>
          </div>
          <div className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold">
            <Clock className="h-4 w-4 text-[var(--neon-blue)]" />
            <span className="font-display tabular-nums">{fmtSeconds(timeLeft)}</span>
          </div>
          <button
            onClick={() => void doExit()}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground/80 hover:text-destructive"
          >
            <LogOut className="h-3.5 w-3.5" /> Exit
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="glass relative overflow-hidden rounded-3xl p-6 shadow-card-soft sm:p-8">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs">
              <span className="font-display font-bold text-gradient">
                Q {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="text-muted-foreground">/ {total}</span>
            </div>
            <button
              onClick={toggleBookmark}
              aria-label={bookmarks.has(idx) ? "Remove bookmark" : "Add bookmark"}
              aria-pressed={bookmarks.has(idx)}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${
                bookmarks.has(idx)
                  ? "bg-amber-400/20 text-amber-400"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bookmark className={`h-4 w-4 ${bookmarks.has(idx) ? "fill-amber-400" : ""}`} />
            </button>
          </div>

          <h2 className="font-display mt-5 text-xl font-bold leading-snug sm:text-2xl">
            {sanitizeOptionText(q.question)}
          </h2>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {options.map(([opt, letter]) => {
              const picked = answers[q.id] === letter;
              return (
                <button
                  key={letter}
                  onClick={() => select(letter)}
                  className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all ${
                    picked
                      ? "border-transparent bg-cta-gradient text-white shadow-glow"
                      : "border-border/60 bg-muted/30 hover:border-[var(--neon-purple)]/40 hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${
                        picked ? "bg-white/20 text-white" : "bg-muted text-foreground/80"
                      }`}
                    >
                      {letter}
                    </span>
                    <span className="text-sm font-medium">{opt}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button
              onClick={() => void doSubmit()}
              disabled={submitMut.isPending}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 px-5 py-2 text-sm font-semibold text-[var(--neon-purple)] hover:bg-[var(--neon-purple)]/20 disabled:opacity-50"
            >
              {submitMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit Mock Test
            </button>
            <button
              onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
              disabled={idx === total - 1}
              className="inline-flex items-center gap-2 rounded-full bg-cta-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-50"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass rounded-3xl p-5 shadow-card-soft">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Navigator
              </span>
              <span className="text-xs text-muted-foreground">{total - attempted} left</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((qq, i) => {
                const isActive = i === idx;
                const isDone = answers[qq.id] !== undefined;
                const isBm = bookmarks.has(i);
                return (
                  <button
                    key={qq.id}
                    onClick={() => setIdx(i)}
                    className={`relative h-9 rounded-lg text-xs font-semibold transition ${
                      isActive
                        ? "bg-cta-gradient text-white shadow-glow"
                        : isDone
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {i + 1}
                    {isBm && (
                      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass rounded-3xl p-5 shadow-card-soft">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Status
            </span>
            <div className="mt-3 space-y-2">
              <Row label="Attempted" value={`${attempted}/${total}`} icon={CheckCircle2} />
              <Row label="Bookmarked" value={String(bookmarks.size)} icon={Bookmark} />
              <Row label="Time Left" value={fmtSeconds(timeLeft)} icon={Clock} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2">
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-[var(--neon-blue)]" /> {label}
      </span>
      <span className="font-display text-sm font-bold">{value}</span>
    </div>
  );
}

/* ----------------------------- RESULT ----------------------------- */

function ResultStage({
  mock,
  result,
  onRetry,
  onBack,
}: {
  mock: MockRow;
  result: { correct: number; total: number; score: number; attemptId: string };
  onRetry: () => void;
  onBack: () => void;
}) {
  const getLeaderboardFn = useServerFn(getMockLeaderboard);
  const getQuizFn = useServerFn(getQuiz);
  const revealFn = useServerFn(revealAnswers);
  const [showReview, setShowReview] = useState(false);
  const lbQ = useQuery({
    queryKey: ["mock-leaderboard", mock.id],
    queryFn: () => getLeaderboardFn({ data: { quizId: mock.id, limit: 10 } }),
  });
  const quizQ = useQuery({
    queryKey: ["mock-quiz", mock.id],
    queryFn: () => getQuizFn({ data: { quizId: mock.id } }),
    enabled: showReview,
    staleTime: Infinity,
  });
  const revealQ = useQuery({
    queryKey: ["mock-reveal", result.attemptId],
    queryFn: () => revealFn({ data: { attemptId: result.attemptId } }),
    enabled: showReview,
    staleTime: Infinity,
  });
  const reviewQuestions = (quizQ.data?.questions ?? []) as unknown as QuizQ[];
  const revealMap = new Map<
    string,
    {
      correct_option: string | null;
      chosen_option: string | null;
      is_correct: boolean | null;
      explanation: string | null;
    }
  >();
  for (const r of revealQ.data ?? []) revealMap.set(r.mcq_id, r);

  const wrong = result.total - result.correct;
  const accuracy = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  const radius = 70;
  const circ = 2 * Math.PI * radius;
  const dash = (result.score / 100) * circ;
  const myRank = (lbQ.data ?? []).findIndex((r) => r.attempt_id === result.attemptId) + 1;

  return (
    <>
      <div className="glass relative overflow-hidden rounded-3xl p-6 shadow-card-soft sm:p-8">
        <div className="relative grid items-center gap-8 lg:grid-cols-[260px_1fr]">
          <div className="relative mx-auto h-[180px] w-[180px]">
            <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
              <defs>
                <linearGradient id="ringGradMock" x1="0" x2="1">
                  <stop offset="0%" stopColor="var(--neon-purple)" />
                  <stop offset="100%" stopColor="var(--neon-blue)" />
                </linearGradient>
              </defs>
              <circle
                cx="90"
                cy="90"
                r={radius}
                stroke="hsl(var(--muted))"
                strokeWidth="14"
                fill="none"
              />
              <circle
                cx="90"
                cy="90"
                r={radius}
                stroke="url(#ringGradMock)"
                strokeWidth="14"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${dash} ${circ}`}
                className="transition-[stroke-dasharray] duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-display text-4xl font-bold text-gradient">{result.score}%</div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Score
              </div>
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" /> Submitted
            </div>
            <h2 className="font-display mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {myRank > 0 ? (
                <>
                  You ranked <span className="text-gradient">#{myRank}</span> in the top 10
                </>
              ) : (
                <>Your mock result is in</>
              )}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {stripAutoTitle(mock.title)} · {mock.subjects?.name ?? "General"}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={CheckCircle2}
                label="Correct"
                value={result.correct}
                color="text-emerald-400"
              />
              <StatCard icon={XCircle} label="Wrong" value={wrong} color="text-rose-400" />
              <StatCard
                icon={Target}
                label="Accuracy"
                value={`${accuracy}%`}
                color="text-[var(--neon-blue)]"
              />
              <StatCard
                icon={TrendingUp}
                label="Total"
                value={result.total}
                color="text-[var(--neon-purple)]"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-full bg-cta-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow hover:scale-[1.02] transition-transform"
              >
                <RotateCcw className="h-4 w-4" /> Retry Mock
              </button>
              <button
                onClick={() => setShowReview((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--neon-purple)] hover:bg-[var(--neon-purple)]/20"
              >
                {showReview ? "Hide review" : "Review answers"}
              </button>
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-5 py-2.5 text-sm font-semibold hover:bg-muted"
              >
                Back to Arena
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="glass rounded-3xl p-6 shadow-card-soft">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-bold">Top Rankers</span>
          <Crown className="h-4 w-4 text-amber-400" />
        </div>
        {lbQ.isLoading ? (
          <div className="mt-4 flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (lbQ.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No completed attempts yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {(lbQ.data ?? []).map((u, i) => (
              <li
                key={u.attempt_id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                  u.is_you
                    ? "border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 shadow-glow"
                    : "bg-muted/40 hover:bg-muted/60"
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                    i === 0
                      ? "bg-amber-400/20 text-amber-400"
                      : i === 1
                        ? "bg-zinc-400/20 text-zinc-300"
                        : i === 2
                          ? "bg-orange-500/20 text-orange-400"
                          : "bg-muted text-muted-foreground"
                  }`}
                >
                  #{u.rank ?? i + 1}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{u.is_you ? "You" : u.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Time {fmtSeconds(u.duration_seconds)}
                  </div>
                </div>
                <div className="font-display text-sm font-bold text-gradient">{u.score}%</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showReview && (
        <div className="glass rounded-3xl p-6 shadow-card-soft">
          <h3 className="font-display text-base font-bold">Question review</h3>
          {quizQ.isLoading || revealQ.isLoading ? (
            <div className="mt-4 flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ol className="mt-4 space-y-4">
              {reviewQuestions.map((rq, i) => {
                const rev = revealMap.get(rq.id);
                const options: [string, "A" | "B" | "C" | "D"][] = (
                  [
                    [sanitizeOptionText(rq.option_a), "A"],
                    [sanitizeOptionText(rq.option_b), "B"],
                    [sanitizeOptionText(rq.option_c), "C"],
                    [sanitizeOptionText(rq.option_d), "D"],
                  ] as [string, "A" | "B" | "C" | "D"][]
                ).filter(([t]) => t && t.length > 0);
                return (
                  <li
                    key={rq.id}
                    className="rounded-2xl border border-border/60 bg-muted/20 p-4"
                  >
                    <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Q{i + 1}
                    </div>
                    <h4 className="mt-1 text-sm font-semibold leading-snug">
                      {sanitizeOptionText(rq.question)}
                    </h4>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {options.map(([opt, letter]) => {
                        const isCorrect = rev?.correct_option === letter;
                        const isPicked = rev?.chosen_option === letter;
                        const wrongPick = isPicked && !isCorrect;
                        return (
                          <div
                            key={letter}
                            className={`rounded-xl border p-3 text-sm ${
                              isCorrect
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                : wrongPick
                                  ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                                  : "border-border/60 bg-muted/30"
                            }`}
                          >
                            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-bold">
                              {letter}
                            </span>
                            {opt}
                            {isCorrect && (
                              <span className="ml-2 text-[11px] font-semibold uppercase tracking-widest">
                                Correct
                              </span>
                            )}
                            {wrongPick && (
                              <span className="ml-2 text-[11px] font-semibold uppercase tracking-widest">
                                Your pick
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {rev?.explanation && (
                      <p className="mt-3 rounded-lg border border-border/50 bg-background/50 p-3 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Explanation: </span>
                        {rev.explanation}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="glass rounded-2xl p-4 shadow-card-soft">
      <Icon className={`h-5 w-5 ${color}`} />
      <div className="font-display mt-2 text-2xl font-bold">{value}</div>
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}
