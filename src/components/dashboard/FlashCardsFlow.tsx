import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getFlashCardVisibility, listPublicFlashCards } from "@/lib/admin-flash-cards.functions";

import {
  Sparkles,
  Award,
  Crown,
  Atom,
  FlaskConical,
  Dna,
  Sigma,
  Languages,
  Cpu,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RotateCw,
  Bookmark,
  CheckCircle2,
  Layers,
  Flame,
  Target,
  Clock,
  Star,
  Brain,
  TrendingUp,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";

type Step = 0 | 1 | 2 | 3;

type LevelRow = { code: string; name: string; description: string | null };
type SubjectRow = { id: string; name: string; level: string; description: string | null };
type ChapterRow = { id: string; name: string; subject_id: string; description: string | null };

const levelIcon = (code: string) => {
  const k = code.toLowerCase();
  if (k.includes("cert")) return Sparkles;
  if (k.includes("adv") || k.includes("exp") || k.includes("mast")) return Crown;
  return Award;
};
const levelGradient = (i: number) =>
  [
    "from-sky-500 to-indigo-500",
    "from-[var(--neon-purple)] to-fuchsia-500",
    "from-amber-400 to-rose-500",
  ][i % 3];

const subjectIcons = [Atom, FlaskConical, Dna, Sigma, Languages, Cpu, BookOpen];
const subjectGradients = [
  "from-[var(--neon-purple)] to-[var(--neon-blue)]",
  "from-fuchsia-500 to-purple-600",
  "from-emerald-500 to-cyan-500",
  "from-amber-500 to-pink-500",
  "from-sky-500 to-indigo-500",
  "from-violet-500 to-blue-600",
];

export function FlashCardsFlow() {
  const [step, setStep] = useState<Step>(0);
  const [level, setLevel] = useState<LevelRow | null>(null);
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [chapter, setChapter] = useState<ChapterRow | null>(null);

  const qc = useQueryClient();
  const visFn = useServerFn(getFlashCardVisibility);
  const vis = useQuery({
    queryKey: ["flash-card-visibility"],
    queryFn: () => visFn(),
    staleTime: 30_000,
  });

  // Live academic tree
  const tree = useQuery({
    queryKey: ["fc-tree"],
    queryFn: async () => {
      const [lvl, subj, chap] = await Promise.all([
        supabase
          .from("levels")
          .select("code,name,description")
          .eq("status", "published")
          .order("sort_order"),
        supabase
          .from("subjects")
          .select("id,name,level,description")
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

  // Per-chapter card counts for the selected subject
  const cardCounts = useQuery({
    queryKey: ["fc-chapter-counts", subject?.id ?? null],
    enabled: !!subject?.id,
    queryFn: async () => {
      const chapterIds = (tree.data?.chapters ?? [])
        .filter((c) => c.subject_id === subject!.id)
        .map((c) => c.id);
      if (!chapterIds.length) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("flash_cards")
        .select("chapter_id")
        .eq("status", "published")
        .eq("is_hidden", false)
        .in("chapter_id", chapterIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const id of chapterIds) map[id] = 0;
      for (const r of (data ?? []) as { chapter_id: string }[])
        map[r.chapter_id] = (map[r.chapter_id] ?? 0) + 1;
      return map;
    },
    staleTime: 15_000,
  });

  // Subject totals (for level grid)
  const subjectCounts = useQuery({
    queryKey: ["fc-subject-counts", level?.code ?? null],
    enabled: !!level?.code,
    queryFn: async () => {
      const subjs = (tree.data?.subjects ?? []).filter((s) => s.level === level!.code);
      if (!subjs.length) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("flash_cards")
        .select("subject_id")
        .eq("status", "published")
        .eq("is_hidden", false)
        .eq("level", level!.code)
        .in(
          "subject_id",
          subjs.map((s) => s.id),
        );
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const s of subjs) map[s.id] = 0;
      for (const r of (data ?? []) as { subject_id: string | null }[]) {
        if (r.subject_id) map[r.subject_id] = (map[r.subject_id] ?? 0) + 1;
      }
      return map;
    },
    staleTime: 15_000,
  });

  // Realtime: visibility + flash_cards + tree
  useEffect(() => {
    const ch = supabase
      .channel(`student-flash-cards-live-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flash_card_visibility" },
        () => {
          qc.invalidateQueries({ queryKey: ["flash-card-visibility"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_cards" }, () => {
        qc.invalidateQueries({ queryKey: ["public-flash-cards"] });
        qc.invalidateQueries({ queryKey: ["fc-chapter-counts"] });
        qc.invalidateQueries({ queryKey: ["fc-subject-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "levels" }, () =>
        qc.invalidateQueries({ queryKey: ["fc-tree"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "subjects" }, () =>
        qc.invalidateQueries({ queryKey: ["fc-tree"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chapters" }, () =>
        qc.invalidateQueries({ queryKey: ["fc-tree"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const hiddenLevels = new Set(vis.data?.hidden_levels ?? []);
  const hiddenSubjects = new Set(vis.data?.hidden_subject_ids ?? []);
  const hiddenChapters = new Set(vis.data?.hidden_chapter_ids ?? []);

  const visibleLevels = (tree.data?.levels ?? []).filter((l) => !hiddenLevels.has(l.code));
  const visibleSubjects = (tree.data?.subjects ?? []).filter(
    (s) => s.level === level?.code && !hiddenSubjects.has(s.id),
  );
  const visibleChapters = (tree.data?.chapters ?? []).filter(
    (c) => c.subject_id === subject?.id && !hiddenChapters.has(c.id),
  );

  if (vis.data?.section_hidden) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyBlock
          title="Flash cards are temporarily unavailable"
          desc="Your instructor has paused the flash card section. Please check back soon."
        />
      </div>
    );
  }

  const loadingTree = tree.isLoading || vis.isLoading;

  return (
    <div className="space-y-6">
      <Header />
      <Stepper
        step={step}
        level={level?.name ?? ""}
        subject={subject?.name ?? ""}
        chapter={chapter?.name ?? ""}
        setStep={setStep}
      />

      {step === 0 && (
        <>
          {loadingTree ? (
            <LoadingGrid />
          ) : visibleLevels.length === 0 ? (
            <EmptyBlock
              title="No levels published yet"
              desc="Once an admin publishes a level it will appear here."
            />
          ) : (
            <Grid>
              {visibleLevels.map((l, i) => (
                <SelectCard
                  key={l.code}
                  title={l.name}
                  desc={l.description ?? "Curated revision deck"}
                  Icon={levelIcon(l.code)}
                  gradient={levelGradient(i)}
                  delay={i * 70}
                  onClick={() => {
                    setLevel(l);
                    setSubject(null);
                    setChapter(null);
                    setStep(1);
                  }}
                />
              ))}
            </Grid>
          )}
        </>
      )}

      {step === 1 && (
        <>
          {visibleSubjects.length === 0 ? (
            <EmptyBlock
              title="No subjects in this level"
              desc="Pick another level or wait for new uploads."
            />
          ) : (
            <Grid cols={3}>
              {visibleSubjects.map((s, i) => {
                const Icon = subjectIcons[i % subjectIcons.length];
                const grad = subjectGradients[i % subjectGradients.length];
                const count = subjectCounts.data?.[s.id] ?? 0;
                return (
                  <SelectCard
                    key={s.id}
                    title={s.name}
                    desc={`${count} flash card${count === 1 ? "" : "s"}`}
                    Icon={Icon}
                    gradient={grad}
                    delay={i * 60}
                    onClick={() => {
                      setSubject(s);
                      setChapter(null);
                      setStep(2);
                    }}
                  />
                );
              })}
            </Grid>
          )}
        </>
      )}

      {step === 2 && (
        <ChapterList
          chapters={visibleChapters}
          counts={cardCounts.data ?? {}}
          onPick={(c) => {
            setChapter(c);
            setStep(3);
          }}
        />
      )}

      {step === 3 && level && subject && chapter && (
        <Viewer
          level={level.code}
          levelName={level.name}
          subjectId={subject.id}
          subjectName={subject.name}
          chapterId={chapter.id}
          chapterName={chapter.name}
        />
      )}
    </div>
  );
}

/* ------------------------------ pieces ------------------------------ */

function Header() {
  return (
    <div className="glass rounded-3xl p-6 shadow-card-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
            <Layers className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
            Smart Flash Cards
          </div>
          <h1 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Smart <span className="text-gradient">Flash Cards</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quick revision cards for faster learning and memorization.
          </p>
        </div>
        <div className="flex gap-2">
          <Pill icon={Flame} label="Streak" value="12d" />
          <Pill icon={Brain} label="Learned" value="284" />
        </div>
      </div>
    </div>
  );
}

function Pill({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
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

function Stepper({
  step,
  level,
  subject,
  chapter,
  setStep,
}: {
  step: Step;
  level: string;
  subject: string;
  chapter: string;
  setStep: (s: Step) => void;
}) {
  const items = [
    { i: 0, l: "Level", v: level || "—" },
    { i: 1, l: "Subject", v: subject || "—" },
    { i: 2, l: "Chapter", v: chapter || "—" },
    { i: 3, l: "Study", v: chapter ? "In progress" : "—" },
  ];
  return (
    <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3 shadow-card-soft">
      {items.map((it, idx) => {
        const active = step === it.i;
        const done = step > it.i;
        return (
          <div key={it.l} className="flex items-center gap-2">
            <button
              onClick={() => (done || active) && setStep(it.i as Step)}
              className={`group flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition ${
                active
                  ? "bg-cta-gradient text-white shadow-glow"
                  : done
                    ? "bg-muted/60 text-foreground hover:bg-muted"
                    : "text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  active ? "bg-white/20" : done ? "bg-emerald-500/20 text-emerald-400" : "bg-muted"
                }`}
              >
                {done ? "✓" : it.i + 1}
              </span>
              <span>{it.l}:</span>
              <span className="opacity-80">{it.v}</span>
            </button>
            {idx < items.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${cols === 3 ? "lg:grid-cols-3" : ""}`}>
      {children}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="glass rounded-3xl p-12 shadow-card-soft flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading content…
    </div>
  );
}

function EmptyBlock({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="glass shadow-card-soft rounded-3xl p-12 text-center">
      <Layers className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="font-display mt-4 text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function SelectCard({
  title,
  desc,
  Icon,
  gradient,
  onClick,
  delay,
}: {
  title: string;
  desc: string;
  Icon: any;
  gradient: string;
  onClick: () => void;
  delay: number;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative animate-fade-in text-left"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div
        className={`absolute -inset-px rounded-3xl bg-gradient-to-br ${gradient} opacity-0 blur transition-opacity duration-300 group-hover:opacity-60`}
      />
      <div className="glass relative h-full overflow-hidden rounded-3xl p-6 shadow-card-soft transition-transform duration-300 group-hover:-translate-y-1">
        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <div
          className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-glow`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="font-display mt-4 text-lg font-bold tracking-tight">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
        <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-gradient">
          Continue <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  );
}

function ChapterList({
  chapters,
  counts,
  onPick,
}: {
  chapters: ChapterRow[];
  counts: Record<string, number>;
  onPick: (c: ChapterRow) => void;
}) {
  const [open, setOpen] = useState<string | null>(chapters[0]?.id ?? null);
  useEffect(() => {
    setOpen(chapters[0]?.id ?? null);
  }, [chapters]);

  if (chapters.length === 0) {
    return (
      <EmptyBlock
        title="No chapters published yet"
        desc="An admin hasn't published chapters for this subject."
      />
    );
  }

  return (
    <div className="space-y-3">
      {chapters.map((ch, i) => {
        const isOpen = open === ch.id;
        const total = counts[ch.id] ?? 0;
        return (
          <div
            key={ch.id}
            className="glass overflow-hidden rounded-3xl shadow-card-soft animate-fade-in"
            style={{ animationDelay: `${i * 50}ms`, animationFillMode: "both" }}
          >
            <button
              onClick={() => setOpen(isOpen ? null : ch.id)}
              className="flex w-full items-center justify-between gap-3 p-5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cta-gradient text-white shadow-glow">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <div className="font-display text-base font-bold">{ch.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {total} flash card{total === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{total}</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border/40 bg-muted/20 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-[var(--neon-blue)]/10 px-2 py-0.5 font-semibold text-[var(--neon-blue)]">
                      {total} card{total === 1 ? "" : "s"} available
                    </span>
                    {ch.description && (
                      <span className="rounded-full bg-muted/60 px-2 py-0.5 text-muted-foreground line-clamp-1">
                        {ch.description}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onPick(ch)}
                    disabled={total === 0}
                    className="inline-flex items-center gap-2 rounded-full bg-cta-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {total === 0 ? "No cards yet" : "Study Cards"}{" "}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ viewer ------------------------------ */

function Viewer({
  level,
  levelName,
  subjectId,
  subjectName,
  chapterId,
  chapterName,
}: {
  level: string;
  levelName: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
}) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [learned, setLearned] = useState<Set<number>>(new Set());

  const fetchPublic = useServerFn(listPublicFlashCards);
  const live = useQuery({
    queryKey: ["public-flash-cards", { level, subjectId, chapterId }],
    queryFn: () => fetchPublic({ data: { level, subjectId, chapterId, limit: 120 } }),
    staleTime: 15_000,
  });

  useEffect(() => {
    setIdx(0);
    setFlipped(false);
  }, [chapterId]);

  const deck = useMemo(
    () =>
      (live.data ?? []).map((c) => ({
        front: c.front,
        back: c.back,
        formula: c.formula ?? "",
        tag: c.card_type,
      })),
    [live.data],
  );

  if (live.isLoading) {
    return (
      <div className="glass rounded-3xl p-12 shadow-card-soft flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading flash cards…
      </div>
    );
  }

  if (deck.length === 0) {
    return (
      <EmptyBlock
        title="No flash cards yet for this chapter"
        desc={`No published flash cards in ${subjectName} → ${chapterName} (${levelName}). Check back soon or ask your instructor to upload.`}
      />
    );
  }

  const card = deck[Math.min(idx, deck.length - 1)];
  const next = () => {
    setFlipped(false);
    setIdx((i) => Math.min(deck.length - 1, i + 1));
  };
  const prev = () => {
    setFlipped(false);
    setIdx((i) => Math.max(0, i - 1));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 shadow-card-soft">
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-muted/60 px-2 py-0.5 font-semibold">
              {subjectName}
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="rounded-full bg-[var(--neon-blue)]/10 px-2 py-0.5 font-semibold text-[var(--neon-blue)]">
              {chapterName}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Card{" "}
            <span className="font-display font-bold text-foreground">
              {String(idx + 1).padStart(2, "0")}
            </span>{" "}
            / {deck.length}
          </div>
        </div>

        <div className="[perspective:1500px]">
          <div
            className={`relative h-[420px] w-full transition-transform duration-700 [transform-style:preserve-3d] ${
              flipped ? "[transform:rotateY(180deg)]" : ""
            }`}
          >
            <Face variant={variantForIndex(idx)}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--neon-purple)]/30 bg-[var(--neon-purple)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--neon-purple)]">
                  <Sparkles className="h-3 w-3" /> {card.tag}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Front
                </span>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <Brain className="h-10 w-10 text-[var(--neon-blue)] drop-shadow-[0_0_18px_var(--neon-blue)]" />
                <h2 className="font-display mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                  {card.front}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">Tap flip to reveal the answer</p>
              </div>
              <FlipBtn onClick={() => setFlipped(true)} />
            </Face>

            <Face back variant={variantForIndex(idx)}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Explanation
                </span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Back · {card.tag}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                <p className="text-sm leading-relaxed text-foreground/90">{card.back}</p>
                {card.formula && (
                  <div className="mt-4 rounded-2xl border border-[var(--neon-purple)]/30 bg-gradient-to-br from-[var(--neon-purple)]/10 to-[var(--neon-blue)]/10 p-4">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Formula
                    </div>
                    <div className="font-display mt-1 text-xl font-bold text-gradient">
                      {card.formula}
                    </div>
                  </div>
                )}
              </div>
              <FlipBtn back onClick={() => setFlipped(false)} />
            </Face>
          </div>
        </div>

        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 shadow-card-soft">
          <button
            onClick={prev}
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <div className="flex items-center gap-2">
            <CtrlBtn
              active={bookmarks.has(idx)}
              onClick={() =>
                setBookmarks((b) => {
                  const n = new Set(b);
                  n.has(idx) ? n.delete(idx) : n.add(idx);
                  return n;
                })
              }
              Icon={Bookmark}
              label="Bookmark"
            />
            <CtrlBtn
              active={learned.has(idx)}
              onClick={() =>
                setLearned((b) => {
                  const n = new Set(b);
                  n.has(idx) ? n.delete(idx) : n.add(idx);
                  return n;
                })
              }
              Icon={CheckCircle2}
              label="Learned"
              variant="success"
            />
            <button
              onClick={() => setFlipped((f) => !f)}
              className="inline-flex items-center gap-2 rounded-full bg-cta-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow hover:scale-[1.02] transition-transform"
            >
              <RotateCw className="h-4 w-4" /> Flip
            </button>
          </div>
          <button
            onClick={next}
            className="inline-flex items-center gap-2 rounded-full bg-cta-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="glass rounded-3xl p-5 shadow-card-soft">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Study Progress
          </span>
          <div className="mt-4 space-y-3">
            <ProgRing pct={deck.length ? Math.round((learned.size / deck.length) * 100) : 0} />
            <Row label="Completed" value={`${learned.size}`} icon={CheckCircle2} />
            <Row
              label="Remaining"
              value={`${Math.max(0, deck.length - learned.size)}`}
              icon={Layers}
            />
            <Row label="Bookmarks" value={`${bookmarks.size}`} icon={Star} />
            <Row label="Total" value={`${deck.length}`} icon={Target} />
          </div>
        </div>

        <div className="glass rounded-3xl p-5 shadow-card-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Bookmarks
            </span>
            <Bookmark className="h-4 w-4 text-amber-400" />
          </div>
          <ul className="mt-3 space-y-2">
            {[...bookmarks].slice(0, 4).map((i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2 hover:bg-muted/60 cursor-pointer"
                onClick={() => {
                  setIdx(i);
                  setFlipped(false);
                }}
              >
                <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold line-clamp-1">{deck[i]?.front}</div>
                  <div className="text-[10px] text-muted-foreground">{deck[i]?.tag}</div>
                </div>
              </li>
            ))}
            {bookmarks.size === 0 && (
              <li className="rounded-xl border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                No bookmarks yet
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ design variants ------------------------------ */

type FaceVariant = "classic" | "neon" | "minimal" | "tilt" | "study";
const FACE_VARIANTS: FaceVariant[] = ["classic", "neon", "minimal", "tilt", "study"];

/** Deterministic variant per card index — stable across re-renders for the same deck. */
function variantForIndex(i: number): FaceVariant {
  return FACE_VARIANTS[i % FACE_VARIANTS.length];
}

function Face({
  children,
  back,
  variant = "classic",
}: {
  children: React.ReactNode;
  back?: boolean;
  variant?: FaceVariant;
}) {
  const shell =
    variant === "neon"
      ? "border border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-500/15 via-purple-500/10 to-cyan-400/15 shadow-[0_0_60px_rgba(217,70,239,0.25)]"
      : variant === "minimal"
        ? "border border-border/60 bg-background/80 backdrop-blur-md"
        : variant === "tilt"
          ? "glass shadow-card-soft transition-transform duration-300 hover:[transform:rotateX(4deg)_rotateY(-4deg)_scale(1.01)]"
          : variant === "study"
            ? "border border-emerald-400/25 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-sky-500/10 shadow-[0_8px_40px_-12px_rgba(16,185,129,0.35)]"
            : "glass shadow-card-soft"; // classic

  const glowA =
    variant === "neon"
      ? "bg-fuchsia-500/35"
      : variant === "study"
        ? "bg-emerald-400/25"
        : "bg-[var(--neon-purple)]/25";
  const glowB =
    variant === "neon"
      ? "bg-cyan-400/30"
      : variant === "study"
        ? "bg-sky-400/20"
        : "bg-[var(--neon-blue)]/25";

  return (
    <div
      className={`absolute inset-0 rounded-3xl ${back ? "[transform:rotateY(180deg)]" : ""} [backface-visibility:hidden]`}
    >
      <div
        className={`relative flex h-full flex-col overflow-hidden rounded-3xl p-6 sm:p-8 ${shell}`}
      >
        {variant !== "minimal" && (
          <>
            <div
              className={`pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full ${glowA} blur-3xl`}
            />
            <div
              className={`pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full ${glowB} blur-3xl`}
            />
          </>
        )}
        {variant === "neon" && (
          <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-fuchsia-400/40" />
        )}
        <div className="relative flex h-full flex-col">{children}</div>
      </div>
    </div>
  );
}

function FlipBtn({ onClick, back }: { onClick: () => void; back?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="mt-auto inline-flex items-center justify-center gap-2 self-center rounded-full border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 px-5 py-2 text-xs font-semibold text-[var(--neon-purple)] hover:bg-[var(--neon-purple)]/20"
    >
      <RotateCw className="h-3.5 w-3.5" /> {back ? "Back to question" : "Flip card"}
    </button>
  );
}

function CtrlBtn({
  active,
  onClick,
  Icon,
  label,
  variant = "default",
}: {
  active: boolean;
  onClick: () => void;
  Icon: any;
  label: string;
  variant?: "default" | "success";
}) {
  const activeStyle =
    variant === "success"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
      : "bg-amber-400/20 text-amber-400 border-amber-400/40";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition ${
        active ? activeStyle : "border-border/60 bg-muted/40 text-foreground/80 hover:bg-muted"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${active && variant === "default" ? "fill-amber-400" : ""}`} />
      {label}
    </button>
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

function ProgRing({ pct }: { pct: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const d = (pct / 100) * c;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border/40 bg-muted/30 p-3">
      <div className="relative h-[88px] w-[88px]">
        <svg viewBox="0 0 88 88" className="-rotate-90">
          <defs>
            <linearGradient id="ringSmall" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--neon-purple)" />
              <stop offset="100%" stopColor="var(--neon-blue)" />
            </linearGradient>
          </defs>
          <circle cx="44" cy="44" r={r} stroke="hsl(var(--muted))" strokeWidth="8" fill="none" />
          <circle
            cx="44"
            cy="44"
            r={r}
            stroke="url(#ringSmall)"
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${d} ${c}`}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-display text-lg font-bold text-gradient">{pct}%</div>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold">Mastery</div>
        <div className="text-[11px] text-muted-foreground">
          Keep going — small daily wins compound.
        </div>
      </div>
    </div>
  );
}
