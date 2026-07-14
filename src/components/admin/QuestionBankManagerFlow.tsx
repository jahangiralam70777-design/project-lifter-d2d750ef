import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Send,
  EyeOff,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  Eye,
  Flame,
  Edit3,
  Trash2,
  Copy,
  CircleDot,
  CloudUpload,
  Sparkles,
  FileText,
  FileType,
  Database,
  Upload,
  Star,
  Archive,
  FileCheck2,
  NotebookPen,
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
  adminCreateQuestionBank,
  adminDeleteQuestionBank,
  adminDuplicateQuestionBank,
  adminListQuestionBank,
  adminSetQuestionBankHidden,
  adminSetQuestionBankStatus,
  adminSetQuestionBankVisibility,
  adminUpdateQuestionBank,
  getQuestionBankVisibility,
} from "@/lib/admin-question-bank.functions";
import { confirmDialog } from "@/components/ui/confirm-imperative";
import { PageSizeSelect } from "@/components/ui/page-size-select";

type Kind = "text" | "pdf" | "doc";
type ResourceType = "important" | "pyq" | "model" | "notes" | "text";
type Status = "draft" | "published" | "archived";

type QB = {
  id: string;
  title: string;
  summary: string | null;
  level: string;
  subject_id: string | null;
  chapter_id: string | null;
  kind: Kind;
  resource_type: ResourceType;
  body: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  question_count: number;
  tags: string[];
  status: Status;
  is_hidden: boolean;
  scheduled_at: string | null;
  view_count: number;
  download_count: number;
  updated_at: string;
};

type EditState = { open: boolean; row?: QB | null };

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

function kindIcon(k: Kind) {
  if (k === "pdf") return FileText;
  if (k === "doc") return FileType;
  return NotebookPen;
}

const TYPE_LABEL: Record<ResourceType, string> = {
  important: "Important Qns",
  pyq: "Previous Year",
  model: "Model Test",
  notes: "PDF Notes",
  text: "Text Doc",
};

export function QuestionBankManagerFlow() {
  const qc = useQueryClient();

  const treeFn = useServerFn(adminGetAcademicTree);
  const listFn = useServerFn(adminListQuestionBank);

  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("all");
  const [subjectId, setSubjectId] = useState("all");
  const [chapterId, setChapterId] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | ResourceType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status | "hidden">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [editor, setEditor] = useState<EditState>({ open: false });

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
      "qbank-admin",
      { search, level, subjectId, chapterId, kindFilter, typeFilter, statusFilter, page, pageSize },
    ],
    queryFn: () =>
      listFn({
        data: {
          search: search.trim() || undefined,
          level: level === "all" ? undefined : level,
          subjectId: subjectId === "all" ? undefined : subjectId,
          chapterId: chapterId === "all" ? undefined : chapterId,
          kind: kindFilter,
          resourceType: typeFilter,
          status: statusFilter,
          page,
          pageSize,
        },
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["qbank-admin"] });
    qc.invalidateQueries({ queryKey: ["qbank-public"] });
  };

  useEffect(() => {
    const ch = supabase
      .channel(`qbank-live-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_bank_resources" },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const delFn = useServerFn(adminDeleteQuestionBank);
  const dupFn = useServerFn(adminDuplicateQuestionBank);
  const statusFn = useServerFn(adminSetQuestionBankStatus);
  const hideFn = useServerFn(adminSetQuestionBankHidden);

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
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
    mutationFn: (p: { id: string; status: Status }) => statusFn({ data: p }),
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

  const rows: QB[] = (listQuery.data?.rows ?? []) as QB[];
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
                <Database className="mr-1 h-3 w-3" /> Resource Vault
              </Badge>
              <span className="text-xs text-muted-foreground">/ Admin / Question Bank Manager</span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Question Bank <span className="text-gradient">Management Center</span>
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Upload, organise and publish chapter-wise important questions, previous year papers
              and study resources — text, PDF or DOC.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => setEditor({ open: true, row: null })}
              className="bg-cta-gradient rounded-xl text-white shadow-glow hover:opacity-95"
            >
              <Plus className="h-4 w-4" /> Upload Resource
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
              placeholder="Search resources by title or summary…"
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
            icon={<Filter className="h-3 w-3" />}
            label="Type"
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v as typeof typeFilter);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All types" },
              { value: "important", label: "Important Qns" },
              { value: "pyq", label: "Previous Year" },
              { value: "model", label: "Model Test" },
              { value: "notes", label: "PDF Notes" },
              { value: "text", label: "Text Doc" },
            ]}
          />
          <SelectFilter
            icon={<Filter className="h-3 w-3" />}
            label="Format"
            value={kindFilter}
            onValueChange={(v) => {
              setKindFilter(v as typeof kindFilter);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All formats" },
              { value: "text", label: "Text" },
              { value: "pdf", label: "PDF" },
              { value: "doc", label: "DOC/DOCX" },
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
          label="Total Resources"
          value={stats.total}
          icon={Database}
          color="var(--neon-purple)"
        />
        <StatTile
          label="Published & Visible"
          value={stats.published}
          icon={FileCheck2}
          color="#22c55e"
        />
        <StatTile label="Hidden on this page" value={stats.hidden} icon={EyeOff} color="#f59e0b" />
      </div>

      {/* Table */}
      <div className="glass shadow-card-soft overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <h3 className="font-display text-lg font-bold">Resource Library</h3>
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
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="pl-4">Title</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Chapter</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Qns</TableHead>
                <TableHead>Downloads</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const I = kindIcon(r.kind);
                return (
                  <TableRow key={r.id} className="border-white/5 hover:bg-white/[0.03]">
                    <TableCell className="max-w-[280px] truncate pl-4 font-medium">
                      {r.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {subjectName(r.subject_id)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {chapterName(r.chapter_id)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-white/15 text-[10px]">
                        {TYPE_LABEL[r.resource_type] ?? r.resource_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--neon-purple)]/10 px-2 py-0.5 text-[10px] text-[var(--neon-purple)]">
                        <I className="h-3 w-3" /> {r.kind.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{r.question_count}</TableCell>
                    <TableCell className="text-xs">{r.download_count.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${statusTone(r.status, r.is_hidden)} border text-[10px]`}
                      >
                        {r.is_hidden ? "Hidden" : r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end gap-0.5">
                        <RowBtn title="Edit" onClick={() => setEditor({ open: true, row: r })}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </RowBtn>
                        {r.file_url && (
                          <RowBtn
                            title="Open file"
                            onClick={() => window.open(r.file_url!, "_blank")}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </RowBtn>
                        )}
                        <RowBtn title="Duplicate" onClick={() => duplicate.mutate(r.id)}>
                          <Copy className="h-3.5 w-3.5" />
                        </RowBtn>
                        <RowBtn
                          title={r.status === "published" ? "Unpublish" : "Publish"}
                          onClick={() =>
                            setStatus.mutate({
                              id: r.id,
                              status: r.status === "published" ? "draft" : "published",
                            })
                          }
                        >
                          <Send
                            className={`h-3.5 w-3.5 ${r.status === "published" ? "text-emerald-400" : ""}`}
                          />
                        </RowBtn>
                        <RowBtn
                          title={r.is_hidden ? "Unhide" : "Hide from students"}
                          onClick={() => setHidden.mutate({ id: r.id, is_hidden: !r.is_hidden })}
                        >
                          {r.is_hidden ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </RowBtn>
                        <RowBtn
                          title="Delete"
                          onClick={() => {
                            void (async () => { if (await confirmDialog({ title: `Delete "${r.title}"?`, variant: "destructive", confirmLabel: "Delete" })) remove.mutate(r.id); })();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </RowBtn>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!listQuery.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <Sparkles className="mx-auto mb-2 h-5 w-5" />
                    No resources match your filters. Upload your first resource.
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
  const createFn = useServerFn(adminCreateQuestionBank);
  const updateFn = useServerFn(adminUpdateQuestionBank);
  const isEdit = !!state.row;

  const [form, setForm] = useState<Partial<QB>>({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!state.open) return;
    setForm(
      state.row
        ? { ...state.row }
        : {
            title: "",
            summary: "",
            level: "professional",
            kind: "text",
            resource_type: "important",
            body: "",
            file_url: null,
            file_name: null,
            file_size_bytes: null,
            question_count: 0,
            tags: [],
            status: "draft",
            is_hidden: false,
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

  const set = <K extends keyof QB>(k: K, v: QB[K] | null) =>
    setForm((f) => ({ ...f, [k]: v as never }));

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const detectedKind: Kind =
        ext === "pdf" ? "pdf" : ext === "doc" || ext === "docx" ? "doc" : "text";
      const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("question-bank").upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("question-bank").getPublicUrl(path);
      setForm((f) => ({
        ...f,
        kind: detectedKind,
        file_url: pub.publicUrl,
        file_name: file.name,
        file_size_bytes: file.size,
      }));
      toast.success("File uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title?.trim()) throw new Error("Title is required");
      if (form.kind !== "text" && !form.file_url)
        throw new Error("Upload a file for PDF/DOC resources");
      if (form.kind === "text" && !form.body?.trim())
        throw new Error("Body is required for text resources");
      const payload = {
        title: form.title!,
        summary: form.summary || null,
        level: form.level ?? "professional",
        subject_id: form.subject_id ?? null,
        chapter_id: form.chapter_id ?? null,
        kind: form.kind ?? "text",
        resource_type: (form.resource_type ?? "important") as ResourceType,
        body: form.body || null,
        file_url: form.file_url || null,
        file_name: form.file_name || null,
        file_size_bytes: form.file_size_bytes ?? null,
        question_count: form.question_count ?? 0,
        tags: form.tags ?? [],
        status: (form.status ?? "draft") as Status,
        is_hidden: form.is_hidden ?? false,
        scheduled_at: form.scheduled_at ?? null,
      };
      if (isEdit && state.row) return updateFn({ data: { id: state.row.id, ...payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Resource updated" : "Resource created");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Resource" : "Upload Resource"}</DialogTitle>
          <DialogDescription>
            Resources sync to all students instantly once published.
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
          <Field label="Resource Type">
            <Select
              value={form.resource_type ?? "important"}
              onValueChange={(v) => set("resource_type", v as ResourceType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="important">
                  <Star className="mr-2 inline h-3 w-3" /> Important Questions
                </SelectItem>
                <SelectItem value="pyq">
                  <Archive className="mr-2 inline h-3 w-3" /> Previous Year
                </SelectItem>
                <SelectItem value="model">
                  <FileCheck2 className="mr-2 inline h-3 w-3" /> Model Test
                </SelectItem>
                <SelectItem value="notes">
                  <FileText className="mr-2 inline h-3 w-3" /> PDF Notes
                </SelectItem>
                <SelectItem value="text">
                  <NotebookPen className="mr-2 inline h-3 w-3" /> Text Doc
                </SelectItem>
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
            placeholder="ICAB Professional — Taxation Important Qns 2025"
          />
        </Field>
        <Field label="Summary">
          <Input
            value={form.summary ?? ""}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="One-line summary shown to students"
          />
        </Field>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Format">
            <Select value={form.kind ?? "text"} onValueChange={(v) => set("kind", v as Kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text MCQs / Rich Content</SelectItem>
                <SelectItem value="pdf">PDF Upload</SelectItem>
                <SelectItem value="doc">DOC / DOCX Upload</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Question count">
            <Input
              type="number"
              min={0}
              value={form.question_count ?? 0}
              onChange={(e) =>
                set("question_count", Math.max(0, parseInt(e.target.value || "0")) as never)
              }
            />
          </Field>
        </div>

        {form.kind === "text" ? (
          <Field label="Body / MCQ content *">
            <Textarea
              rows={10}
              value={form.body ?? ""}
              onChange={(e) => set("body", e.target.value)}
              placeholder={"Q1. State Newton's Second Law…\nAns: …"}
              className="font-mono text-xs"
            />
          </Field>
        ) : (
          <Field label={`Upload ${form.kind === "pdf" ? "PDF" : "DOC/DOCX"} *`}>
            <div className="rounded-xl border border-dashed border-white/15 bg-background/40 p-4">
              <input
                ref={fileRef}
                type="file"
                accept={
                  form.kind === "pdf"
                    ? "application/pdf,.pdf"
                    : ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                }
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
              {form.file_url ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{form.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {form.file_size_bytes ? `${(form.file_size_bytes / 1024).toFixed(1)} KB` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      onClick={() => window.open(form.file_url!, "_blank")}
                    >
                      <Eye className="h-3 w-3" /> Preview
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                    >
                      <Upload className="h-3 w-3" /> Replace
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full flex-col items-center gap-2 py-6 text-xs text-muted-foreground hover:text-foreground"
                >
                  <CloudUpload className="h-6 w-6 text-[var(--neon-purple)]" />
                  {uploading
                    ? "Uploading…"
                    : `Click to upload ${form.kind === "pdf" ? "PDF" : "DOC/DOCX"}`}
                </button>
              )}
            </div>
          </Field>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Status">
            <Select
              value={form.status ?? "draft"}
              onValueChange={(v) => set("status", v as Status)}
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
              placeholder="hsc, mechanics, 2025"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || uploading}>
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const getFn = useServerFn(getQuestionBankVisibility);
  const setFn = useServerFn(adminSetQuestionBankVisibility);

  const vq = useQuery({
    queryKey: ["qbank-visibility"],
    queryFn: () => getFn(),
    staleTime: 30_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`qbv-live-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_bank_visibility" },
        () => {
          qc.invalidateQueries({ queryKey: ["qbank-visibility"] });
          qc.invalidateQueries({ queryKey: ["qbank-public"] });
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
      qc.invalidateQueries({ queryKey: ["qbank-visibility"] });
      qc.invalidateQueries({ queryKey: ["qbank-public"] });
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
            Hide the entire Question Bank, or hide by level / subject / chapter — applies live to
            all students, homepage, dashboard and recommendations.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs">
          <span className="font-medium">Hide entire section</span>
          <Switch checked={section} onCheckedChange={setSection} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
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
          <CheckCircle2 className="mr-2 h-4 w-4" />
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
    <div className="rounded-2xl border border-white/10 bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">{title}</span>
        <Badge variant="outline" className="border-white/10 bg-background/40 text-[10px]">
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
              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                on
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-white/10 bg-background/40 hover:bg-white/5"
              }`}
            >
              <span className="min-w-0 flex-1 whitespace-normal break-words">{it.name}</span>
              {on ? <EyeOff className="h-3 w-3 shrink-0" /> : <Eye className="h-3 w-3 shrink-0 opacity-50" />}
            </button>

          );
        })}
      </div>
    </div>
  );
}
