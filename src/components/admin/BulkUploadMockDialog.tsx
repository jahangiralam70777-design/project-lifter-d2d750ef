import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload,
  FileText,
  Loader2,
  X,
  Save,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Sparkles,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminListLevels,
  adminListSubjects,
  adminListChapters,
  adminListMcqs,
} from "@/lib/admin-mcq.functions";
import { adminBulkImportMock } from "@/lib/admin-mock.functions";
import { parseMcqText, fingerprintQuestion, type ParsedMcq } from "@/lib/mcq-parse";
import { extractTextFromFile } from "@/lib/flash-card-parse";

type Row = ParsedMcq & { _dupe?: boolean };

const SAMPLE = `Q: What is audit?
A. Independent examination of financial statements
B. Preparation of accounts
C. Filing taxes
D. Budget forecasting
Answer: A
Explanation: Audit is the independent examination of financial information.`;

export function BulkUploadMockDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (mockId: string) => void;
}) {
  const qc = useQueryClient();
  const levelsFn = useServerFn(adminListLevels);
  const subjectsFn = useServerFn(adminListSubjects);
  const chaptersFn = useServerFn(adminListChapters);
  const mcqListFn = useServerFn(adminListMcqs);
  const importFn = useServerFn(adminBulkImportMock);

  const [level, setLevel] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState(""); // "" = none, "__all__" = all chapters of subject


  const [title, setTitle] = useState("");
  const [durationMin, setDurationMin] = useState(30);

  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<{ raw: string; reason: string }[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const levelsQ = useQuery({
    queryKey: ["admin-levels"],
    queryFn: () => levelsFn(),
    staleTime: 60_000,
  });
  const subjectsQ = useQuery({
    queryKey: ["admin-subjects"],
    queryFn: () => subjectsFn(),
    staleTime: 60_000,
  });
  const chaptersQ = useQuery({
    queryKey: ["admin-chapters", subjectId],
    queryFn: () => chaptersFn({ data: { subjectId } }),
    enabled: !!subjectId,
  });
  const existingQ = useQuery({
    queryKey: ["bulk-existing-mcqs", chapterId, subjectId],
    queryFn: () =>
      mcqListFn({
        data:
          chapterId === "__all__"
            ? { subjectId, page: 1, pageSize: 500 }
            : { chapterId, page: 1, pageSize: 500 },
      }),
    enabled: chapterId === "__all__" ? !!subjectId : !!chapterId,
  });


  const levels = (levelsQ.data ?? []) as Array<{ code: string; name: string }>;
  const subjects = useMemo(
    () =>
      ((subjectsQ.data ?? []) as Array<{ id: string; name: string; level: string }>).filter(
        (s) => !level || s.level === level,
      ),
    [subjectsQ.data, level],
  );
  const chapters = (chaptersQ.data ?? []) as Array<{ id: string; name: string }>;

  // Recompute dedupe flags whenever rows or existing pool change
  useEffect(() => {
    if (!rows.length) return;
    const existing = new Set(
      ((existingQ.data?.rows ?? []) as Array<{ question: string }>).map((m) =>
        fingerprintQuestion(m.question),
      ),
    );
    const seen = new Set<string>();
    setRows((prev) =>
      prev.map((r) => {
        const fp = fingerprintQuestion(r.question);
        const dupe = existing.has(fp) || seen.has(fp);
        seen.add(fp);
        return { ...r, _dupe: dupe };
      }),
    );
  }, [existingQ.data, rows.length]);

  const parseInput = (text: string, notify = false) => {
    const { cards, invalidBlocks } = parseMcqText(text);
    setRows(cards.map((c) => ({ ...c })));
    setErrors(invalidBlocks);
    if (notify) {
      if (cards.length === 0) toast.error("No MCQs detected. Check the format.");
      else toast.success(`Parsed ${cards.length} MCQ${cards.length > 1 ? "s" : ""}`);
    }
  };

  useEffect(() => {
    if (!rawText.trim()) {
      setRows([]);
      setErrors([]);
      return;
    }
    const timer = window.setTimeout(() => parseInput(rawText), 200);
    return () => window.clearTimeout(timer);
  }, [rawText]);

  const handleParse = (text: string) => {
    parseInput(text, true);
  };

  const onFile = async (file: File) => {
    setParsing(true);
    try {
      const text = await extractTextFromFile(file);
      setRawText(text);
      handleParse(text);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const validRows = useMemo(() => rows.filter((r) => !r._dupe), [rows]);
  const dupeCount = rows.length - validRows.length;

  const importM = useMutation({
    mutationFn: async () => {
      if (!chapterId) throw new Error("Pick a chapter (or All Chapters) first");
      if (chapterId === "__all__" && !subjectId)
        throw new Error("Pick a subject to use All Chapters");
      if (!title.trim()) throw new Error("Give the mock test a title");
      if (!validRows.length) throw new Error("No MCQs to import");

      const BATCH = 100;
      setProgress({ done: 0, total: validRows.length });
      let mockId: string | null = null;
      let done = 0;

      for (let i = 0; i < validRows.length; i += BATCH) {
        const slice = validRows.slice(i, i + BATCH);
        const items = slice.map((r) => ({
          question: r.question,
          question_type: r.question_type,
          option_a: r.option_a,
          option_b: r.option_b,
          option_c: r.question_type === "true_false" ? null : r.option_c,
          option_d: r.question_type === "true_false" ? null : r.option_d,
          correct_option: r.correct_option,
          explanation: r.explanation || null,
          difficulty: "medium" as const,
          status: "published" as const,
          tags: [],
        }));
        const res = await importFn({
          data: {
            chapter_id: chapterId === "__all__" ? null : chapterId,
            title: title.trim(),
            level: (level || "professional") as string,
            subject_id: subjectId || null,
            duration_seconds: Math.max(60, Math.round(durationMin * 60)),
            difficulty: "medium",
            status: "draft",
            is_public: true,
            randomize_questions: true,
            randomize_options: false,
            negative_marking: 0,
            passing_marks: 0,
            items,
            append_to_quiz_id: mockId,
          },
        });
        mockId = res.mock_id;
        done += res.inserted;
        setProgress({ done, total: validRows.length });
      }
      return { mock_id: mockId!, inserted: done };
    },

    onSuccess: (res) => {
      toast.success(`Mock created with ${res.inserted} questions`);
      qc.invalidateQueries({ queryKey: ["admin-mocks"] });
      qc.invalidateQueries({ queryKey: ["admin-mock-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-mcqs"] });
      qc.invalidateQueries({ queryKey: ["quiz-mcq-pool"] });
      qc.invalidateQueries({ queryKey: ["bulk-existing-mcqs"] });
      onImported(res.mock_id);
      onClose();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setProgress(null);
    },
  });


  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl flex max-h-[90vh] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--neon-purple)]" /> Bulk Upload Mock Test
          </DialogTitle>
          <DialogDescription>
            Import a mock test from plain text, PDF, or DOCX. Map to a Level → Subject → Chapter,
            preview, edit, then save. Duplicates are auto-detected against the MCQ bank.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">

        {/* Scope */}
        <div className="grid gap-2 rounded-xl border border-border/60 bg-background/40 p-3 sm:grid-cols-3">
          <Select
            value={level}
            onValueChange={(v) => {
              setLevel(v);
              setSubjectId("");
              setChapterId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              {levels.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={subjectId}
            onValueChange={(v) => {
              setSubjectId(v);
              setChapterId("");
            }}
            disabled={!level}
          >
            <SelectTrigger>
              <SelectValue placeholder={level ? "Subject" : "Pick a level first"} />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={chapterId} onValueChange={setChapterId} disabled={!subjectId}>
            <SelectTrigger>
              <SelectValue placeholder={subjectId ? "Chapter" : "Pick a subject first"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Chapters (subject-wide)</SelectItem>
              {chapters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>

        {/* Mock meta */}
        <div className="grid gap-2 rounded-xl border border-border/60 bg-background/40 p-3 sm:grid-cols-[2fr_1fr]">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Mock Test Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Auditing — Chapter 3 Mock"
              maxLength={200}
            />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" /> Duration (minutes)
            </Label>
            <Input
              type="number"
              min={1}
              max={480}
              value={durationMin}
              onChange={(e) => setDurationMin(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
        </div>

        {/* Source */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Upload className="h-3.5 w-3.5" /> Upload file (.txt, .md, .pdf, .docx)
            </Label>
            <Input
              type="file"
              accept=".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <p className="text-[10px] text-muted-foreground">
              We extract the text and auto-parse MCQ blocks. Legacy .doc isn't supported.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" /> Or paste raw text
            </Label>
            <Textarea
              rows={5}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={SAMPLE}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleParse(rawText)}
                disabled={!rawText.trim()}
              >
                Parse text
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRawText(SAMPLE)}>
                Insert sample
              </Button>
            </div>
          </div>
        </div>

        {parsing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting text from file…
          </div>
        )}

        {/* Summary */}
        {(rows.length > 0 || errors.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-400">
              <CheckCircle2 className="mr-1 h-3 w-3" /> {validRows.length} ready
            </Badge>
            {dupeCount > 0 && (
              <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-400">
                {dupeCount} duplicate{dupeCount > 1 ? "s" : ""} skipped
              </Badge>
            )}
            {errors.length > 0 && (
              <Badge className="border-rose-400/30 bg-rose-400/10 text-rose-400">
                <AlertTriangle className="mr-1 h-3 w-3" /> {errors.length} unparseable block
                {errors.length > 1 ? "s" : ""}
              </Badge>
            )}
            {!chapterId && rows.length > 0 && (
              <span className="text-rose-400">Pick a chapter (or All Chapters) to enable import.</span>
            )}
            {chapterId && !title.trim() && rows.length > 0 && (
              <span className="text-rose-400">Add a title to enable import.</span>
            )}
          </div>
        )}

        {/* Preview */}
        {rows.length > 0 && (
          <div className="rounded-xl border border-border/40">
            {rows.map((r, i) => (
              <div
                key={i}
                className={`border-b border-border/30 p-3 text-xs ${r._dupe ? "bg-amber-400/5" : ""}`}
              >
                <div className="mb-2 flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    #{i + 1}
                  </Badge>
                  {r._dupe && (
                    <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-400 text-[10px]">
                      Duplicate — will be skipped
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 px-2 text-rose-400"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  value={r.question}
                  onChange={(e) => updateRow(i, { question: e.target.value })}
                  className="mb-2 text-xs"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["A", "B", "C", "D"] as const).map((k) => {
                    const key = `option_${k.toLowerCase()}` as keyof ParsedMcq;
                    const isCorrect = r.correct_option === k;
                    return (
                      <div key={k} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateRow(i, { correct_option: k })}
                          className={`h-6 w-6 shrink-0 rounded-full border text-[10px] font-bold ${
                            isCorrect
                              ? "border-emerald-400 bg-emerald-400/20 text-emerald-300"
                              : "border-border/60 bg-background/60 text-muted-foreground"
                          }`}
                          title="Mark as correct"
                        >
                          {k}
                        </button>
                        <Input
                          value={r[key] as string}
                          onChange={(e) => updateRow(i, { [key]: e.target.value } as Partial<Row>)}
                          className="h-8 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
                <Textarea
                  rows={2}
                  value={r.explanation}
                  onChange={(e) => updateRow(i, { explanation: e.target.value })}
                  className="mt-2 text-xs"
                  placeholder="Explanation (optional)"
                />
              </div>
            ))}
          </div>
        )}

        {errors.length > 0 && (
          <details className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-2 text-xs">
            <summary className="cursor-pointer text-rose-300">
              {errors.length} block{errors.length > 1 ? "s" : ""} couldn't be parsed
            </summary>
            <div className="mt-2 space-y-2">
              {errors.slice(0, 10).map((e, i) => (
                <div key={i} className="rounded bg-background/40 p-2">
                  <p className="text-rose-300">{e.reason}</p>
                  <pre className="mt-1 whitespace-pre-wrap text-[10px] text-muted-foreground">
                    {e.raw.slice(0, 240)}
                  </pre>
                </div>
              ))}
            </div>
          </details>
        )}

        {progress && (
          <div className="rounded-xl border border-border/40 bg-background/40 p-2 text-xs">
            <div className="mb-1 flex justify-between">
              <span>Creating mock test…</span>
              <span>
                {progress.done} / {progress.total}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-cta-gradient transition-all"
                style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
          </div>
        )}
        </div>

        <DialogFooter className="shrink-0 px-6 pb-6 pt-2">
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" /> Cancel
          </Button>
          <Button
            className="bg-cta-gradient text-white"
            disabled={!chapterId || !title.trim() || !validRows.length || importM.isPending}
            onClick={() => importM.mutate()}
          >
            {importM.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Create Mock with {validRows.length} Question{validRows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
