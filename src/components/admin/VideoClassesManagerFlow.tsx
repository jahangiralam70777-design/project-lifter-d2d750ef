import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  Send,
  EyeOff,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  Eye,
  Edit3,
  Trash2,
  Copy,
  CircleDot,
  Sparkles,
  Youtube,
  ListVideo,
  Video,
  PlayCircle,
  Clock,
  Flame,
  Link2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { adminGetAcademicTree } from "@/lib/admin-academic.functions";
import {
  adminBulkImportVideoClasses,
  adminCreateVideoClass,
  adminDeleteVideoClass,
  adminDuplicateVideoClass,
  adminListVideoClasses,
  adminSetVideoClassHidden,
  adminSetVideoClassStatus,
  adminSetVideoClassVisibility,
  adminUpdateVideoClass,
  getVideoClassVisibility,
  parseYouTube,
} from "@/lib/admin-video-classes.functions";
import { confirmDialog } from "@/components/ui/confirm-imperative";
import { PageSizeSelect } from "@/components/ui/page-size-select";

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
  youtube_playlist_id: string | null;
  thumbnail_url: string | null;
  duration_seconds: number;
  playlist_key: string | null;
  position: number;
  tags: string[];
  status: "draft" | "published" | "archived";
  is_hidden: boolean;
  is_featured: boolean;
  scheduled_at: string | null;
  view_count: number;
  updated_at: string;
};

type EditState = { open: boolean; item?: VideoClass | null };
type BulkState = { open: boolean };

function statusTone(s: string, hidden: boolean) {
  if (hidden) return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  switch (s) {
    case "published":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "draft":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "archived":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    default:
      return "bg-muted text-foreground";
  }
}

function fmtDuration(s: number) {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export function VideoClassesManagerFlow() {
  const qc = useQueryClient();

  const treeFn = useServerFn(adminGetAcademicTree);
  const listFn = useServerFn(adminListVideoClasses);

  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [subjectId, setSubjectId] = useState<string>("all");
  const [chapterId, setChapterId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "draft" | "published" | "archived" | "hidden"
  >("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [editor, setEditor] = useState<EditState>({ open: false });
  const [bulk, setBulk] = useState<BulkState>({ open: false });

  const tree = useQuery({
    queryKey: ["admin-academic-tree"],
    queryFn: () => treeFn(),
    staleTime: 60_000,
  });

  const levels = (tree.data?.levels ?? []) as { code: string; name: string }[];
  const allSubjects = (tree.data?.subjects ?? []) as { id: string; name: string; level: string }[];
  const allChapters = (tree.data?.chapters ?? []) as {
    id: string;
    name: string;
    subject_id: string;
  }[];

  const subjects = useMemo(
    () => (level === "all" ? allSubjects : allSubjects.filter((s) => s.level === level)),
    [allSubjects, level],
  );
  const chapters = useMemo(
    () =>
      subjectId === "all" ? allChapters : allChapters.filter((c) => c.subject_id === subjectId),
    [allChapters, subjectId],
  );

  useEffect(() => {
    setSubjectId("all");
    setChapterId("all");
    setPage(1);
  }, [level]);
  useEffect(() => {
    setChapterId("all");
    setPage(1);
  }, [subjectId]);

  const listQuery = useQuery({
    queryKey: [
      "video-classes",
      { search, level, subjectId, chapterId, statusFilter, page, pageSize },
    ],
    queryFn: () =>
      listFn({
        data: {
          search: search.trim() || undefined,
          level: level === "all" ? undefined : level,
          subjectId: subjectId === "all" ? undefined : subjectId,
          chapterId: chapterId === "all" ? undefined : chapterId,
          status: statusFilter,
          page,
          pageSize,
        },
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["video-classes"] });
    qc.invalidateQueries({ queryKey: ["public-video-classes"] });
  };

  useEffect(() => {
    const ch = supabase
      .channel(`video-classes-live-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "video_classes" }, invalidate)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const delFn = useServerFn(adminDeleteVideoClass);
  const dupFn = useServerFn(adminDuplicateVideoClass);
  const statusFn = useServerFn(adminSetVideoClassStatus);
  const hideFn = useServerFn(adminSetVideoClassHidden);

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Class deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Duplicated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: (p: { id: string; status: "draft" | "published" | "archived" }) =>
      statusFn({ data: p }),
    onSuccess: (_d, p) => {
      toast.success(`Marked ${p.status}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setHidden = useMutation({
    mutationFn: (p: { id: string; is_hidden: boolean }) => hideFn({ data: p }),
    onSuccess: (_d, p) => {
      toast.success(p.is_hidden ? "Hidden from students" : "Visible again");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows: VideoClass[] = (listQuery.data?.rows ?? []) as VideoClass[];
  const total = listQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const subjectName = (id: string | null) => allSubjects.find((s) => s.id === id)?.name ?? "—";
  const chapterName = (id: string | null) => allChapters.find((c) => c.id === id)?.name ?? "—";

  const stats = useMemo(() => {
    const published = rows.filter((r) => r.status === "published" && !r.is_hidden).length;
    const hidden = rows.filter((r) => r.is_hidden).length;
    return { total, published, hidden };
  }, [rows, total]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--neon-purple)]/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-[var(--neon-blue)]/25 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge className="bg-cta-gradient border-0 text-white shadow-glow">
                <Video className="mr-1 h-3 w-3" /> Video Classes
              </Badge>
              <span className="text-xs text-muted-foreground">/ Admin / Classes Manager</span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Video Classes <span className="text-gradient">Management Center</span>
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Add YouTube classes, organize playlists chapter-wise, and publish to all students
              instantly.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setBulk({ open: true })}
              variant="outline"
              className="rounded-xl border-white/15"
            >
              <ListVideo className="h-4 w-4" /> Bulk Playlist
            </Button>
            <Button
              type="button"
              onClick={() => setEditor({ open: true, item: null })}
              className="bg-cta-gradient rounded-xl text-white shadow-glow hover:opacity-95"
            >
              <Plus className="h-4 w-4" /> Add Class
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass shadow-card-soft rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by title or instructor…"
              className="h-9 rounded-xl border-white/10 bg-background/60 pl-9"
            />
          </div>
          <SelectFilter
            icon={<Filter className="h-3 w-3" />}
            label="Level"
            value={level}
            onValueChange={setLevel}
            options={[
              { value: "all", label: "All levels" },
              ...levels.map((l) => ({ value: l.code, label: l.name })),
            ]}
          />
          <SelectFilter
            icon={<Filter className="h-3 w-3" />}
            label="Subject"
            value={subjectId}
            onValueChange={setSubjectId}
            options={[
              { value: "all", label: "All subjects" },
              ...subjects.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <SelectFilter
            icon={<Filter className="h-3 w-3" />}
            label="Chapter"
            value={chapterId}
            onValueChange={setChapterId}
            options={[
              { value: "all", label: "All chapters" },
              ...chapters.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <SelectFilter
            icon={<ArrowUpDown className="h-3 w-3" />}
            label="Status"
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as typeof statusFilter);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "published", label: "Published" },
              { value: "draft", label: "Draft" },
              { value: "archived", label: "Archived" },
              { value: "hidden", label: "Hidden" },
            ]}
          />
        </div>
      </div>

      <VisibilityPanel levels={levels} subjects={allSubjects} chapters={allChapters} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          label="Total Classes"
          value={stats.total}
          icon={Video}
          color="var(--neon-purple)"
        />
        <StatTile
          label="Published & Visible"
          value={stats.published}
          icon={CheckCircle2}
          color="#22c55e"
        />
        <StatTile
          label="Hidden in current page"
          value={stats.hidden}
          icon={EyeOff}
          color="#f59e0b"
        />
      </div>

      {/* Table */}
      <div className="glass shadow-card-soft overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <h3 className="font-display text-lg font-bold">All Video Classes</h3>
            <p className="text-xs text-muted-foreground">
              {listQuery.isLoading ? "Loading…" : `Showing ${rows.length} of ${total}`} — live sync
              enabled
            </p>
          </div>
          <Badge variant="outline" className="border-white/10 bg-background/40">
            <CircleDot className="mr-1 h-2.5 w-2.5 animate-pulse text-emerald-400" /> Live
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="pl-4">Class</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Chapter</TableHead>
                <TableHead>Instructor</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((n) => (
                <TableRow key={n.id} className="border-white/5 hover:bg-white/[0.03]">
                  <TableCell className="max-w-[320px] pl-4">
                    <div className="flex items-center gap-2.5">
                      <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-[var(--neon-purple)]/40 to-[var(--neon-blue)]/40 ring-1 ring-white/10">
                        {n.thumbnail_url ? (
                          <img
                            src={n.thumbnail_url}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover opacity-80"
                          />
                        ) : null}
                        <PlayCircle className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {n.kind === "playlist" ? "Playlist" : "Single video"} ·{" "}
                          {n.playlist_key ?? "no playlist"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {subjectName(n.subject_id)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {chapterName(n.chapter_id)}
                  </TableCell>
                  <TableCell className="text-xs">{n.instructor || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {fmtDuration(n.duration_seconds)}
                  </TableCell>
                  <TableCell>{n.view_count.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`${statusTone(n.status, n.is_hidden)} border text-[10px]`}
                    >
                      {n.is_hidden ? "Hidden" : n.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(n.updated_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-0.5">
                      <RowBtn title="Edit" onClick={() => setEditor({ open: true, item: n })}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </RowBtn>
                      {n.youtube_url && (
                        <RowBtn
                          title="Open YouTube"
                          onClick={() => window.open(n.youtube_url!, "_blank")}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </RowBtn>
                      )}
                      <RowBtn title="Duplicate" onClick={() => duplicate.mutate(n.id)}>
                        <Copy className="h-3.5 w-3.5" />
                      </RowBtn>
                      <RowBtn
                        title={n.status === "published" ? "Unpublish" : "Publish"}
                        onClick={() =>
                          setStatus.mutate({
                            id: n.id,
                            status: n.status === "published" ? "draft" : "published",
                          })
                        }
                      >
                        <Send
                          className={`h-3.5 w-3.5 ${n.status === "published" ? "text-emerald-400" : ""}`}
                        />
                      </RowBtn>
                      <RowBtn
                        title={n.is_hidden ? "Unhide" : "Hide from students"}
                        onClick={() => setHidden.mutate({ id: n.id, is_hidden: !n.is_hidden })}
                      >
                        {n.is_hidden ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" />
                        )}
                      </RowBtn>
                      <RowBtn
                        title="Delete"
                        onClick={() => {
                          void (async () => {
                            if (
                              await confirmDialog({
                                title: `Delete class "${n.title}"?`,
                                variant: "destructive",
                                confirmLabel: "Delete",
                              })
                            )
                              remove.mutate(n.id);
                          })();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </RowBtn>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!listQuery.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <Sparkles className="mx-auto mb-2 h-5 w-5" />
                    No classes match your filters. Add your first class.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-3">
            <PageSizeSelect
              value={pageSize}
              onChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-lg border-white/10"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-lg border-white/10"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      <EditorDialog
        state={editor}
        onClose={() => setEditor({ open: false })}
        onSaved={invalidate}
        levels={levels}
        allSubjects={allSubjects}
        allChapters={allChapters}
      />
      <BulkDialog
        state={bulk}
        onClose={() => setBulk({ open: false })}
        onSaved={invalidate}
        levels={levels}
        allSubjects={allSubjects}
        allChapters={allChapters}
      />
    </div>
  );
}

// ===============================================
function StatTile({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-4">
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-30 blur-2xl"
        style={{ background: color }}
      />
      <div className="flex items-center justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10"
          style={{ background: `color-mix(in oklab, ${color} 15%, transparent)` }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <Flame className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-bold tracking-tight">{value.toLocaleString()}</p>
    </div>
  );
}

function RowBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
    >
      {children}
    </button>
  );
}

function SelectFilter({
  icon,
  label,
  value,
  onValueChange,
  options,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-background/50 px-2 py-1 text-xs">
      {icon}
      <span className="text-muted-foreground">{label}:</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-7 w-[140px] border-0 bg-transparent px-1 text-xs focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

// ===============================================
// Editor
// ===============================================
function EditorDialog({
  state,
  onClose,
  onSaved,
  levels,
  allSubjects,
  allChapters,
}: {
  state: EditState;
  onClose: () => void;
  onSaved: () => void;
  levels: { code: string; name: string }[];
  allSubjects: { id: string; name: string; level: string }[];
  allChapters: { id: string; name: string; subject_id: string }[];
}) {
  const createFn = useServerFn(adminCreateVideoClass);
  const updateFn = useServerFn(adminUpdateVideoClass);
  const isEdit = !!state.item;

  const [form, setForm] = useState<Partial<VideoClass>>({});

  useEffect(() => {
    if (!state.open) return;
    setForm(
      state.item
        ? { ...state.item }
        : {
            title: "",
            description: "",
            level: "professional",
            kind: "youtube",
            youtube_url: "",
            thumbnail_url: null,
            instructor: "",
            duration_seconds: 0,
            playlist_key: null,
            position: 0,
            tags: [],
            status: "draft",
            is_hidden: false,
            is_featured: false,
            subject_id: null,
            chapter_id: null,
          },
    );
  }, [state]);

  const subjectsForLevel = useMemo(
    () => (form.level ? allSubjects.filter((s) => s.level === form.level) : allSubjects),
    [allSubjects, form.level],
  );
  const chaptersForSubject = useMemo(
    () => (form.subject_id ? allChapters.filter((c) => c.subject_id === form.subject_id) : []),
    [allChapters, form.subject_id],
  );

  const set = <K extends keyof VideoClass>(k: K, v: VideoClass[K] | null) =>
    setForm((f) => ({ ...f, [k]: v as never }));

  // Auto-derive thumb when YouTube URL changes
  const parsed = useMemo(
    () => (form.youtube_url ? parseYouTube(form.youtube_url) : null),
    [form.youtube_url],
  );
  const effectiveThumb = form.thumbnail_url || parsed?.thumb || null;

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title?.trim()) throw new Error("Title is required");
      if (!form.youtube_url?.trim()) throw new Error("YouTube URL is required");
      const payload = {
        title: form.title!,
        description: form.description || null,
        level: form.level ?? "professional",
        subject_id: form.subject_id ?? null,
        chapter_id: form.chapter_id ?? null,
        instructor: form.instructor || null,
        kind: (form.kind ?? "youtube") as "youtube" | "playlist" | "upload",
        youtube_url: form.youtube_url || null,
        thumbnail_url: form.thumbnail_url || null,
        duration_seconds: Number(form.duration_seconds ?? 0),
        playlist_key: form.playlist_key || null,
        position: Number(form.position ?? 0),
        tags: form.tags ?? [],
        status: form.status ?? "draft",
        is_hidden: form.is_hidden ?? false,
        is_featured: form.is_featured ?? false,
        scheduled_at: form.scheduled_at ?? null,
      };
      if (isEdit && state.item) return updateFn({ data: { id: state.item.id, ...payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Class updated" : "Class created");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Video Class" : "Add Video Class"}</DialogTitle>
          <DialogDescription>
            Classes sync to all students instantly once published.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Level">
            <Select
              value={form.level ?? "professional"}
              onValueChange={(v) => {
                set("level", v);
                set("subject_id", null);
                set("chapter_id", null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Type">
            <Select
              value={form.kind ?? "youtube"}
              onValueChange={(v) => set("kind", v as VideoClass["kind"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">Single YouTube Video</SelectItem>
                <SelectItem value="playlist">YouTube Playlist Entry</SelectItem>
                <SelectItem value="upload">Hosted Upload</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Subject">
            <Select
              value={form.subject_id ?? ""}
              onValueChange={(v) => {
                set("subject_id", v);
                set("chapter_id", null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {subjectsForLevel.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Chapter">
            <Select
              value={form.chapter_id ?? ""}
              onValueChange={(v) => set("chapter_id", v)}
              disabled={!form.subject_id}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={form.subject_id ? "Select chapter" : "Pick subject first"}
                />
              </SelectTrigger>
              <SelectContent>
                {chaptersForSubject.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Title *">
          <Input
            value={form.title ?? ""}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Newton's Laws — Full Walkthrough"
          />
        </Field>

        <Field label="YouTube URL *">
          <div className="relative">
            <Youtube className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rose-400" />
            <Input
              value={form.youtube_url ?? ""}
              onChange={(e) => set("youtube_url", e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="pl-9"
            />
          </div>
          {parsed?.videoId && (
            <p className="mt-1 text-[11px] text-emerald-400">
              <CheckCircle2 className="mr-1 inline h-3 w-3" />
              Detected video ID <span className="font-mono">{parsed.videoId}</span>
              {parsed.playlistId && (
                <>
                  {" "}
                  · playlist <span className="font-mono">{parsed.playlistId}</span>
                </>
              )}
            </p>
          )}
        </Field>

        {effectiveThumb && (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <img src={effectiveThumb} alt="" className="aspect-video w-full object-cover" />
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Instructor">
            <Input
              value={form.instructor ?? ""}
              onChange={(e) => set("instructor", e.target.value)}
              placeholder="Tahmid Hasan"
            />
          </Field>
          <Field label="Duration (seconds)">
            <Input
              type="number"
              min={0}
              value={form.duration_seconds ?? 0}
              onChange={(e) => set("duration_seconds", Number(e.target.value || 0))}
              placeholder="2880"
            />
          </Field>
          <Field label="Playlist key">
            <Input
              value={form.playlist_key ?? ""}
              onChange={(e) => set("playlist_key", e.target.value || null)}
              placeholder="mechanics-hsc"
            />
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            rows={4}
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            placeholder="A complete walkthrough of Newton's three laws with worked HSC board examples."
          />
        </Field>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Status">
            <Select
              value={form.status ?? "draft"}
              onValueChange={(v) => set("status", v as VideoClass["status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs">
            <span>Hide from students</span>
            <Switch checked={!!form.is_hidden} onCheckedChange={(v) => set("is_hidden", v)} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs">
            <span>Featured</span>
            <Switch checked={!!form.is_featured} onCheckedChange={(v) => set("is_featured", v)} />
          </div>
        </div>

        <Field label="Tags (comma-separated)">
          <Input
            value={(form.tags ?? []).join(", ")}
            onChange={(e) =>
              set(
                "tags",
                e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean) as never,
              )
            }
            placeholder="hsc, mechanics, board"
          />
        </Field>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===============================================
// Bulk Playlist Importer
// ===============================================
function BulkDialog({
  state,
  onClose,
  onSaved,
  levels,
  allSubjects,
  allChapters,
}: {
  state: BulkState;
  onClose: () => void;
  onSaved: () => void;
  levels: { code: string; name: string }[];
  allSubjects: { id: string; name: string; level: string }[];
  allChapters: { id: string; name: string; subject_id: string }[];
}) {
  const bulkFn = useServerFn(adminBulkImportVideoClasses);
  const [playlistKey, setPlaylistKey] = useState("");
  const [level, setLevel] = useState("professional");
  const [subjectId, setSubjectId] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");
  const [urlsText, setUrlsText] = useState("");

  useEffect(() => {
    if (!state.open) return;
    setPlaylistKey("");
    setLevel("professional");
    setSubjectId("");
    setChapterId("");
    setUrlsText("");
  }, [state.open]);

  const subjectsForLevel = allSubjects.filter((s) => s.level === level);
  const chaptersForSubject = allChapters.filter((c) => c.subject_id === subjectId);

  const submit = useMutation({
    mutationFn: () => {
      const urls = urlsText
        .split(/\s+/)
        .map((u) => u.trim())
        .filter(Boolean);
      if (!playlistKey.trim()) throw new Error("Playlist key required");
      if (urls.length === 0) throw new Error("Paste at least one YouTube URL");
      return bulkFn({
        data: {
          playlist_key: playlistKey.trim(),
          level,
          subject_id: subjectId || null,
          chapter_id: chapterId || null,
          status: "draft",
          urls,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Imported ${r.inserted} classes`);
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Playlist Import</DialogTitle>
          <DialogDescription>
            Paste one YouTube URL per line. All classes are created as drafts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Playlist key *">
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={playlistKey}
                onChange={(e) => setPlaylistKey(e.target.value)}
                placeholder="mechanics-hsc"
                className="pl-9"
              />
            </div>
          </Field>
          <Field label="Level">
            <Select
              value={level}
              onValueChange={(v) => {
                setLevel(v);
                setSubjectId("");
                setChapterId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Subject">
            <Select
              value={subjectId}
              onValueChange={(v) => {
                setSubjectId(v);
                setChapterId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {subjectsForLevel.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Chapter">
            <Select value={chapterId} onValueChange={setChapterId} disabled={!subjectId}>
              <SelectTrigger>
                <SelectValue placeholder={subjectId ? "Select chapter" : "Pick subject first"} />
              </SelectTrigger>
              <SelectContent>
                {chaptersForSubject.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="YouTube URLs (one per line) *">
          <Textarea
            rows={10}
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            placeholder={"https://youtube.com/watch?v=...\nhttps://youtu.be/..."}
            className="font-mono text-xs"
          />
        </Field>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? "Importing…" : "Import as drafts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===============================================
// Visibility
// ===============================================
function VisibilityPanel({
  levels,
  subjects,
  chapters,
}: {
  levels: { code: string; name: string }[];
  subjects: { id: string; name: string; level: string }[];
  chapters: { id: string; name: string; subject_id: string }[];
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getVideoClassVisibility);
  const setFn = useServerFn(adminSetVideoClassVisibility);

  const vq = useQuery({
    queryKey: ["video-class-visibility"],
    queryFn: () => getFn(),
    staleTime: 30_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`vcv-live-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "video_class_visibility" },
        () => {
          qc.invalidateQueries({ queryKey: ["video-class-visibility"] });
          qc.invalidateQueries({ queryKey: ["public-video-classes"] });
          qc.invalidateQueries({ queryKey: ["module-visibility"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const [section, setSection] = useState(false);
  const [hLevels, setHLevels] = useState<string[]>([]);
  const [hSubjects, setHSubjects] = useState<string[]>([]);
  const [hChapters, setHChapters] = useState<string[]>([]);

  useEffect(() => {
    if (!vq.data) return;
    setSection(vq.data.section_hidden);
    setHLevels(vq.data.hidden_levels ?? []);
    setHSubjects(vq.data.hidden_subject_ids ?? []);
    setHChapters(vq.data.hidden_chapter_ids ?? []);
  }, [vq.data]);

  const save = useMutation({
    mutationFn: () =>
      setFn({
        data: {
          section_hidden: section,
          hidden_levels: hLevels,
          hidden_subject_ids: hSubjects,
          hidden_chapter_ids: hChapters,
        },
      }),
    onSuccess: () => {
      toast.success("Visibility updated — students sync instantly");
      qc.invalidateQueries({ queryKey: ["video-class-visibility"] });
      qc.invalidateQueries({ queryKey: ["public-video-classes"] });
      qc.invalidateQueries({ queryKey: ["module-visibility"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (arr: string[], v: string, set: (n: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="glass shadow-card-soft rounded-3xl p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold flex items-center gap-2">
            <EyeOff className="h-4 w-4" /> Section Visibility
          </h3>
          <p className="text-xs text-muted-foreground">
            Hide the entire Video Classes section, or hide by level / subject / chapter — applies
            live to all students.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs">
          <span className="font-medium">Hide entire section</span>
          <Switch checked={section} onCheckedChange={setSection} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <VisGroup
          title="Hidden levels"
          empty="No levels"
          items={levels.map((l) => ({ id: l.code, name: l.name }))}
          selected={hLevels}
          onToggle={(v) => toggle(hLevels, v, setHLevels)}
        />
        <VisGroup
          title="Hidden subjects"
          empty="No subjects"
          items={subjects.map((s) => ({ id: s.id, name: s.name }))}
          selected={hSubjects}
          onToggle={(v) => toggle(hSubjects, v, setHSubjects)}
        />
        <VisGroup
          title="Hidden chapters"
          empty="No chapters"
          items={chapters.map((c) => ({ id: c.id, name: c.name }))}
          selected={hChapters}
          onToggle={(v) => toggle(hChapters, v, setHChapters)}
        />
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="bg-cta-gradient text-white shadow-glow"
        >
          <Clock className="hidden" />
          {save.isPending ? "Saving…" : "Save visibility"}
        </Button>
      </div>
    </div>
  );
}

function VisGroup({
  title,
  empty,
  items,
  selected,
  onToggle,
}: {
  title: string;
  empty: string;
  items: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">{title}</span>
        <Badge variant="outline" className="shrink-0 border-white/10 bg-background/40 text-[10px]">
          {selected.length} hidden
        </Badge>
      </div>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {items.length === 0 && <p className="text-[11px] text-muted-foreground">{empty}</p>}
        {items.map((it) => {
          const on = selected.includes(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition lg:flex lg:items-center lg:justify-between ${
                on
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-white/10 bg-background/40 hover:bg-white/5"
              }`}
            >
              <span className="min-w-0 whitespace-normal break-words leading-snug lg:truncate">
                {it.name}
              </span>
              {on ? (
                <EyeOff className="mt-0.5 h-3 w-3 shrink-0 lg:mt-0" />
              ) : (
                <Eye className="mt-0.5 h-3 w-3 shrink-0 opacity-50 lg:mt-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
