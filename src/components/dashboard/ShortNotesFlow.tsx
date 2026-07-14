import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listPublicShortNotes } from "@/lib/admin-short-notes.functions";
import {
  EyeOff,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  FileText,
  Search,
  Download,
  File as FileIcon,
  BookOpen,
  Bookmark,
  ExternalLink,
  NotebookPen,
  Maximize2,
  Loader2,
} from "lucide-react";

type Step = 0 | 1 | 2 | 3;
type Note = {
  id: string;
  title: string;
  summary: string | null;
  level: string;
  subject_id: string | null;
  chapter_id: string | null;
  kind: "text" | "pdf" | "doc";
  body: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  tags: string[];
  updated_at: string;
};

type LevelRow = { code: string; name: string };
type SubjectRow = { id: string; name: string; level: string };
type ChapterRow = { id: string; name: string; subject_id: string };

export function ShortNotesFlow() {
  const qc = useQueryClient();
  const publicFn = useServerFn(listPublicShortNotes);

  const [step, setStep] = useState<Step>(0);
  const [level, setLevel] = useState<LevelRow | null>(null);
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [chapter, setChapter] = useState<ChapterRow | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [search, setSearch] = useState("");

  // section visibility check
  const visQuery = useQuery({
    queryKey: ["public-short-notes", "section"],
    queryFn: () => publicFn({ data: {} }),
    staleTime: 30_000,
  });

  // academic tree (RLS allows authenticated reads of published rows)
  const tree = useQuery({
    queryKey: ["sn-academic-tree"],
    queryFn: async () => {
      const [{ data: lv }, { data: sj }, { data: ch }] = await Promise.all([
        supabase
          .from("levels")
          .select("code,name,sort_order")
          .eq("status", "published")
          .order("sort_order"),
        supabase
          .from("subjects")
          .select("id,name,level,sort_order")
          .eq("status", "published")
          .order("sort_order"),
        supabase
          .from("chapters")
          .select("id,name,subject_id,sort_order")
          .eq("status", "published")
          .order("sort_order"),
      ]);
      return {
        levels: (lv ?? []) as LevelRow[],
        subjects: (sj ?? []) as SubjectRow[],
        chapters: (ch ?? []) as ChapterRow[],
      };
    },
    staleTime: 60_000,
  });

  // notes for picked chapter / subject / level
  const notesQuery = useQuery({
    enabled: !!level,
    queryKey: ["public-short-notes", "list", level?.code, subject?.id ?? null, chapter?.id ?? null],
    queryFn: () =>
      publicFn({
        data: {
          level: level?.code,
          subjectId: subject?.id,
          chapterId: chapter?.id,
          limit: 100,
        },
      }),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`snv-student-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "short_notes_visibility" },
        () => {
          qc.invalidateQueries({ queryKey: ["public-short-notes"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "short_notes" }, () => {
        qc.invalidateQueries({ queryKey: ["public-short-notes"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const levels = tree.data?.levels ?? [];
  const subjectsForLevel = useMemo(
    () => (tree.data?.subjects ?? []).filter((s) => !level || s.level === level.code),
    [tree.data, level],
  );
  const chaptersForSubject = useMemo(
    () => (tree.data?.chapters ?? []).filter((c) => !subject || c.subject_id === subject.id),
    [tree.data, subject],
  );

  const allNotes = useMemo(
    () => (notesQuery.data && "rows" in notesQuery.data ? notesQuery.data.rows : []) as Note[],
    [notesQuery.data],
  );
  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allNotes;
    return allNotes.filter((n) =>
      [n.title, n.summary ?? "", n.body ?? "", ...(n.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [allNotes, search]);

  if (visQuery.data?.hidden) {
    return (
      <div className="glass shadow-card-soft flex flex-col items-center justify-center gap-3 rounded-3xl p-12 text-center">
        <EyeOff className="h-10 w-10 text-muted-foreground" />
        <h2 className="font-display text-2xl font-bold">Short Notes are temporarily unavailable</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          The Short Notes section is currently hidden by your administrator. Please check back soon.
        </p>
      </div>
    );
  }

  const goto = (s: Step) => {
    setStep(s);
    if (s < 3) setActiveNote(null);
    if (s < 2) setChapter(null);
    if (s < 1) setSubject(null);
  };

  return (
    <div className="space-y-6">
      <Header />
      <Stepper
        step={step}
        level={level?.name ?? ""}
        subject={subject?.name ?? ""}
        chapter={chapter?.name ?? ""}
        setStep={goto}
      />

      {step === 0 && (
        <Grid>
          {tree.isLoading && <Empty>Loading levels…</Empty>}
          {!tree.isLoading && levels.length === 0 && <Empty>No levels published yet.</Empty>}
          {levels.map((l, i) => (
            <SelectCard
              key={l.code}
              title={l.name}
              desc="Browse notes by subject"
              delay={i * 60}
              onClick={() => {
                setLevel(l);
                setStep(1);
              }}
            />
          ))}
        </Grid>
      )}

      {step === 1 && (
        <Grid>
          {subjectsForLevel.length === 0 && <Empty>No subjects under {level?.name}.</Empty>}
          {subjectsForLevel.map((s, i) => (
            <SelectCard
              key={s.id}
              title={s.name}
              desc="View chapter-wise notes"
              delay={i * 50}
              onClick={() => {
                setSubject(s);
                setStep(2);
              }}
            />
          ))}
        </Grid>
      )}

      {step === 2 && (
        <Grid>
          {chaptersForSubject.length === 0 && <Empty>No chapters under {subject?.name}.</Empty>}
          {chaptersForSubject.map((c, i) => (
            <SelectCard
              key={c.id}
              title={c.name}
              desc="Open available notes"
              delay={i * 40}
              onClick={() => {
                setChapter(c);
                setStep(3);
              }}
            />
          ))}
        </Grid>
      )}

      {step === 3 && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* notes list */}
          <div className="glass shadow-card-soft rounded-3xl p-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes…"
                className="w-full rounded-xl border border-border/60 bg-muted/30 py-2 pl-9 pr-3 text-sm focus:border-[var(--neon-purple)]/50 focus:outline-none"
              />
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {chapter?.name ?? subject?.name ?? "All notes"}
            </div>
            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {notesQuery.isLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading notes…
                </div>
              )}
              {!notesQuery.isLoading && filteredNotes.length === 0 && (
                <Empty>No notes available for this selection yet.</Empty>
              )}
              {filteredNotes.map((n) => {
                const active = activeNote?.id === n.id;
                const Icon =
                  n.kind === "pdf" ? FileText : n.kind === "doc" ? FileIcon : NotebookPen;
                return (
                  <button
                    key={n.id}
                    onClick={() => setActiveNote(n)}
                    className={`group flex w-full items-start gap-2 rounded-xl border p-3 text-left text-xs transition ${
                      active
                        ? "border-[var(--neon-purple)]/50 bg-[var(--neon-purple)]/10"
                        : "border-border/40 bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cta-gradient text-white shadow-glow">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-foreground">{n.title}</div>
                      {n.summary && (
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {n.summary}
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="rounded-full bg-muted/60 px-1.5 py-0.5 uppercase">
                          {n.kind}
                        </span>
                        <span>{new Date(n.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* reader */}
          <div>
            {activeNote ? (
              <NoteReader note={activeNote} />
            ) : (
              <div className="glass flex h-full min-h-[400px] flex-col items-center justify-center gap-2 rounded-3xl p-10 text-center shadow-card-soft">
                <BookOpen className="h-8 w-8 text-[var(--neon-purple)]" />
                <p className="font-display text-lg font-bold">Select a note to start reading</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  PDFs open in an embedded viewer, DOC/DOCX render via document viewer, and text
                  notes show inline.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- pieces ---------- */

function Header() {
  return (
    <div className="glass rounded-3xl p-6 shadow-card-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
            <FileText className="h-3.5 w-3.5 text-[var(--neon-purple)]" /> Smart Short Notes
          </div>
          <h1 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Smart <span className="text-gradient">Short Notes</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quick chapter-wise notes for fast revision — PDF, DOC and rich text in one reader.
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
    { i: 3 as Step, l: "Read", v: chapter ? "Browsing" : "—" },
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

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass col-span-full flex items-center justify-center gap-2 rounded-2xl p-6 text-xs text-muted-foreground shadow-card-soft">
      <Sparkles className="h-4 w-4" /> {children}
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
          <BookOpen className="h-6 w-6" />
        </div>
        <h3 className="font-display mt-4 text-lg font-bold tracking-tight">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
        <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-gradient">
          Open <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  );
}

/* ---------- reader ---------- */

function NoteReader({ note }: { note: Note }) {
  const [bookmarked, setBookmarked] = useState(false);

  const openFullscreen = () => {
    if (note.file_url) window.open(note.file_url, "_blank");
  };

  return (
    <div className="glass shadow-card-soft rounded-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 p-4">
        <div className="min-w-0">
          <h2 className="font-display truncate text-lg font-bold">{note.title}</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            <span className="uppercase">{note.kind}</span> · Updated{" "}
            {new Date(note.updated_at).toLocaleDateString()}
            {note.file_name ? ` · ${note.file_name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setBookmarked((b) => !b)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              bookmarked
                ? "border-amber-400/40 bg-amber-400/15 text-amber-400"
                : "border-border/60 bg-muted/40 text-foreground/80 hover:bg-muted"
            }`}
          >
            <Bookmark className={`h-3.5 w-3.5 ${bookmarked ? "fill-amber-400" : ""}`} /> Save
          </button>
          {note.file_url && (
            <>
              <button
                onClick={openFullscreen}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs hover:bg-muted"
                title="Fullscreen"
                aria-label="Open in fullscreen"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <a
                href={note.file_url}
                download={note.file_name ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-cta-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-glow"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </>
          )}
        </div>
      </div>

      <div className="p-4">
        {note.kind === "pdf" && note.file_url && (
          <iframe
            src={`${note.file_url}#toolbar=1&view=FitH`}
            title={note.title}
            className="h-[640px] w-full rounded-2xl border border-border/40 bg-white"
          />
        )}

        {note.kind === "doc" && note.file_url && (
          <div className="space-y-3">
            <iframe
              src={`https://docs.google.com/gview?url=${encodeURIComponent(note.file_url)}&embedded=true`}
              title={note.title}
              className="h-[640px] w-full rounded-2xl border border-border/40 bg-white"
            />
            <p className="text-[11px] text-muted-foreground">
              If the preview does not load, use the Download or{" "}
              <a
                href={note.file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[var(--neon-blue)] underline"
              >
                Open in new tab <ExternalLink className="h-3 w-3" />
              </a>
              .
            </p>
          </div>
        )}

        {note.kind === "text" && (
          <article className="prose prose-invert max-h-[640px] max-w-none overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border/40 bg-muted/20 p-6 text-[15px] leading-relaxed text-foreground/90">
            {note.body || (note.summary ?? "This note has no content yet.")}
          </article>
        )}

        {note.kind !== "text" && !note.file_url && <Empty>This note has no file attached.</Empty>}

        {note.tags && note.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {note.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// keep import referenced to satisfy bundler if needed
