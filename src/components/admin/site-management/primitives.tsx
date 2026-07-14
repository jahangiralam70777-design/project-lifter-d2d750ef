import { useEffect, useState, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  ImageIcon,
  Search,
  Upload,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  adminListMedia,
  adminCreateMediaUploadUrl,
  adminFinalizeMedia,
} from "@/lib/site-management.functions";
import { supabase } from "@/integrations/supabase/client";
import * as LucideIcons from "lucide-react";

// -------------------- Field wrappers --------------------

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

// -------------------- Editor shell with Save/Publish --------------------

export function EditorShell({
  title,
  description,
  dirty,
  saving,
  publishing,
  onSave,
  onPublish,
  publishedAt,
  rightSlot,
  children,
}: {
  title: string;
  description?: string;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  onSave: () => void;
  onPublish: () => void;
  publishedAt?: string | null;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass shadow-card-soft space-y-4 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
          {publishedAt && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Last published {new Date(publishedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rightSlot}
          <Button variant="outline" size="sm" onClick={onSave} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Save draft
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" className="bg-cta-gradient text-white" disabled={publishing}>
                {publishing && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Publish
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Publish to the live site?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your saved draft will go live immediately. A version snapshot is saved
                  automatically — you can roll back from History.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onPublish}>Publish now</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {dirty && (
        <div className="rounded-lg border border-amber-300/40 bg-amber-50/40 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          You have unsaved changes. Save the draft, then publish to push live.
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// -------------------- Repeater (add/remove/reorder) --------------------

export function Repeater<T>({
  items,
  onChange,
  renderItem,
  newItem,
  addLabel = "Add item",
  emptyLabel = "No items yet.",
  max,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode;
  newItem: () => T;
  addLabel?: string;
  emptyLabel?: string;
  max?: number;
}) {
  const update = (i: number, patch: Partial<T>) => {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    if (max && items.length >= max) return;
    onChange([...items, newItem()]);
  };
  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      )}
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-border bg-card/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Item {i + 1}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move item ${i + 1} up`}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                aria-label={`Move item ${i + 1} down`}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => remove(i)}
                aria-label={`Remove item ${i + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="space-y-3">{renderItem(item, (patch) => update(i, patch), i)}</div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} disabled={!!max && items.length >= max}>
        <Plus className="mr-1 h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}

// -------------------- Color field --------------------

export function ColorField({
  value,
  onChange,
  label,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  hint?: string;
}) {
  // Browser color input requires #rrggbb. Show alongside text for raw tokens (oklch etc).
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value || "");
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isHex ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
          aria-label={`${label} color`}
        />
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#3b82f6 or oklch(...)"
          className="h-9 flex-1"
        />
      </div>
    </Field>
  );
}

// -------------------- Icon picker (Lucide) --------------------

const ICON_CHOICES = [
  "ListChecks",
  "FileText",
  "Brain",
  "Trophy",
  "BookOpen",
  "GraduationCap",
  "Sparkles",
  "Target",
  "BarChart3",
  "Lightbulb",
  "Rocket",
  "Star",
  "Shield",
  "Award",
  "Users",
  "MessageCircle",
  "Calendar",
  "Clock",
  "Layers",
  "Compass",
  "Zap",
  "Heart",
  "CheckCircle",
  "TrendingUp",
];

export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Current = (LucideIcons as any)[value] ?? LucideIcons.Sparkles;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 justify-start gap-2">
          <Current className="h-4 w-4" />
          <span className="truncate">{value || "Pick icon"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose an icon</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-6 gap-2">
          {ICON_CHOICES.map((name) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Icon = (LucideIcons as any)[name];
            if (!Icon) return null;
            const active = value === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className={`flex aspect-square items-center justify-center rounded-lg border transition ${
                  active ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
                title={name}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Media picker (image) --------------------

type MediaItem = {
  id: string;
  file_name: string;
  mime_type: string;
  publicUrl: string;
  alt_text: string | null;
};

const MEDIA_KEY = ["admin-media"] as const;

export function MediaPickerButton({
  value,
  onChange,
  label = "Image",
  hint,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  label?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        <div className="h-20 w-28 overflow-hidden rounded-lg border border-border bg-muted">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <ImageIcon className="mr-1 h-3.5 w-3.5" /> {value ? "Change" : "Choose image"}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => onChange(null)}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Remove
            </Button>
          )}
        </div>
      </div>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="Or paste an image URL"
        className="mt-2 h-8 text-xs"
      />
      <MediaPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        onPick={(url) => {
          onChange(url);
          setOpen(false);
        }}
      />
    </Field>
  );
}

export function MediaPickerDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: [...MEDIA_KEY, { search }],
    queryFn: () => adminListMedia({ data: { search: search || undefined, page: 1, pageSize: 60 } }),
    enabled: open,
    staleTime: 10_000,
  });
  const items = (data?.items ?? []) as MediaItem[];
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.size > 20 * 1024 * 1024) {
          toast.error(`${f.name} exceeds 20MB`);
          continue;
        }
        let width: number | undefined;
        let height: number | undefined;
        if (f.type.startsWith("image/")) {
          try {
            const bmp = await createImageBitmap(f);
            width = bmp.width;
            height = bmp.height;
            bmp.close();
          } catch {
            /* ignore */
          }
        }
        const { path, token } = await adminCreateMediaUploadUrl({
          data: {
            fileName: f.name.replace(/[^a-zA-Z0-9._-]+/g, "-"),
            mimeType: f.type || "application/octet-stream",
            sizeBytes: f.size,
          },
        });
        const { error: upErr } = await supabase.storage
          .from("site-media")
          .uploadToSignedUrl(path, token, f, {
            contentType: f.type || undefined,
            upsert: false,
          });
        if (upErr) throw new Error(upErr.message);
        await adminFinalizeMedia({
          data: {
            path,
            fileName: f.name,
            mimeType: f.type || "application/octet-stream",
            sizeBytes: f.size,
            width,
            height,
            tags: [],
          },
        });
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      qc.invalidateQueries({ queryKey: MEDIA_KEY });
      toast.success("Uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename…"
              className="h-9 pl-7"
            />
          </div>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="mr-1 h-3.5 w-3.5" />{" "}
            {uploading ? `Uploading ${progress}%` : "Upload new"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && items.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No images yet. Upload one to get started.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items
              .filter((i) => i.mime_type.startsWith("image/"))
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPick(m.publicUrl)}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted transition hover:ring-2 hover:ring-primary"
                >
                  <img
                    src={m.publicUrl}
                    alt={m.alt_text ?? m.file_name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100">
                    {m.file_name}
                  </span>
                </button>
              ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Draft hook (deep-equal dirty tracking) --------------------

export function useDraft<T>(initial: T, key: string) {
  const [value, setValue] = useState<T>(initial);
  // Reset when external key changes (e.g. switching section)
  useEffect(() => {
    setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // If the draft from server updates (e.g. realtime) and matches no local edits, sync
  useEffect(() => {
    setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initial)]);
  const setField = useMemo(
    () =>
      <K extends keyof T>(k: K, v: T[K]) =>
        setValue((prev) => ({ ...prev, [k]: v })),
    [],
  );
  return { value, setValue, setField };
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// -------------------- Visibility check icon --------------------
export const Tick = Check;
