import { useMemo, useState } from "react";
import { sanitizeOptionText } from "@/lib/sanitize-option";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Loader2, Search, Trash2, BookOpen, ChevronDown } from "lucide-react";

import { listBookmarkedMcqs, toggleMcqBookmark } from "@/lib/mcq-review.functions";
import { listSubjects, listChapters } from "@/lib/learning.functions";
import { useLevels } from "@/hooks/use-levels";

export function BookmarksFlow() {
  const [level, setLevel] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const qc = useQueryClient();
  const listFn = useServerFn(listBookmarkedMcqs);
  const toggleFn = useServerFn(toggleMcqBookmark);
  const subjectsFn = useServerFn(listSubjects);
  const chaptersFn = useServerFn(listChapters);

  const subjectsQ = useQuery({
    queryKey: ["subjects", level],
    queryFn: () => subjectsFn({ data: { level: level ?? undefined } }),
  });
  const { data: levelsList = [] } = useLevels();

  const chaptersQ = useQuery({
    queryKey: ["chapters", subjectId],
    queryFn: () => chaptersFn({ data: { subjectId: subjectId! } }),
    enabled: !!subjectId,
  });
  const bookmarksQ = useQuery({
    queryKey: ["mcq-bookmarks", { level, subjectId, chapterId }],
    queryFn: () =>
      listFn({
        data: {
          level: level ?? undefined,
          subjectId: subjectId ?? undefined,
          chapterId: chapterId ?? undefined,
        },
      }),
  });

  const items = useMemo(() => {
    const list = (bookmarksQ.data ?? []).filter((b) => !!b.mcq);
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((b) => b.mcq!.question.toLowerCase().includes(q));
  }, [bookmarksQ.data, query]);

  async function removeBookmark(mcqId: string) {
    try {
      await toggleFn({ data: { mcqId, bookmarked: false } });
      qc.invalidateQueries({ queryKey: ["mcq-bookmarks"] });
      qc.invalidateQueries({ queryKey: ["my-bookmark-ids"] });
      qc.invalidateQueries({ queryKey: ["mcq-review-counts"] });
    } catch {
      /* silent */
    }
  }

  return (
    <div className="space-y-5">
      <div className="glass shadow-card-soft rounded-3xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="bg-cta-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow">
              <Bookmark className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-bold break-words">Bookmarks</h2>
              <p className="text-xs text-muted-foreground break-words">
                MCQs you saved during practice — revisit them anytime.
              </p>
            </div>
          </div>
          <div className="glass flex w-full items-center gap-2 rounded-xl px-3 py-2 sm:ml-auto sm:w-auto">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions…"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground sm:w-44"
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <select
            value={level ?? ""}
            onChange={(e) => {
              setLevel(e.target.value || null);
              setSubjectId(null);
              setChapterId(null);
            }}
            className="glass w-full rounded-xl px-3 py-2 text-xs sm:w-auto"
          >
            <option value="">All levels</option>
            {levelsList.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            value={subjectId ?? ""}
            onChange={(e) => {
              setSubjectId(e.target.value || null);
              setChapterId(null);
            }}
            className="glass w-full rounded-xl px-3 py-2 text-xs sm:w-auto"
          >
            <option value="">All subjects</option>
            {(subjectsQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={chapterId ?? ""}
            onChange={(e) => setChapterId(e.target.value || null)}
            disabled={!subjectId}
            className="glass w-full rounded-xl px-3 py-2 text-xs disabled:opacity-50 sm:w-auto"
          >
            <option value="">All chapters</option>
            {(chaptersQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>


      <div className="glass shadow-card-soft rounded-3xl p-5">
        {bookmarksQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading bookmarks…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/30 p-10 text-center text-sm text-muted-foreground">
            <BookOpen className="mx-auto mb-2 h-5 w-5" />
            No bookmarks yet. Tap the bookmark icon on any MCQ during practice.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((b) => {
              const m = b.mcq!;
              const open = openId === m.id;
              const opts = [
                { k: "A", t: sanitizeOptionText(m.option_a) },
                { k: "B", t: sanitizeOptionText(m.option_b) },
                { k: "C", t: sanitizeOptionText(m.option_c) },
                { k: "D", t: sanitizeOptionText(m.option_d) },
              ].filter((o) => o.t && o.t.length > 0);
              return (
                <li key={m.id} className="rounded-2xl border border-border bg-card/40 p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{sanitizeOptionText(m.question)}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                        Saved {new Date(b.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => setOpenId(open ? null : m.id)}
                      className="glass rounded-lg px-2 py-1 text-xs"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                    <button
                      onClick={() => removeBookmark(m.id)}
                      className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/20"
                      title="Remove bookmark"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {open && (
                    <div className="animate-fade-up mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {opts.map((o) => {
                        const isCorrect = m.correct_option === o.k;
                        return (
                          <div
                            key={o.k}
                            className={`rounded-xl border p-3 text-sm ${
                              isCorrect
                                ? "border-emerald-400/60 bg-emerald-400/10"
                                : "border-border bg-background/40"
                            }`}
                          >
                            <span className="mr-2 font-display font-bold">{o.k}.</span>
                            {o.t}
                            {isCorrect && (
                              <span className="ml-2 text-[10px] font-bold text-emerald-400">
                                CORRECT
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {m.explanation && (
                        <div className="rounded-xl border border-dashed border-border bg-background/30 p-3 text-xs text-muted-foreground sm:col-span-2">
                          <b className="text-foreground">Explanation: </b>
                          {m.explanation}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
