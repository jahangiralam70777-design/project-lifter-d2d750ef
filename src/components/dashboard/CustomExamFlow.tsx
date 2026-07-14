import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { sanitizeOptionText } from "@/lib/sanitize-option";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  generateCustomExam,
  submitCustomExamAttempt,
} from "@/lib/learning.functions";
import {
  Sparkles,
  Award,
  Crown,
  Atom,
  ChevronRight,
  ChevronDown,
  Check,
  ArrowLeft,
  ArrowRight,
  Clock,
  Bookmark,
  LogOut,
  Trophy,
  RotateCw,
  Download,
  Settings2,
  ListChecks,
  Timer as TimerIcon,
  Shuffle,
  Sparkle,
  Loader2,
  BookOpen,
} from "lucide-react";

type Step = 0 | 1 | 2 | 3 | 4;

type LevelRow = {
  code: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
};
type SubjectRow = {
  id: string;
  name: string;
  level: string;
  description: string | null;
  color: string | null;
  icon: string | null;
};
type ChapterRow = { id: string; name: string; subject_id: string; description: string | null };
type McqRow = {
  id: string;
  chapter_id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  // SECURITY: correct_option is NOT delivered pre-submission. Scoring and
  // answer reveal happen server-side via submitCustomExamAttempt /
  // revealAnswers(attemptId).
};

const levelIcon = (code: string) => {
  const k = code.toLowerCase();
  if (k.includes("cert")) return Sparkles;
  if (k.includes("adv") || k.includes("exp")) return Crown;
  return Award;
};
const levelTone = (i: number) =>
  ["var(--neon-purple)", "var(--neon-blue)", "oklch(0.82 0.16 85)"][i % 3];
const subjectTone = (i: number) =>
  [
    "var(--neon-purple)",
    "var(--neon-blue)",
    "var(--neon-pink)",
    "oklch(0.78 0.15 200)",
    "oklch(0.75 0.18 150)",
    "oklch(0.78 0.18 60)",
  ][i % 6];

const stepLabels = ["Level", "Subject", "Chapter", "Setup", "Exam"];
const mcqPresets = [10, 20, 30, 50];
const timePresets = [10, 20, 30, 60];

export function CustomExamFlow() {
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>(0);
  const [level, setLevel] = useState<string | null>(null);
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [openChap, setOpenChap] = useState<string | null>(null);
  const [selectedChaps, setSelectedChaps] = useState<Set<string>>(new Set());

  const [mcqCount, setMcqCount] = useState(20);
  const [customMcq, setCustomMcq] = useState(false);
  const [duration, setDuration] = useState(30);
  const [customDur, setCustomDur] = useState(false);
  const [includePrev, setIncludePrev] = useState(true);
  const [randomize, setRandomize] = useState(true);

  const [started, setStarted] = useState(false);
  const [examQs, setExamQs] = useState<McqRow[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  // Server-authoritative result returned by submitCustomExamAttempt.
  // Until submit is called, this is null and the UI shows in-progress stats only.
  const [result, setResult] = useState<{
    attemptId: string;
    correct: number;
    wrong: number;
    skipped: number;
    total: number;
    score: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const generateExamFn = useServerFn(generateCustomExam);
  const submitExamFn = useServerFn(submitCustomExamAttempt);

  // ---------- Live academic tree ----------
  const tree = useQuery({
    queryKey: ["custom-exam-tree"],
    queryFn: async () => {
      const [lvl, subj, chap] = await Promise.all([
        supabase
          .from("levels")
          .select("code,name,description,color,icon")
          .eq("status", "published")
          .order("sort_order"),
        supabase
          .from("subjects")
          .select("id,name,level,description,color,icon")
          .eq("status", "published")
          .order("sort_order"),
        supabase
          .from("chapters")
          .select("id,name,subject_id,description")
          .eq("status", "published")
          .order("sort_order"),
      ]);
      return {
        levels: (lvl.data ?? []) as LevelRow[],
        subjects: (subj.data ?? []) as SubjectRow[],
        chapters: (chap.data ?? []) as ChapterRow[],
      };
    },
    staleTime: 60_000,
  });

  // ---------- Live MCQ counts per chapter (for the selected subject) ----------
  const counts = useQuery({
    queryKey: ["custom-exam-mcq-counts", subject?.id ?? null],
    enabled: !!subject?.id,
    queryFn: async () => {
      const chapterIds = (tree.data?.chapters ?? [])
        .filter((c) => c.subject_id === subject!.id)
        .map((c) => c.id);
      if (chapterIds.length === 0) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("mcqs")
        .select("chapter_id")
        .eq("status", "published")
        .in("chapter_id", chapterIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const id of chapterIds) map[id] = 0;
      for (const row of (data ?? []) as { chapter_id: string }[]) {
        map[row.chapter_id] = (map[row.chapter_id] ?? 0) + 1;
      }
      return map;
    },
    staleTime: 15_000,
  });

  // ---------- Realtime invalidation: new/updated MCQs ----------
  useEffect(() => {
    const channel = supabase
      .channel(`custom-exam-mcqs-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mcqs" }, () => {
        qc.invalidateQueries({ queryKey: ["custom-exam-mcq-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chapters" }, () => {
        qc.invalidateQueries({ queryKey: ["custom-exam-tree"] });
        qc.invalidateQueries({ queryKey: ["custom-exam-mcq-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "subjects" }, () => {
        qc.invalidateQueries({ queryKey: ["custom-exam-tree"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "levels" }, () => {
        qc.invalidateQueries({ queryKey: ["custom-exam-tree"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  // ---------- Timer ----------
  useEffect(() => {
    if (!started || submitted) return;
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [started, submitted]);

  const m = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const s = String(timeLeft % 60).padStart(2, "0");

  // ---------- Derived ----------
  const levels = tree.data?.levels ?? [];
  const subjects = useMemo(
    () => (tree.data?.subjects ?? []).filter((s) => s.level === level),
    [tree.data, level],
  );
  const chapters = useMemo(
    () => (tree.data?.chapters ?? []).filter((c) => subject && c.subject_id === subject.id),
    [tree.data, subject],
  );
  const countMap = counts.data ?? {};

  const totalAvail = chapters
    .filter((c) => selectedChaps.has(c.id))
    .reduce((a, c) => a + (countMap[c.id] ?? 0), 0);

  const toggleChap = (id: string) => {
    const n = new Set(selectedChaps);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelectedChaps(n);
  };

  // ---------- Generate exam from real MCQs (server-authoritative) ----------
  const generateExam = async () => {
    if (selectedChaps.size === 0) return;
    setSubmitting(true);
    try {
      const picked = await generateExamFn({
        data: {
          chapterIds: Array.from(selectedChaps),
          count: mcqCount,
          randomize,
          level: level ?? undefined,
          subjectId: subject?.id ?? undefined,
        },
      });
      if (!picked || picked.length === 0) return;
      setExamQs(picked as McqRow[]);
      setMcqCount(picked.length);
      setAnswers({});
      setBookmarks(new Set());
      setCurrent(0);
      setSubmitted(false);
      setResult(null);
      setTimeLeft(duration * 60);
      setStarted(true);
      setStep(4);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit to server — never compute correctness on the client.
  const submitExam = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      const elapsed = Math.max(0, duration * 60 - timeLeft);
      const r = await submitExamFn({
        data: {
          durationSeconds: elapsed,
          level: level ?? undefined,
          subjectId: subject?.id ?? undefined,
          chapterIds: Array.from(selectedChaps),
          answers: examQs.map((q, i) => ({
            mcqId: q.id,
            chosen: (answers[i] as "A" | "B" | "C" | "D" | undefined) ?? null,
            timeMs: 0,
          })),
        },
      });
      // Update result + submitted together so the result view renders
      // in the same render pass as the state flip.
      setResult(r);
      setSubmitted(true);
      // Scroll to top so the result panel is visible immediately.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      toast.success("Exam submitted");
    } catch (e) {
      console.error("Custom exam submit failed", e);
      const msg = e instanceof Error ? e.message : "Could not submit exam. Please try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };


  // Display stats — pre-submit shows only attempted/remaining (no correctness),
  // post-submit shows server-confirmed numbers.
  const attemptedCount = Object.keys(answers).length;
  const correctCount = result?.correct ?? 0;
  const wrong = result?.wrong ?? 0;
  const accuracy = result?.score ?? 0;
  const progress = examQs.length === 0 ? 0 : (attemptedCount / examQs.length) * 100;

  // ---------- UI ----------
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        {!started && (
          <div className="animate-fade-up">
            <h1 className="font-display text-3xl font-bold sm:text-4xl">
              Create Your <span className="text-gradient">Custom Exam</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Choose your level, subject, chapters, question amount and exam duration.
            </p>
          </div>
        )}

        {!started && (
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
                          active
                            ? "bg-white/20"
                            : done
                              ? "bg-foreground/10"
                              : "border border-border"
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
        )}

        {/* STEP 1 - Levels */}
        {!started && step === 0 && (
          <section className="animate-fade-up grid grid-cols-1 gap-5 md:grid-cols-3">
            {tree.isLoading && (
              <div className="glass col-span-full flex items-center justify-center rounded-2xl p-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {!tree.isLoading && levels.length === 0 && (
              <EmptyState text="No levels published yet." />
            )}
            {levels.map((l, i) => {
              const Icon = levelIcon(l.code);
              const tone = l.color || levelTone(i);
              return (
                <button
                  key={l.code}
                  onClick={() => {
                    setLevel(l.code);
                    setSubject(null);
                    setSelectedChaps(new Set());
                    setStep(1);
                  }}
                  className="group relative rounded-3xl p-px text-left transition-transform hover:-translate-y-1"
                  style={{ background: `linear-gradient(135deg, ${tone}, transparent 65%)` }}
                >
                  <div className="glass relative h-full overflow-hidden rounded-[calc(theme(borderRadius.3xl)-1px)] p-6">
                    <div
                      className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-40 blur-3xl transition-opacity group-hover:opacity-80"
                      style={{ background: tone }}
                    />
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-glow"
                      style={{
                        background: `linear-gradient(135deg, ${tone}, oklch(0.55 0.2 270))`,
                      }}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-display mt-5 text-xl font-bold">{l.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {l.description ?? "Curated content set"}
                    </p>
                    <div className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-gradient">
                      Continue <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        )}

        {/* STEP 2 - Subjects */}
        {!started && step === 1 && (
          <section className="animate-fade-up grid grid-cols-2 gap-4 md:grid-cols-3">
            {subjects.length === 0 && (
              <EmptyState text="No subjects published for this level yet." />
            )}
            {subjects.map((sub, i) => {
              const chapCount = (tree.data?.chapters ?? []).filter(
                (c) => c.subject_id === sub.id,
              ).length;
              const tone = sub.color || subjectTone(i);
              return (
                <button
                  key={sub.id}
                  onClick={() => {
                    setSubject({ id: sub.id, name: sub.name });
                    setSelectedChaps(new Set());
                    setOpenChap(null);
                    setStep(2);
                  }}
                  className="group relative rounded-3xl p-px text-left transition-transform hover:-translate-y-1"
                  style={{ background: `linear-gradient(135deg, ${tone}, transparent 65%)` }}
                >
                  <div className="glass relative h-full overflow-hidden rounded-[calc(theme(borderRadius.3xl)-1px)] p-5">
                    <div
                      className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl transition-opacity group-hover:opacity-70"
                      style={{ background: tone }}
                    />
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
                      style={{
                        background: `linear-gradient(135deg, ${tone}, oklch(0.55 0.2 270))`,
                      }}
                    >
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <h3 className="font-display mt-4 text-lg font-bold">{sub.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {chapCount} chapter{chapCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </button>
              );
            })}
          </section>
        )}

        {/* STEP 3 - Chapters */}
        {!started && step === 2 && (
          <section className="animate-fade-up space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground font-semibold">{selectedChaps.size}</span>{" "}
                chapter(s) selected ·{" "}
                <span className="text-foreground font-semibold">{totalAvail}</span> MCQs available
              </p>
              <button
                onClick={() => selectedChaps.size > 0 && totalAvail > 0 && setStep(3)}
                disabled={selectedChaps.size === 0 || totalAvail === 0}
                className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:opacity-40"
              >
                Continue <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="glass shadow-card-soft overflow-hidden rounded-3xl">
              {chapters.length === 0 ? (
                <EmptyState text="No chapters published for this subject yet." />
              ) : (
                <ul className="divide-y divide-border">
                  {chapters.map((c) => {
                    const open = openChap === c.id;
                    const checked = selectedChaps.has(c.id);
                    const q = countMap[c.id] ?? 0;
                    const empty = q === 0;
                    return (
                      <li key={c.id}>
                        <div className="flex items-stretch">
                          <button
                            onClick={() => !empty && toggleChap(c.id)}
                            disabled={empty}
                            className={`flex w-12 shrink-0 items-center justify-center transition-colors ${
                              checked ? "bg-cta-gradient text-white" : "hover:bg-muted"
                            } ${empty ? "opacity-40 cursor-not-allowed" : ""}`}
                            aria-label="Select chapter"
                          >
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                                checked ? "border-white bg-white/20" : "border-border"
                              }`}
                            >
                              {checked && <Check className="h-3 w-3" />}
                            </span>
                          </button>
                          <button
                            onClick={() => setOpenChap(open ? null : c.id)}
                            className="flex flex-1 items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
                          >
                            <div className="bg-cta-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow">
                              <Atom className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-display font-bold">{c.name}</p>
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {empty
                                  ? "No MCQs available for this chapter yet."
                                  : `${q} MCQs available`}
                              </p>
                            </div>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                            />
                          </button>
                        </div>
                        {open && (
                          <div className="animate-fade-up grid grid-cols-2 gap-3 border-t border-border bg-background/40 px-5 py-4 sm:grid-cols-4">
                            {[
                              { l: "MCQs", v: q },
                              { l: "Subject", v: subject?.name ?? "—" },
                              { l: "Level", v: level ?? "—" },
                              { l: "Status", v: empty ? "Empty" : "Ready" },
                            ].map((x) => (
                              <div key={x.l} className="rounded-xl bg-card/40 p-3">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  {x.l}
                                </p>
                                <p className="font-display mt-1 text-sm font-bold">{String(x.v)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* STEP 4 - SETUP */}
        {!started && step === 3 && (
          <section className="animate-fade-up grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="glass shadow-card-soft rounded-3xl p-6 lg:col-span-2">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-[var(--neon-purple)]" />
                <h3 className="font-display text-lg font-bold">Exam Configuration</h3>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Number of MCQs</p>
                  <p className="text-xs text-muted-foreground">Max available: {totalAvail}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {mcqPresets.map((n) => {
                    const active = !customMcq && mcqCount === n;
                    const disabled = n > totalAvail;
                    return (
                      <button
                        key={n}
                        onClick={() => {
                          if (disabled) return;
                          setCustomMcq(false);
                          setMcqCount(n);
                        }}
                        disabled={disabled}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                          active
                            ? "bg-cta-gradient text-white shadow-glow"
                            : "glass hover:scale-[1.02]"
                        } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        {n}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCustomMcq(true)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                      customMcq
                        ? "bg-cta-gradient text-white shadow-glow"
                        : "glass hover:scale-[1.02]"
                    }`}
                  >
                    Custom
                  </button>
                  {customMcq && (
                    <input
                      type="number"
                      min={1}
                      max={totalAvail || 200}
                      value={mcqCount}
                      onChange={(e) =>
                        setMcqCount(
                          Math.max(1, Math.min(totalAvail || 200, Number(e.target.value) || 1)),
                        )
                      }
                      className="h-10 w-24 rounded-xl border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
                    />
                  )}
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Exam Duration</p>
                  <p className="text-xs text-muted-foreground">minutes</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {timePresets.map((n) => {
                    const active = !customDur && duration === n;
                    return (
                      <button
                        key={n}
                        onClick={() => {
                          setCustomDur(false);
                          setDuration(n);
                        }}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                          active
                            ? "bg-cta-gradient text-white shadow-glow"
                            : "glass hover:scale-[1.02]"
                        }`}
                      >
                        {n} min
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCustomDur(true)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                      customDur
                        ? "bg-cta-gradient text-white shadow-glow"
                        : "glass hover:scale-[1.02]"
                    }`}
                  >
                    Custom
                  </button>
                  {customDur && (
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={duration}
                      onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 1))}
                      className="h-10 w-24 rounded-xl border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
                    />
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <Toggle
                  icon={Sparkle}
                  label="Include previously attempted questions"
                  desc="Mix older MCQs back into this exam"
                  value={includePrev}
                  onChange={setIncludePrev}
                />
                <Toggle
                  icon={Shuffle}
                  label="Randomize question order"
                  desc="Shuffle question sequence on start"
                  value={randomize}
                  onChange={setRandomize}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6">
                <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[var(--neon-purple)]/30 blur-3xl" />
                <h3 className="font-display text-lg font-bold">Live Summary</h3>
                <p className="text-xs text-muted-foreground">Real-time exam blueprint</p>
                <ul className="mt-5 space-y-3 text-sm">
                  <Row
                    icon={ListChecks}
                    l="Total Questions"
                    v={String(Math.min(mcqCount, totalAvail))}
                  />
                  <Row icon={Sparkle} l="Total Marks" v={String(Math.min(mcqCount, totalAvail))} />
                  <Row icon={TimerIcon} l="Estimated Time" v={`${duration} min`} />
                  <Row icon={Atom} l="Selected Chapters" v={String(selectedChaps.size || "—")} />
                </ul>
                <button
                  onClick={generateExam}
                  disabled={selectedChaps.size === 0 || totalAvail === 0 || submitting}
                  className="bg-cta-gradient mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:opacity-40"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Generate Custom Exam <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* EXAM RUNNING */}
        {started && !submitted && examQs.length > 0 && (
          <section className="animate-fade-up space-y-4">
            <div className="glass shadow-card-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {subject?.name} · {level}
                  </p>
                  <h3 className="font-display text-lg font-bold">Custom Exam</h3>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`glass flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold ${
                      timeLeft < 60 ? "text-red-400" : "text-gradient"
                    }`}
                  >
                    <Clock className="h-4 w-4" /> {m}:{s}
                  </div>
                  <button
                    onClick={() => {
                      setStarted(false);
                      setStep(3);
                    }}
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
                  {Object.keys(answers).length}/{examQs.length}
                </span>
              </div>
            </div>

            <div className="glass shadow-glow relative overflow-hidden rounded-3xl p-6">
              <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[var(--neon-purple)]/25 blur-3xl" />
              <div className="pointer-events-none absolute -left-20 -bottom-20 h-60 w-60 rounded-full bg-[var(--neon-blue)]/20 blur-3xl" />

              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="glass rounded-xl px-3 py-1.5 text-xs font-semibold">
                    Q {String(current + 1).padStart(2, "0")} / {examQs.length}
                  </span>
                </div>
                <button
                  onClick={() => {
                    const b = new Set(bookmarks);
                    b.has(current) ? b.delete(current) : b.add(current);
                    setBookmarks(b);
                  }}
                  className={`glass flex h-9 w-9 items-center justify-center rounded-xl transition-transform hover:scale-105 ${
                    bookmarks.has(current) ? "text-[var(--neon-pink)]" : ""
                  }`}
                >
                  <Bookmark
                    className="h-4 w-4"
                    fill={bookmarks.has(current) ? "currentColor" : "none"}
                  />
                </button>
              </div>

              <h3 className="font-display relative mt-6 text-xl font-bold leading-snug sm:text-2xl">
                {sanitizeOptionText(examQs[current].question)}
              </h3>

              <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(["A", "B", "C", "D"] as const).map((k) => {
                  const text = sanitizeOptionText(
                    (examQs[current] as any)[`option_${k.toLowerCase()}`] as string,
                  );
                  const isPicked = answers[current] === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setAnswers({ ...answers, [current]: k })}
                      className={`group relative flex items-center gap-4 rounded-2xl border p-4 text-left transition-all ${
                        isPicked
                          ? "border-primary bg-primary/10 shadow-glow"
                          : "border-border hover:border-primary/50 hover:bg-muted/40"
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-base font-bold transition-all ${
                          isPicked
                            ? "bg-cta-gradient text-white shadow-glow"
                            : "bg-muted text-foreground group-hover:bg-cta-gradient group-hover:text-white"
                        }`}
                      >
                        {k}
                      </span>
                      <span className="text-sm font-medium">{text}</span>
                    </button>
                  );
                })}
              </div>

              <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                  disabled={current === 0}
                  className="glass inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02] disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" /> Previous
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={submitExam}
                    disabled={submitting}
                    className="rounded-xl border border-border bg-background/40 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {submitting ? "Submitting…" : "Submit Exam"}
                  </button>
                  <button
                    onClick={() =>
                      current === examQs.length - 1
                        ? submitExam()
                        : setCurrent((c) => Math.min(examQs.length - 1, c + 1))
                    }
                    disabled={submitting}
                    className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:opacity-50"
                  >
                    {current === examQs.length - 1
                      ? submitting
                        ? "Submitting…"
                        : "Finish"
                      : "Next"}{" "}
                    <ArrowRight className="h-4 w-4" />
                  </button>

                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* RIGHT PANEL */}
      {started && !submitted && examQs.length > 0 && (
        <aside className="space-y-4">
          <div className="glass shadow-card-soft rounded-3xl p-5">
            <h3 className="font-display text-base font-bold">Question Navigator</h3>
            <p className="text-xs text-muted-foreground">{examQs.length} questions total</p>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {examQs.map((_, i) => {
                const isCurrent = i === current;
                const isDone = answers[i] !== undefined;
                const isBookmarked = bookmarks.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`relative flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition-transform hover:scale-110 ${
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
            <h3 className="font-display text-base font-bold">Performance</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat l="Attempted" v={`${Object.keys(answers).length}/${examQs.length}`} />
              <Stat l="Remaining" v={String(examQs.length - Object.keys(answers).length)} />
              <Stat l="Accuracy" v={`${accuracy}%`} gradient />
              <Stat l="Time" v={`${m}:${s}`} />
            </div>
          </div>
        </aside>
      )}

      {/* RESULT */}
      {submitted && (
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
                <h2 className="font-display mt-4 text-2xl font-bold">Exam Complete!</h2>
                <p className="text-sm text-muted-foreground">Custom exam result</p>

                <div className="relative mx-auto mt-6 h-40 w-40">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                    <defs>
                      <linearGradient id="cres" x1="0" y1="0" x2="1" y2="1">
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
                      stroke="url(#cres)"
                      strokeWidth="10"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray="339"
                      strokeDashoffset={339 - (339 * accuracy) / 100}
                      style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="font-display text-3xl font-bold text-gradient">{accuracy}%</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Accuracy
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-4 gap-2">
                  {[
                    { l: "Correct", v: correctCount, c: "text-emerald-400" },
                    { l: "Wrong", v: wrong, c: "text-red-400" },
                    {
                      l: "Skipped",
                      v: examQs.length - Object.keys(answers).length,
                      c: "text-muted-foreground",
                    },
                    {
                      l: "Time",
                      v: `${duration - Math.floor(timeLeft / 60)}m`,
                      c: "text-gradient",
                    },
                  ].map((x) => (
                    <div key={x.l} className="rounded-2xl border border-border bg-card/40 p-3">
                      <p className={`font-display text-lg font-bold ${x.c}`}>{x.v}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {x.l}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button className="glass inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-transform hover:scale-[1.02]">
                    <Download className="h-4 w-4" /> Download Result
                  </button>
                  <button
                    onClick={() => {
                      setAnswers({});
                      setBookmarks(new Set());
                      setCurrent(0);
                      setSubmitted(false);
                      setResult(null);
                      setTimeLeft(duration * 60);
                    }}
                    className="bg-cta-gradient inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02]"
                  >
                    <RotateCw className="h-4 w-4" /> Retry Exam
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background/40 p-10 text-center">
      <BookOpen className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function Toggle({
  icon: Icon,
  label,
  desc,
  value,
  onChange,
}: {
  icon: any;
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-background/40 p-4">
      <div className="flex items-center gap-3">
        <div className="bg-cta-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-glow">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-[10px] text-muted-foreground">{desc}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-cta-gradient shadow-glow" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

function Row({ icon: Icon, l, v }: { icon: any; l: string; v: string }) {
  return (
    <li className="flex items-center justify-between rounded-xl bg-background/40 px-3 py-2.5">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {l}
      </span>
      <span className="font-display font-bold">{v}</span>
    </li>
  );
}

function Stat({ l, v, gradient }: { l: string; v: string; gradient?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</p>
      <p className={`font-display mt-1 text-xl font-bold ${gradient ? "text-gradient" : ""}`}>
        {v}
      </p>
    </div>
  );
}
