import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  PlayCircle,
  Clock,
  Search,
  Loader2,
  EyeOff,
  Video,
  ExternalLink,
  Bookmark,
  Share2,
} from "lucide-react";
import { listPublicVideoClasses } from "@/lib/admin-video-classes.functions";

type VideoClass = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  subject_id: string | null;
  chapter_id: string | null;
  instructor: string | null;
  kind: "youtube" | "playlist" | "upload";
  youtube_url: string | null;
  youtube_video_id: string | null;
  thumbnail_url: string | null;
  duration_seconds: number;
  playlist_key: string | null;
  position: number;
  tags: string[];
  view_count: number;
  updated_at: string;
};

type Step = 0 | 1 | 2 | 3;

function fmtDuration(s: number) {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export function VideoClassesFlow() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPublicVideoClasses);

  const [step, setStep] = useState<Step>(0);
  const [level, setLevel] = useState<string>("");
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [chapter, setChapter] = useState<{ id: string; name: string } | null>(null);
  const [active, setActive] = useState<VideoClass | null>(null);
  const [search, setSearch] = useState("");

  // Academic tree (publicly readable)
  const tree = useQuery({
    queryKey: ["student-academic-tree"],
    queryFn: async () => {
      const [lvl, subj, chap] = await Promise.all([
        supabase.from("levels").select("code,name").eq("status", "published").order("sort_order"),
        supabase
          .from("subjects")
          .select("id,name,level")
          .eq("status", "published")
          .order("sort_order"),
        supabase
          .from("chapters")
          .select("id,name,subject_id")
          .eq("status", "published")
          .order("sort_order"),
      ]);
      return {
        levels: (lvl.data ?? []) as { code: string; name: string }[],
        subjects: (subj.data ?? []) as { id: string; name: string; level: string }[],
        chapters: (chap.data ?? []) as { id: string; name: string; subject_id: string }[],
      };
    },
    staleTime: 60_000,
  });

  const allLevels = tree.data?.levels ?? [];
  const allSubjects = tree.data?.subjects ?? [];
  const allChapters = tree.data?.chapters ?? [];

  const subjects = useMemo(
    () => allSubjects.filter((s) => s.level === level),
    [allSubjects, level],
  );
  const chapters = useMemo(
    () => (subject ? allChapters.filter((c) => c.subject_id === subject.id) : []),
    [allChapters, subject],
  );

  const classesQuery = useQuery({
    queryKey: ["public-video-classes", { level, subjectId: subject?.id, chapterId: chapter?.id }],
    queryFn: () =>
      listFn({
        data: {
          level: level || undefined,
          subjectId: subject?.id,
          chapterId: chapter?.id,
        },
      }),
    enabled: step >= 2,
  });

  // Realtime — invalidate on any change
  useEffect(() => {
    const ch = supabase
      .channel(`video-classes-student-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "video_classes" }, () => {
        qc.invalidateQueries({ queryKey: ["public-video-classes"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "video_class_visibility" },
        () => {
          qc.invalidateQueries({ queryKey: ["public-video-classes"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const classes: VideoClass[] = (classesQuery.data?.rows ?? []) as VideoClass[];
  const sectionHidden = classesQuery.data?.hidden === true;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.instructor ?? "").toLowerCase().includes(q) ||
        (c.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [classes, search]);

  // Set first available as active when entering watch step
  useEffect(() => {
    if (
      step === 3 &&
      filtered.length > 0 &&
      (!active || !filtered.find((c) => c.id === active.id))
    ) {
      setActive(filtered[0]);
    }
  }, [step, filtered, active]);

  if (sectionHidden) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="glass rounded-3xl p-10 text-center shadow-card-soft">
          <EyeOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="font-display text-xl font-bold">
            Video Classes are currently unavailable
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Please check back later — your admin has temporarily hidden this section.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />
      <Stepper
        step={step}
        level={level}
        subject={subject?.name ?? ""}
        chapter={chapter?.name ?? ""}
        setStep={setStep}
      />

      {/* Step 0 — Level */}
      {step === 0 && (
        <Grid>
          {allLevels.length === 0 && <EmptyMsg label="No levels available yet" />}
          {allLevels.map((l, i) => (
            <SelectCard
              key={l.code}
              title={l.name}
              desc="Browse classes for this level"
              delay={i * 70}
              onClick={() => {
                setLevel(l.code);
                setSubject(null);
                setChapter(null);
                setStep(1);
              }}
            />
          ))}
        </Grid>
      )}

      {/* Step 1 — Subject */}
      {step === 1 && (
        <Grid cols={3}>
          {subjects.length === 0 && <EmptyMsg label="No subjects in this level yet" />}
          {subjects.map((s, i) => (
            <SelectCard
              key={s.id}
              title={s.name}
              desc="Tap to view chapters"
              delay={i * 60}
              onClick={() => {
                setSubject({ id: s.id, name: s.name });
                setChapter(null);
                setStep(2);
              }}
            />
          ))}
        </Grid>
      )}

      {/* Step 2 — Chapters with class counts */}
      {step === 2 && (
        <div className="space-y-3">
          {classesQuery.isLoading && <LoadingMsg />}
          {chapters.length === 0 && !classesQuery.isLoading && <EmptyMsg label="No chapters yet" />}
          {chapters.map((ch, i) => {
            const count = classes.filter((c) => c.chapter_id === ch.id).length;
            return (
              <button
                key={ch.id}
                onClick={() => {
                  setChapter({ id: ch.id, name: ch.name });
                  setStep(3);
                }}
                className="glass animate-fade-in flex w-full items-center justify-between gap-3 rounded-3xl p-5 text-left shadow-card-soft transition hover:-translate-y-0.5"
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: "both" }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cta-gradient text-white shadow-glow">
                    <PlayCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-base font-bold">{ch.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} class{count === 1 ? "" : "es"}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}

      {/* Step 3 — Watch */}
      {step === 3 && (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search classes in this chapter…"
                className="glass h-11 w-full rounded-2xl border border-white/10 bg-background/60 pl-10 pr-4 text-sm"
              />
            </div>

            {classesQuery.isLoading && <LoadingMsg />}
            {!classesQuery.isLoading && filtered.length === 0 && (
              <EmptyMsg label="No classes published for this chapter yet" />
            )}

            {active && <Player active={active} />}
          </div>

          <aside className="space-y-4">
            <div className="glass rounded-3xl p-4 shadow-card-soft">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-sm font-bold">Playlist · {chapter?.name}</p>
                <button
                  onClick={() => setStep(2)}
                  className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {filtered.map((c, i) => {
                  const isActive = active?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActive(c)}
                      className={`flex w-full items-center gap-2 rounded-xl p-2 text-left transition ${
                        isActive ? "bg-cta-gradient text-white shadow-glow" : "hover:bg-white/5"
                      }`}
                    >
                      <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-[var(--neon-purple)]/40 to-[var(--neon-blue)]/40">
                        {c.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.thumbnail_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                        <PlayCircle className="absolute inset-0 m-auto h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {i + 1}. {c.title}
                        </p>
                        <p
                          className={`truncate text-[10px] ${isActive ? "text-white/80" : "text-muted-foreground"}`}
                        >
                          <Clock className="mr-1 inline h-3 w-3" />
                          {fmtDuration(c.duration_seconds)}
                          {c.instructor ? ` · ${c.instructor}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ------------------------- bits ------------------------- */

function Header() {
  return (
    <div className="glass rounded-3xl p-6 shadow-card-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
            <PlayCircle className="h-3.5 w-3.5 text-[var(--neon-purple)]" /> Smart Video Classes
          </div>
          <h1 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Smart <span className="text-gradient">Video Classes</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chapter-wise premium video lessons, live from your admin.
          </p>
        </div>
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
    { i: 0 as Step, l: "Level", v: level || "—" },
    { i: 1 as Step, l: "Subject", v: subject || "—" },
    { i: 2 as Step, l: "Chapter", v: chapter || "—" },
    { i: 3 as Step, l: "Watch", v: chapter ? "Live" : "—" },
  ];
  return (
    <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3 shadow-card-soft">
      {items.map((it, idx) => {
        const active = step === it.i;
        const done = step > it.i;
        return (
          <div key={it.l} className="flex items-center gap-2">
            <button
              onClick={() => (done || active) && setStep(it.i)}
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

function SelectCard({
  title,
  desc,
  onClick,
  delay,
}: {
  title: string;
  desc: string;
  onClick: () => void;
  delay: number;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative animate-fade-in text-left"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] opacity-0 blur transition-opacity duration-300 group-hover:opacity-60" />
      <div className="glass relative h-full overflow-hidden rounded-3xl p-6 shadow-card-soft transition-transform duration-300 group-hover:-translate-y-1">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cta-gradient text-white shadow-glow">
          <Video className="h-6 w-6" />
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

function EmptyMsg({ label }: { label: string }) {
  return (
    <div className="glass rounded-3xl p-10 text-center shadow-card-soft">
      <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function LoadingMsg() {
  return (
    <div className="glass flex items-center justify-center gap-2 rounded-3xl p-10 shadow-card-soft text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading classes…
    </div>
  );
}

function Player({ active }: { active: VideoClass }) {
  const embedSrc = active.youtube_video_id
    ? `https://www.youtube.com/embed/${active.youtube_video_id}?rel=0&modestbranding=1`
    : null;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] opacity-40 blur-md" />
      <div className="glass relative overflow-hidden rounded-3xl shadow-card-soft">
        <div className="relative aspect-video w-full overflow-hidden rounded-t-3xl bg-zinc-950">
          {embedSrc ? (
            <iframe
              key={active.id}
              src={embedSrc}
              title={active.title}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No playable video URL for this class.
            </div>
          )}
        </div>
        <div className="p-5">
          <h2 className="font-display text-xl font-bold">{active.title}</h2>
          <p className="text-xs text-muted-foreground">
            {active.instructor || "—"} · {fmtDuration(active.duration_seconds)}
          </p>
          {active.description && (
            <p className="mt-3 text-sm text-muted-foreground">{active.description}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {active.youtube_url && (
              <a
                href={active.youtube_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-background/50 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                <ExternalLink className="h-3 w-3" /> Open on YouTube
              </a>
            )}
            <button className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-background/50 px-3 py-1.5 text-xs hover:bg-white/5">
              <Bookmark className="h-3 w-3" /> Save
            </button>
            <button
              onClick={() => {
                if (navigator.share && active.youtube_url)
                  navigator.share({ title: active.title, url: active.youtube_url }).catch(() => {});
                else if (active.youtube_url) navigator.clipboard.writeText(active.youtube_url);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-background/50 px-3 py-1.5 text-xs hover:bg-white/5"
            >
              <Share2 className="h-3 w-3" /> Share
            </button>
            {(active.tags ?? []).slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                #{t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
