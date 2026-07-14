import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adminListExamBatchLevels,
  adminListExamBatchSubjects,
  adminListExamBatchChapters,
  adminUpsertExamBatchLevel,
  adminUpsertExamBatchSubject,
  adminUpsertExamBatchChapter,
  adminDeleteExamBatchLevel,
  adminDeleteExamBatchSubject,
  adminDeleteExamBatchChapter,
} from "@/lib/exam-batch/admin-academic.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/exam-batch/kit";
import { Trash2, Plus } from "lucide-react";

function toSlug(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function ExamBatchAcademicManager() {
  const qc = useQueryClient();
  const [levelCode, setLevelCode] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");

  const levelsQ = useQuery({
    queryKey: ["exam-batch", "admin", "academic", "levels"],
    queryFn: () => adminListExamBatchLevels(),
  });
  const subjectsQ = useQuery({
    queryKey: ["exam-batch", "admin", "academic", "subjects", levelCode],
    queryFn: () => adminListExamBatchSubjects({ data: { level: levelCode || null } }),
    enabled: !!levelCode,
  });
  const chaptersQ = useQuery({
    queryKey: ["exam-batch", "admin", "academic", "chapters", subjectId],
    queryFn: () => adminListExamBatchChapters({ data: { subjectId } }),
    enabled: !!subjectId,
  });

  const invalidateAll = () =>
    qc.invalidateQueries({ queryKey: ["exam-batch"] });

  const addLevel = useMutation({
    mutationFn: (v: { code: string; name: string }) =>
      adminUpsertExamBatchLevel({
        data: { code: v.code, name: v.name, sort_order: 0, status: "published" },
      }),
    onSuccess: () => {
      toast.success("Level saved");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delLevel = useMutation({
    mutationFn: (code: string) => adminDeleteExamBatchLevel({ data: { code } }),
    onSuccess: () => {
      toast.success("Level deleted");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addSubject = useMutation({
    mutationFn: (v: { name: string }) =>
      adminUpsertExamBatchSubject({
        data: {
          name: v.name,
          slug: toSlug(v.name),
          level: levelCode,
          sort_order: 0,
          status: "published",
        },
      }),
    onSuccess: () => {
      toast.success("Subject saved");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delSubject = useMutation({
    mutationFn: (id: string) => adminDeleteExamBatchSubject({ data: { id } }),
    onSuccess: () => {
      toast.success("Subject deleted");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addChapter = useMutation({
    mutationFn: (v: { name: string }) =>
      adminUpsertExamBatchChapter({
        data: {
          subject_id: subjectId,
          name: v.name,
          slug: toSlug(v.name),
          sort_order: 0,
          status: "published",
        },
      }),
    onSuccess: () => {
      toast.success("Chapter saved");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delChapter = useMutation({
    mutationFn: (id: string) => adminDeleteExamBatchChapter({ data: { id } }),
    onSuccess: () => {
      toast.success("Chapter deleted");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newLevelCode, setNewLevelCode] = useState("");
  const [newLevelName, setNewLevelName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newChapter, setNewChapter] = useState("");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SectionCard title="Levels" description="Exam Batch levels — independent from the site Academic Manager.">
        <ul className="space-y-2">
          {(levelsQ.data ?? []).map((l: any) => (
            <li
              key={l.code}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                levelCode === l.code ? "bg-muted" : ""
              }`}
            >
              <button
                type="button"
                className="text-left flex-1"
                onClick={() => {
                  setLevelCode(l.code);
                  setSubjectId("");
                }}
              >
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">{l.code}</div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`Delete level "${l.name}"?`)) delLevel.mutate(l.code);
                }}
                aria-label="Delete level"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-2">
          <Label>Add new level</Label>
          <Input placeholder="Code (e.g. professional)" value={newLevelCode} onChange={(e) => setNewLevelCode(e.target.value)} />
          <Input placeholder="Name" value={newLevelName} onChange={(e) => setNewLevelName(e.target.value)} />
          <Button
            size="sm"
            className="w-full"
            disabled={!newLevelCode.trim() || !newLevelName.trim() || addLevel.isPending}
            onClick={() => {
              addLevel.mutate(
                { code: toSlug(newLevelCode), name: newLevelName.trim() },
                {
                  onSuccess: () => {
                    setNewLevelCode("");
                    setNewLevelName("");
                  },
                },
              );
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add level
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Subjects" description={levelCode ? `In "${levelCode}"` : "Pick a level to view subjects"}>
        {!levelCode ? (
          <p className="text-sm text-muted-foreground">Select a level to see its subjects.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {(subjectsQ.data ?? []).map((s: any) => (
                <li
                  key={s.id}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                    subjectId === s.id ? "bg-muted" : ""
                  }`}
                >
                  <button type="button" className="text-left flex-1" onClick={() => setSubjectId(s.id)}>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.slug}</div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Delete subject "${s.name}"?`)) delSubject.mutate(s.id);
                    }}
                    aria-label="Delete subject"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-2">
              <Label>Add new subject</Label>
              <Input placeholder="Name" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
              <Button
                size="sm"
                className="w-full"
                disabled={!newSubject.trim() || addSubject.isPending}
                onClick={() =>
                  addSubject.mutate(
                    { name: newSubject.trim() },
                    { onSuccess: () => setNewSubject("") },
                  )
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Add subject
              </Button>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title="Chapters" description={subjectId ? "Chapters in selected subject" : "Pick a subject"}>
        {!subjectId ? (
          <p className="text-sm text-muted-foreground">Select a subject to see its chapters.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {(chaptersQ.data ?? []).map((c: any) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.slug}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Delete chapter "${c.name}"?`)) delChapter.mutate(c.id);
                    }}
                    aria-label="Delete chapter"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-2">
              <Label>Add new chapter</Label>
              <Input placeholder="Name" value={newChapter} onChange={(e) => setNewChapter(e.target.value)} />
              <Button
                size="sm"
                className="w-full"
                disabled={!newChapter.trim() || addChapter.isPending}
                onClick={() =>
                  addChapter.mutate(
                    { name: newChapter.trim() },
                    { onSuccess: () => setNewChapter("") },
                  )
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Add chapter
              </Button>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
