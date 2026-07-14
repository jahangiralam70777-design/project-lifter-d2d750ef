// Exam Batch — bulk MCQ upload. Ported from the site's BulkUploadMcqsDialog
// and wired ONLY to exam_batch_* server functions. Never touches public.mcqs.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  adminListExamBatchLevels,
  adminListExamBatchSubjects,
  adminListExamBatchChapters,
} from "@/lib/exam-batch/admin-academic.functions";
import {
  adminBulkImportExamBatchMcqs,
  adminListExamBatchMcqs,
} from "@/lib/exam-batch/admin-mcqs.functions";
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

export function ExamBatchBulkUploadMcqsDialog({
  onClose,
  onImported,
  initialLevel,
  initialSubjectId,
  initialChapterId,
  lockScope,
}: {
  onClose: () => void;
  onImported?: () => void;
  initialLevel?: string;
  initialSubjectId?: string;
  initialChapterId?: string;
  /** When true, hide the level/subject/chapter selectors (attached-to-exam flow). */
  lockScope?: boolean;
}) {
  const qc = useQueryClient();

  const [level, setLevel] = useState(initialLevel ?? "");
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? "");
  const [chapterId, setChapterId] = useState(initialChapterId ?? "");

  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<
    { raw: string; reason: string; sourceIndex: number }[]
  >([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<{
    total: number;
    success: number;
    failed: Array<{ sourceIndex: number; reason: string }>;
  } | null>(null);

  const levelsQ = useQuery({
    queryKey: ["exam-batch", "admin", "levels"],
    queryFn: () => adminListExamBatchLevels(),
    staleTime: 60_000,
  });
  const subjectsQ = useQuery({
    queryKey: ["exam-batch", "admin", "subjects", { level: level || null }],
    queryFn: () => adminListExamBatchSubjects({ data: { level: level || null } }),
    enabled: !!level,
  });
  const chaptersQ = useQuery({
    queryKey: ["exam-batch", "admin", "chapters", { subjectId }],
    queryFn: () => adminListExamBatchChapters({ data: { subjectId } }),
    enabled: !!subjectId,
  });
  const existingQ = useQuery({
    queryKey: ["exam-batch", "admin", "mcqs-all-for-dedupe", chapterId],
    queryFn: async () => {
      const pageSize = 500;
      const first = await adminListExamBatchMcqs({
        data: { chapterId, page: 1, pageSize },
      });
      const all = [...(first.rows ?? [])];
      const count = first.count ?? all.length;
      for (let page = 2; all.length < count; page += 1) {
        const next = await adminListExamBatchMcqs({
          data: { chapterId, page, pageSize },
        });
        if (!next.rows?.length) break;
        all.push(...next.rows);
      }
      return { rows: all, count };
    },
    enabled: !!chapterId,
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

  const rowFingerprintSignature = useMemo(
    () => rows.map((r) => fingerprintQuestion(r)).join("\n"),
    [rows],
  );
  useEffect(() => {
    if (!rows.length) return;
    const existing = new Set(
      (
        (existingQ.data?.rows ?? []) as Array<{
          question: string;
          option_a?: string | null;
          option_b?: string | null;
          option_c?: string | null;
          option_d?: string | null;
        }>
      ).map((m) => fingerprintQuestion(m)),
    );
    const seen = new Set<string>();
    setRows((prev) =>
      prev.map((r) => {
        const fp = fingerprintQuestion(r);
        const dupe = !!fp && (existing.has(fp) || seen.has(fp));
        if (fp) seen.add(fp);
        return { ...r, _dupe: dupe };
      }),
    );
  }, [existingQ.data, rowFingerprintSignature, rows.length]);

  const handleParse = (text: string) => {
    const { cards, invalidBlocks } = parseMcqText(text);
    setRows(cards.map((c) => ({ ...c })));
    setErrors(invalidBlocks);
    setSummary(null);
    if (cards.length === 0) toast.error("No MCQs detected. Check the format.");
    else toast.success(`Parsed ${cards.length} MCQ${cards.length > 1 ? "s" : ""}`);
  };

  const onFile = async (file: File) => {
    setParsing(true);
    try {
      const text = await extractTextFromFile(file);
      setRawText(text);
      handleParse(text);
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
      if (!chapterId) throw new Error("Pick a chapter first");
      if (!validRows.length) throw new Error("No MCQs to import");
      const BATCH = 100;
      setProgress({ done: 0, total: validRows.length });
      let done = 0;
      const serverFailed: Array<{ sourceIndex: number; reason: string }> = [];
      for (let i = 0; i < validRows.length; i += BATCH) {
        const slice = validRows.slice(i, i + BATCH);
        const res = await adminBulkImportExamBatchMcqs({
          data: {
            chapter_id: chapterId,
            items: slice.map((r) => ({
              question: r.question,
              question_type: r.question_type,
              option_a: r.option_a,
              option_b: r.option_b,
              option_c: r.question_type === "true_false" ? null : r.option_c,
              option_d: r.question_type === "true_false" ? null : r.option_d,
              correct_option: r.correct_option,
              explanation: r.explanation || null,
              difficulty: (r.difficulty ?? "medium") as "easy" | "medium" | "hard",
              status: "published" as const,
              tags: [],
              sourceIndex: r.sourceIndex,
            })),
          },
        });
        serverFailed.push(...(res.failed ?? []));
        done += res.inserted ?? slice.length;
        setProgress({ done, total: validRows.length });
      }
      return { inserted: done, serverFailed };
    },
    onSuccess: ({ inserted, serverFailed }) => {
      const failed: Array<{ sourceIndex: number; reason: string }> = [
        ...errors.map((e) => ({
          sourceIndex: e.sourceIndex,
          reason: e.reason || "Invalid question",
        })),
        ...rows
          .filter((r) => r._dupe)
          .map((r) => ({
            sourceIndex: r.sourceIndex ?? 0,
            reason: "Duplicate Question",
          })),
        ...serverFailed,
      ].sort((a, b) => a.sourceIndex - b.sourceIndex);
      const total = inserted + failed.length;
      setSummary({ total, success: inserted, failed });
      toast.success(`Imported ${inserted} MCQs · ${failed.length} skipped`);
      void qc.invalidateQueries({ queryKey: ["exam-batch"] });
      onImported?.();
      if (!failed.length) {
        setTimeout(onClose, 800);
      }
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
            <Sparkles className="h-4 w-4" /> Bulk Upload MCQs
          </DialogTitle>
          <DialogDescription>
            Import into the Exam Batch question bank. Duplicates are auto-detected per chapter.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 pb-3">
          {!lockScope && (
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
                  {chapters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
                  if (f) void onFile(f);
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
                  Sample
                </Button>
              </div>
            </div>
          </div>

          {parsing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting text from file…
            </div>
          )}

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
                <span className="text-rose-400">Pick a chapter to enable import.</span>
              )}
            </div>
          )}

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
                            value={(r[key] as string | null) ?? ""}
                            onChange={(e) =>
                              updateRow(i, { [key]: e.target.value } as Partial<Row>)
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <Textarea
                    rows={2}
                    value={r.explanation ?? ""}
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
                    <p className="text-rose-300">
                      <span className="font-semibold">Original Serial #{e.sourceIndex}</span> ·{" "}
                      {e.reason}
                    </p>
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
                <span>Importing…</span>
                <span>
                  {progress.done} / {progress.total}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {summary && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
              <div className="mb-2 font-semibold text-emerald-300">Import Summary</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded bg-background/40 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Total</div>
                  <div className="text-base font-bold">{summary.total}</div>
                </div>
                <div className="rounded bg-background/40 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Imported</div>
                  <div className="text-base font-bold text-emerald-300">{summary.success}</div>
                </div>
                <div className="rounded bg-background/40 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Failed</div>
                  <div className="text-base font-bold text-rose-300">{summary.failed.length}</div>
                </div>
              </div>
              {summary.failed.length > 0 && (
                <div className="mt-3 space-y-1">
                  {summary.failed.map((f, i) => (
                    <div
                      key={`${f.sourceIndex}-${i}`}
                      className="flex items-start gap-2 rounded bg-background/40 px-2 py-1"
                    >
                      <span className="font-mono text-muted-foreground">
                        #{f.sourceIndex || "?"}
                      </span>
                      <span className="text-rose-300">{f.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 px-6 pb-6 pt-2">
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" /> Cancel
          </Button>
          <Button
            disabled={!chapterId || !validRows.length || importM.isPending}
            onClick={() => importM.mutate()}
          >
            {importM.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Import {validRows.length} MCQ{validRows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}