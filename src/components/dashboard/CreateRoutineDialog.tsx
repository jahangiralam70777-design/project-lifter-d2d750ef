/* eslint-disable @typescript-eslint/no-explicit-any */
// Unified "Create Routine" modal — replaces the split "Save Routine" + "Add
// Task" flow. Every field lives here: routine identity, task defaults, and
// full scheduling (Daily / Weekly interval / Monthly interval / Date Range /
// Weekly Days). On save the server materializes matching occurrences into
// study_routine_tasks so the existing filters, calendar and analytics keep
// working without any downstream change.

import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
import { cn } from "@/lib/utils";

import { useLevels } from "@/hooks/use-levels";
import { listSubjects, listChapters } from "@/lib/learning.functions";
import type { StudyRoutineRow } from "@/lib/study-routine.functions";

export type ScheduleMode =
  | "daily"
  | "weekly"
  | "monthly"
  | "date_range"
  | "weekdays";

export type StudyTarget = "mcq" | "study" | "review" | "exam" | "custom";

export type CreateRoutinePayload = {
  id?: string;
  name: string;
  description: string | null;
  level_code: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  task_type: "study" | "mcq" | "quiz" | "mock" | "revision" | "custom";
  study_target: StudyTarget;
  estimated_minutes: number;
  priority: "low" | "medium" | "high";
  default_status: "pending" | "in_progress" | "completed";
  due_date: string | null;
  schedule_mode: ScheduleMode;
  interval_weeks: number;
  interval_months: number;
  weekdays: number[];
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string | null;
  is_active?: boolean;
};

// Map legacy DB values (mcq/reading/time/custom) onto the new UI target set.
function normalizeStudyTarget(v: string | null | undefined): StudyTarget {
  switch (v) {
    case "mcq":
      return "mcq";
    case "reading":
    case "study":
      return "study";
    case "time":
    case "review":
      return "review";
    case "exam":
      return "exam";
    case "custom":
      return "custom";
    default:
      return "study";
  }
}


const WEEKDAYS = [
  { i: 0, short: "Sun", label: "Sunday" },
  { i: 1, short: "Mon", label: "Monday" },
  { i: 2, short: "Tue", label: "Tuesday" },
  { i: 3, short: "Wed", label: "Wednesday" },
  { i: 4, short: "Thu", label: "Thursday" },
  { i: 5, short: "Fri", label: "Friday" },
  { i: 6, short: "Sat", label: "Saturday" },
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaults(): CreateRoutinePayload {
  return {
    name: "",
    description: null,
    level_code: null,
    subject_id: null,
    task_type: "study",
    study_target: "time",
    estimated_minutes: 60,
    priority: "medium",
    default_status: "pending",
    due_date: null,
    schedule_mode: "daily",
    interval_weeks: 1,
    interval_months: 1,
    weekdays: [],
    start_date: todayISO(),
    end_date: null,
    start_time: "09:00",
    chapter_id: null,
  };
}

export function CreateRoutineDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: StudyRoutineRow | null;
  onSave: (payload: CreateRoutinePayload) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<CreateRoutinePayload>(() => defaults());
  const [error, setError] = useState<string | null>(null);

  // Reset / hydrate on open. When editing an existing routine we pre-fill
  // whatever scheduling data was stored; older rows without the new columns
  // fall back to sensible defaults.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setForm({
        id: initial.id,
        name: initial.name ?? "",
        description: initial.description ?? null,
        level_code: initial.level_code ?? null,
        subject_id: initial.subject_id ?? null,
        chapter_id: initial.chapter_id ?? null,
        task_type:
          (initial.task_type as CreateRoutinePayload["task_type"]) ?? "study",
        study_target:
          (initial.study_target as CreateRoutinePayload["study_target"]) ??
          "time",
        estimated_minutes: initial.estimated_minutes ?? 60,
        priority:
          (initial.priority as CreateRoutinePayload["priority"]) ?? "medium",
        default_status:
          (initial.default_status as CreateRoutinePayload["default_status"]) ??
          "pending",
        due_date: initial.due_date ?? null,
        schedule_mode:
          (initial.schedule_mode as ScheduleMode) ??
          (initial.type === "monthly"
            ? "monthly"
            : initial.type === "weekly"
              ? "weekly"
              : "daily"),
        interval_weeks: initial.interval_weeks ?? 1,
        interval_months: initial.interval_months ?? 1,
        weekdays: initial.weekdays ?? [],
        start_date: initial.start_date ?? todayISO(),
        end_date: initial.end_date ?? null,
        start_time: (initial.start_time ?? "09:00").slice(0, 5),
        is_active: initial.is_active,
      });
    } else {
      setForm(defaults());
    }
  }, [open, initial]);

  function set<K extends keyof CreateRoutinePayload>(
    k: K,
    v: CreateRoutinePayload[K],
  ) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Academic cascade (level → subject → optional chapter).
  const levelsQuery = useLevels();
  const subjectsFn = useServerFn(listSubjects);
  const chaptersFn = useServerFn(listChapters);
  const subjectsQuery = useQuery({
    queryKey: ["cr-subjects", form.level_code ?? "__all"],
    queryFn: async () =>
      (await subjectsFn({
        data: form.level_code ? { level: form.level_code } : (undefined as any),
      })) as Array<{ id: string; name: string; level: string }>,
    staleTime: 30_000,
  });
  const chaptersQuery = useQuery({
    queryKey: ["cr-chapters", form.subject_id ?? "__none"],
    queryFn: async () =>
      form.subject_id
        ? ((await chaptersFn({
            data: { subjectId: form.subject_id },
          })) as Array<{ id: string; name: string }>)
        : [],
    enabled: !!form.subject_id,
    staleTime: 30_000,
  });

  const canSubmit = useMemo(() => {
    if (!form.name.trim()) return false;
    if (form.schedule_mode === "weekdays" && form.weekdays.length === 0)
      return false;
    if (form.schedule_mode === "date_range" && !form.end_date) return false;
    return true;
  }, [form]);

  function submit() {
    setError(null);
    if (!form.name.trim()) return setError("Routine title is required.");
    if (form.schedule_mode === "weekdays" && form.weekdays.length === 0)
      return setError("Pick at least one weekday.");
    if (form.schedule_mode === "date_range") {
      if (!form.end_date) return setError("End date is required.");
      if (form.end_date < form.start_date)
        return setError("End date must be on or after start date.");
    }
    onSave(form);
  }

  const toggleWeekday = (i: number) =>
    set(
      "weekdays",
      form.weekdays.includes(i)
        ? form.weekdays.filter((x) => x !== i)
        : [...form.weekdays, i].sort((a, b) => a - b),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {initial ? "Edit Routine" : "Create Routine"}
          </DialogTitle>
          <DialogDescription>
            One place for everything — routine details, task settings and full
            scheduling. Occurrences appear automatically on matching dates.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Section 1 — Routine identity */}
          <Section title="Routine details">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Routine Title" required className="sm:col-span-2">
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Weekly Accounting Practice"
                />
              </FormField>
              <FormField label="Level">
                <Select
                  value={form.level_code ?? undefined}
                  onValueChange={(v) => {
                    set("level_code", v);
                    set("subject_id", null);
                    set("chapter_id", null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    {(levelsQuery.data ?? []).map((l: any) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Subject">
                <Select
                  value={form.subject_id ?? undefined}
                  onValueChange={(v) => {
                    set("subject_id", v);
                    set("chapter_id", null);
                  }}
                  disabled={!form.level_code}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !form.level_code ? "Select level first" : "Select subject"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(subjectsQuery.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label="Chapter"
                hint="Optional"
                className="sm:col-span-2"
              >
                <Select
                  value={form.chapter_id ?? undefined}
                  onValueChange={(v) => set("chapter_id", v)}
                  disabled={!form.subject_id}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !form.subject_id
                          ? "Select subject first (optional)"
                          : "Select chapter (optional)"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(chaptersQuery.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </Section>

          <Separator />

          {/* Section 2 — Task settings */}
          <Section title="Task settings">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Description" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={form.description ?? ""}
                  onChange={(e) =>
                    set("description", e.target.value ? e.target.value : null)
                  }
                  placeholder="Optional context or instructions"
                />
              </FormField>
              <FormField label="Description" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={form.description ?? ""}
                  onChange={(e) =>
                    set("description", e.target.value ? e.target.value : null)
                  }
                  placeholder="Optional context or instructions"
                />
              </FormField>
              <FormField label="Study Target">
                <Select
                  value={form.study_target}
                  onValueChange={(v) => {
                    set("study_target", v as CreateRoutinePayload["study_target"]);
                    // Keep legacy task_type in sync so cards render the right icon/tone
                    set(
                      "task_type",
                      v === "mcq"
                        ? "mcq"
                        : v === "reading"
                          ? "study"
                          : v === "custom"
                            ? "custom"
                            : "study",
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mcq">MCQ</SelectItem>
                    <SelectItem value="reading">Reading</SelectItem>
                    <SelectItem value="time">Time</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Estimated Duration (min)">
                <Input
                  type="number"
                  min={5}
                  max={24 * 60}
                  value={form.estimated_minutes}
                  onChange={(e) =>
                    set(
                      "estimated_minutes",
                      Math.max(
                        5,
                        Math.min(24 * 60, Number(e.target.value) || 60),
                      ),
                    )
                  }
                />
              </FormField>
              <FormField label="Priority">
                <Select
                  value={form.priority}
                  onValueChange={(v) =>
                    set("priority", v as CreateRoutinePayload["priority"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Status">
                <Select
                  value={form.default_status}
                  onValueChange={(v) =>
                    set(
                      "default_status",
                      v as CreateRoutinePayload["default_status"],
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Start Time">
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => set("start_time", e.target.value)}
                />
              </FormField>
              <FormField label="Due Date" hint="Optional">
                <Input
                  type="date"
                  value={form.due_date ?? ""}
                  onChange={(e) =>
                    set("due_date", e.target.value ? e.target.value : null)
                  }
                />
              </FormField>
            </div>
          </Section>

          <Separator />

          {/* Section 3 — Scheduling */}
          <Section title="Scheduling">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { v: "daily", label: "Daily" },
                  { v: "weekly", label: "Weekly" },
                  { v: "monthly", label: "Monthly" },
                  { v: "date_range", label: "Date Range" },
                  { v: "weekdays", label: "Weekly Days" },
                ] as { v: ScheduleMode; label: string }[]
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => set("schedule_mode", o.v)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
                    form.schedule_mode === o.v
                      ? "border-primary/50 bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/5",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Start Date">
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                />
              </FormField>

              {form.schedule_mode === "weekly" && (
                <FormField label="Repeat every (weeks)">
                  <Input
                    type="number"
                    min={1}
                    max={52}
                    value={form.interval_weeks}
                    onChange={(e) =>
                      set(
                        "interval_weeks",
                        Math.max(1, Math.min(52, Number(e.target.value) || 1)),
                      )
                    }
                  />
                </FormField>
              )}

              {form.schedule_mode === "monthly" && (
                <FormField label="Repeat every (months)">
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={form.interval_months}
                    onChange={(e) =>
                      set(
                        "interval_months",
                        Math.max(1, Math.min(24, Number(e.target.value) || 1)),
                      )
                    }
                  />
                </FormField>
              )}

              {form.schedule_mode === "date_range" && (
                <FormField label="End Date" required>
                  <Input
                    type="date"
                    value={form.end_date ?? ""}
                    onChange={(e) =>
                      set("end_date", e.target.value ? e.target.value : null)
                    }
                  />
                </FormField>
              )}
            </div>

            {form.schedule_mode === "weekdays" && (
              <div className="mt-3">
                <Label className="text-xs text-muted-foreground">
                  Repeat on
                </Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const on = form.weekdays.includes(d.i);
                    return (
                      <button
                        key={d.i}
                        type="button"
                        onClick={() => toggleWeekday(d.i)}
                        aria-pressed={on}
                        className={cn(
                          "min-w-[3rem] rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                          on
                            ? "border-primary/50 bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/5",
                        )}
                        title={d.label}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Section>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {initial ? "Save Changes" : "Create Routine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function FormField({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
        {hint && (
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-normal normal-case tracking-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}
