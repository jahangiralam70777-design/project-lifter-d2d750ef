import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getQuestionBankVisibility,
  listPublicQuestionBank,
} from "@/lib/admin-question-bank.functions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
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
  ChevronRight,
  ChevronDown,
  Database,
  FileText,
  File,
  FileSpreadsheet,
  Search,
  Bookmark,
  Download,
  Hash,
  Star,
  Eye,
  Flame,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  Loader2,
} from "lucide-react";

type Step = 0 | 1 | 2 | 3;
type Kind = "text" | "pdf" | "doc";
type RType = "important" | "pyq" | "model" | "notes" | "text";

type LevelRow = { code: string; name: string; description: string | null };
type SubjectRow = { id: string; name: string; level: string; description: string | null };
type ChapterRow = { id: string; name: string; subject_id: string; description: string | null };

type Resource = {
  id: string;
  title: string;
  summary: string | null;
  level: string;
  subject_id: string | null;
  chapter_id: string | null;
  kind: Kind;
  resource_type: RType;
  body: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  question_count: number;
  tags: string[];
  download_count: number;
  view_count: number;
  updated_at: string;
};

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

const typeMeta: Record<RType | "pdf-kind", { label: string; icon: any; tone: string }> = {
  important: {
    label: "Important Qns",
    icon: Star,
    tone: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  },
  pyq: {
    label: "Previous Year",
    icon: Clock,
    tone: "text-[var(--neon-purple)] bg-[var(--neon-purple)]/10 border-[var(--neon-purple)]/30",
  },
  model: {
    label: "Model Test",
    icon: FileSpreadsheet,
    tone: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  },
  notes: { label: "Notes", icon: BookOpen, tone: "text-sky-400 bg-sky-400/10 border-sky-400/30" },
  text: { label: "Text", icon: FileText, tone: "text-sky-400 bg-sky-400/10 border-sky-400/30" },
  "pdf-kind": { label: "PDF", icon: File, tone: "text-rose-400 bg-rose-400/10 border-rose-400/30" },
};
const metaFor = (r: Pick<Resource, "kind" | "resource_type">) =>
  r.kind === "pdf" ? typeMeta["pdf-kind"] : typeMeta[r.resource_type];

export function QuestionBankFlow() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(0);
  const [level, setLevel] = useState<LevelRow | null>(null);
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [chapter, setChapter] = useState<ChapterRow | null>(null);

  const visFn = useServerFn(getQuestionBankVisibility);
  const vis = useQuery({
    queryKey: ["qb-visibility"],
    queryFn: () => visFn(),
    staleTime: 30_000,
  });

  const tree = useQuery({
    queryKey: ["qb-tree"],
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

  const subjectCounts = useQuery({
    queryKey: ["qb-subject-counts", level?.code ?? null],
    enabled: !!level?.code,
    queryFn: async () => {
      const subjs = (tree.data?.subjects ?? []).filter((s) => s.level === level!.code);
      if (!subjs.length) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("question_bank_resources")
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

  const chapterCounts = useQuery({
    queryKey: ["qb-chapter-counts", subject?.id ?? null],
    enabled: !!subject?.id,
    queryFn: async () => {
      const chapterIds = (tree.data?.chapters ?? [])
        .filter((c) => c.subject_id === subject!.id)
        .map((c) => c.id);
      if (!chapterIds.length) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("question_bank_resources")
        .select("chapter_id")
        .eq("status", "published")
        .eq("is_hidden", false)
        .in("chapter_id", chapterIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const id of chapterIds) map[id] = 0;
      for (const r of (data ?? []) as { chapter_id: string | null }[]) {
        if (r.chapter_id) map[r.chapter_id] = (map[r.chapter_id] ?? 0) + 1;
      }
      return map;
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`student-qb-live-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_bank_visibility" },
        () => {
          qc.invalidateQueries({ queryKey: ["qb-visibility"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_bank_resources" },
        () => {
          qc.invalidateQueries({ queryKey: ["public-qb"] });
          qc.invalidateQueries({ queryKey: ["qb-subject-counts"] });
          qc.invalidateQueries({ queryKey: ["qb-chapter-counts"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "levels" }, () =>
        qc.invalidateQueries({ queryKey: ["qb-tree"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "subjects" }, () =>
        qc.invalidateQueries({ queryKey: ["qb-tree"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chapters" }, () =>
        qc.invalidateQueries({ queryKey: ["qb-tree"] }),
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
          title="Question bank is temporarily unavailable"
          desc="Your instructor has paused the question bank section."
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

      {step === 0 &&
        (loadingTree ? (
          <LoadingBlock />
        ) : visibleLevels.length === 0 ? (
          <EmptyBlock
            title="No levels published yet"
            desc="An admin needs to publish a level first."
          />
        ) : (
          <Grid>
            {visibleLevels.map((l, i) => (
              <SelectCard
                key={l.code}
                title={l.name}
                desc={l.description ?? "Curated study material"}
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
        ))}

      {step === 1 &&
        (visibleSubjects.length === 0 ? (
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
                  desc={`${count} resource${count === 1 ? "" : "s"}`}
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
        ))}

      {step === 2 && (
        <ChapterList
          chapters={visibleChapters}
          counts={chapterCounts.data ?? {}}
          onPick={(c) => {
            setChapter(c);
            setStep(3);
          }}
        />
      )}

      {step === 3 && level && subject && chapter && (
        <BankViewer
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

/* ---------- shell ---------- */

function Header() {
  return (
    <div className="glass rounded-3xl p-6 shadow-card-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
            <Database className="h-3.5 w-3.5 text-[var(--neon-purple)]" /> Smart Question Bank
          </div>
          <h1 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Smart <span className="text-gradient">Question Bank</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Access chapter-wise important questions, PDFs and study resources.
          </p>
        </div>
        <div className="flex gap-2">
          <Pill icon={File} label="Files" value="Live" />
          <Pill icon={Download} label="Realtime" value="On" />
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
    { i: 3, l: "Browse", v: chapter ? "Active" : "—" },
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
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition ${
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

function LoadingBlock() {
  return (
    <div className="glass rounded-3xl p-12 shadow-card-soft flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading content…
    </div>
  );
}

function EmptyBlock({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="glass shadow-card-soft rounded-3xl p-12 text-center">
      <Database className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="font-display mt-4 text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function SelectCard({ title, desc, Icon, gradient, onClick, delay }: any) {
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
                  <Database className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <div className="font-display text-base font-bold">{ch.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {total} resource{total === 1 ? "" : "s"}
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
                      {total} file{total === 1 ? "" : "s"} available
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
                    {total === 0 ? "No resources yet" : "Open Bank"}{" "}
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

/* ---------- viewer ---------- */

function BankViewer({
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
  const fetchList = useServerFn(listPublicQuestionBank);
  const live = useQuery({
    queryKey: ["public-qb", { level, subjectId, chapterId }],
    queryFn: () => fetchList({ data: { level, subjectId, chapterId, limit: 200 } }),
    staleTime: 15_000,
  });

  const resources = useMemo<Resource[]>(
    () => (live.data && "rows" in live.data ? live.data.rows : []) as Resource[],
    [live.data],
  );

  const [active, setActive] = useState<Resource | null>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);
  const [kindFilter, setKindFilter] = useState<"ALL" | Kind>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | RType>("ALL");
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());

  useEffect(() => {
    setActive(resources[0] ?? null);
  }, [resources]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return resources.filter(
      (r) =>
        (kindFilter === "ALL" || r.kind === kindFilter) &&
        (typeFilter === "ALL" || r.resource_type === typeFilter) &&
        (q === "" ||
          r.title.toLowerCase().includes(q) ||
          (r.summary ?? "").toLowerCase().includes(q)),
    );
  }, [resources, debouncedQuery, kindFilter, typeFilter]);

  if (live.isLoading) return <LoadingBlock />;

  if (resources.length === 0) {
    return (
      <EmptyBlock
        title="No resources yet for this chapter"
        desc={`No published question bank items in ${subjectName} → ${chapterName} (${levelName}).`}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="glass rounded-2xl p-4 shadow-card-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(["ALL", "important", "pyq", "model", "notes", "text"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    typeFilter === t
                      ? "bg-cta-gradient text-white shadow-glow"
                      : "border border-border/60 bg-muted/40 text-foreground/70 hover:text-foreground"
                  }`}
                >
                  {t === "ALL" ? "All" : typeMeta[t].label}
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-border/60" />
              {(["ALL", "pdf", "doc", "text"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKindFilter(k as "ALL" | Kind)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    kindFilter === k
                      ? "bg-cta-gradient text-white shadow-glow"
                      : "border border-border/60 bg-muted/40 text-foreground/70 hover:text-foreground"
                  }`}
                >
                  {k === "ALL" ? "Any format" : k.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search resources…"
                className="w-full rounded-xl border border-border/60 bg-muted/30 py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground/70 focus:border-[var(--neon-purple)]/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {filtered.map((r, i) => (
              <ResourceCard
                key={r.id}
                r={r}
                active={active?.id === r.id}
                onOpen={() => setActive(r)}
                delay={i * 30}
              />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                No resources match your filters.
              </div>
            )}
          </div>
        </div>

        {active && (
          <div className="glass relative overflow-hidden rounded-3xl shadow-card-soft">
            <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[var(--neon-purple)]/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[var(--neon-blue)]/20 blur-3xl" />

            <div className="relative max-h-[640px] overflow-y-auto p-6 sm:p-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-muted/60 px-2 py-0.5 font-semibold">
                    {subjectName}
                  </span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <span className="rounded-full bg-[var(--neon-blue)]/10 px-2 py-0.5 font-semibold text-[var(--neon-blue)]">
                    {chapterName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setBookmarked((b) => {
                        const n = new Set(b);
                        n.has(active.id) ? n.delete(active.id) : n.add(active.id);
                        return n;
                      })
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      bookmarked.has(active.id)
                        ? "border-amber-400/40 bg-amber-400/15 text-amber-400"
                        : "border-border/60 bg-muted/40 text-foreground/80 hover:bg-muted"
                    }`}
                  >
                    <Bookmark
                      className={`h-3.5 w-3.5 ${bookmarked.has(active.id) ? "fill-amber-400" : ""}`}
                    />{" "}
                    Save
                  </button>
                  {active.file_url && (
                    <a
                      href={active.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-cta-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-glow"
                    >
                      <Download className="h-3.5 w-3.5" /> Open file
                    </a>
                  )}
                </div>
              </div>

              <ResourceBody resource={active} />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <StudyWidget total={resources.length} bookmarks={bookmarked.size} />
        <QuickAccess resources={resources} setActive={setActive} />
      </div>
    </div>
  );
}

function ResourceCard({
  r,
  active,
  onOpen,
  delay,
}: {
  r: Resource;
  active: boolean;
  onOpen: () => void;
  delay: number;
}) {
  const meta = metaFor(r);
  const Icon = meta.icon;
  return (
    <button
      onClick={onOpen}
      className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all animate-fade-in ${
        active
          ? "border-[var(--neon-purple)]/50 bg-[var(--neon-purple)]/5 shadow-glow"
          : "border-border/60 bg-muted/30 hover:-translate-y-0.5 hover:border-[var(--neon-purple)]/40"
      }`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="flex gap-3">
        <div className="flex h-14 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--neon-purple)]/20 to-[var(--neon-blue)]/20 text-[var(--neon-purple)]">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${meta.tone}`}
            >
              {meta.label}
            </span>
            <span className="truncate text-[10px] text-muted-foreground uppercase">{r.kind}</span>
          </div>
          <div className="mt-1 truncate font-display text-sm font-bold">{r.title}</div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Hash className="h-3 w-3" /> {r.question_count} qns
            </span>
            <span className="inline-flex items-center gap-1">
              <Download className="h-3 w-3" /> {r.download_count.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end text-[11px] font-semibold text-gradient">
        Open Viewer <ArrowUpRight className="ml-1 h-3 w-3" />
      </div>
    </button>
  );
}

function ResourceBody({ resource }: { resource: Resource }) {
  if (resource.kind === "pdf" || resource.kind === "doc") {
    return (
      <div className="rounded-2xl border border-border/60 bg-muted/30 p-6">
        <h2 className="font-display text-2xl font-bold">{resource.title}</h2>
        {resource.summary && (
          <p className="mt-2 text-sm text-muted-foreground">{resource.summary}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-muted/60 px-2 py-0.5 font-semibold uppercase">
            {resource.kind}
          </span>
          {resource.file_name && (
            <span className="rounded-full bg-muted/60 px-2 py-0.5">{resource.file_name}</span>
          )}
          {resource.file_size_bytes != null && (
            <span className="rounded-full bg-muted/60 px-2 py-0.5">
              {(resource.file_size_bytes / 1024 / 1024).toFixed(2)} MB
            </span>
          )}
        </div>
        {resource.file_url ? (
          <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-background">
            {resource.kind === "pdf" ? (
              <iframe src={resource.file_url} title={resource.title} className="h-[520px] w-full" />
            ) : (
              <a
                href={resource.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-6 text-center text-sm font-semibold text-[var(--neon-blue)] hover:underline"
              >
                Open document in a new tab
              </a>
            )}
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">No file attached.</p>
        )}
      </div>
    );
  }
  return (
    <article className="space-y-5">
      <h2 className="font-display text-3xl font-bold tracking-tight">{resource.title}</h2>
      {resource.summary && <p className="text-sm text-muted-foreground">{resource.summary}</p>}
      {resource.body ? (
        <div className="whitespace-pre-wrap rounded-2xl border border-border/40 bg-muted/30 p-5 text-[15px] leading-relaxed text-foreground/90">
          {resource.body}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No content provided.</p>
      )}
      {resource.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {resource.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
            >
              #{t}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function StudyWidget({ total, bookmarks }: { total: number; bookmarks: number }) {
  return (
    <div className="glass rounded-3xl p-5 shadow-card-soft">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Study Resources
      </span>
      <div className="mt-3 space-y-2">
        <Row label="Available" value={`${total}`} icon={Eye} />
        <Row label="Saved" value={`${bookmarks}`} icon={Bookmark} />
        <Row label="Mode" value="Live" icon={Flame} />
      </div>
      <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs">
        <div className="flex items-center gap-2 font-semibold text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Synced
        </div>
        <div className="mt-1 text-muted-foreground">Updates from admin appear instantly.</div>
      </div>
    </div>
  );
}

function QuickAccess({
  resources,
  setActive,
}: {
  resources: Resource[];
  setActive: (r: Resource) => void;
}) {
  const important = resources.filter((r) => r.resource_type === "important").slice(0, 3);
  const pyq = resources.filter((r) => r.resource_type === "pyq").slice(0, 3);
  const recent = [...resources]
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
    .slice(0, 3);
  const groups = [
    { l: "Important Sets", items: important, Icon: Star },
    { l: "Previous Year", items: pyq, Icon: Clock },
    { l: "Recent Uploads", items: recent, Icon: Flame },
  ];
  return (
    <div className="glass rounded-3xl p-5 shadow-card-soft">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Quick Access
      </span>
      <div className="mt-3 space-y-4">
        {groups.map((g) => (
          <div key={g.l}>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <g.Icon className="h-3 w-3 text-[var(--neon-blue)]" /> {g.l}
            </div>
            <ul className="mt-2 space-y-1.5">
              {g.items.length === 0 && <li className="text-[11px] text-muted-foreground">—</li>}
              {g.items.map((r) => {
                const meta = metaFor(r);
                const I = meta.icon;
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setActive(r)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                    >
                      <I className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
                      <span className="truncate text-foreground/90">{r.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
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
