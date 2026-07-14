import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Home,
  GripVertical,
  Search,
  MoreHorizontal,
  Globe,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  adminListPages,
  adminCreatePage,
  adminUpdatePage,
  adminDeletePage,
  adminDuplicatePage,
  adminSetHomepage,
  adminReorderPages,
  type SitePage,
} from "@/lib/site-pages.functions";

const PAGES_KEY = ["admin-site-pages"] as const;

type Props = {
  activePageId: string | null;
  onActivate: (page: SitePage) => void;
};

export function PagesPanel({ activePageId, onActivate }: Props) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editPage, setEditPage] = useState<SitePage | null>(null);
  const [deletePage, setDeletePage] = useState<SitePage | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: PAGES_KEY,
    queryFn: () => adminListPages(),
    staleTime: 10_000,
  });

  const pages = useMemo(() => {
    const list = (data?.pages ?? []) as SitePage[];
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter(
      (p) => p.title.toLowerCase().includes(needle) || p.slug.toLowerCase().includes(needle),
    );
  }, [data, q]);

  const invalidate = () => qc.invalidateQueries({ queryKey: PAGES_KEY });

  const dup = useMutation({
    mutationFn: (id: string) => adminDuplicatePage({ data: { id } }),
    onSuccess: () => {
      toast.success("Page duplicated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setHome = useMutation({
    mutationFn: (id: string) => adminSetHomepage({ data: { id } }),
    onSuccess: () => {
      toast.success("Homepage updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: (order: { id: string; sort_order: number }[]) =>
      adminReorderPages({ data: { order } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(pages, oldIndex, newIndex);
    // optimistic
    qc.setQueryData(PAGES_KEY, { pages: next });
    reorder.mutate(next.map((p: SitePage, i: number) => ({ id: p.id, sort_order: i })));
  };

  return (
    <aside className="glass shadow-card-soft flex flex-col gap-3 rounded-2xl p-3">
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Pages
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 rounded-full text-xs"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Add Page
        </Button>
      </div>

      <div className="relative px-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search pages…"
          className="h-8 rounded-xl pl-8 text-xs"
        />
      </div>

      {isLoading ? (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">Loading…</p>
      ) : pages.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          No pages yet. Click <strong>+ Add Page</strong> to create one.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1">
              {pages.map((page) => (
                <PageRow
                  key={page.id}
                  page={page}
                  active={page.id === activePageId}
                  onActivate={() => onActivate(page)}
                  onEdit={() => setEditPage(page)}
                  onDelete={() => setDeletePage(page)}
                  onDuplicate={() => dup.mutate(page.id)}
                  onSetHome={() => setHome.mutate(page.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="mt-1 rounded-xl bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
        Drag pages to reorder. Pages you create appear in the site navigation.
      </div>

      <CreatePageDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={invalidate} />
      <EditPageDialog
        page={editPage}
        onOpenChange={(o) => !o && setEditPage(null)}
        onSaved={invalidate}
      />
      <DeletePageDialog
        page={deletePage}
        onOpenChange={(o) => !o && setDeletePage(null)}
        onDeleted={invalidate}
      />
    </aside>
  );
}

function PageRow({
  page,
  active,
  onActivate,
  onEdit,
  onDelete,
  onDuplicate,
  onSetHome,
}: {
  page: SitePage;
  active: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSetHome: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 rounded-xl px-1 py-1 text-sm transition ${
        active ? "bg-cta-gradient text-white shadow-glow" : "hover:bg-muted/60"
      }`}
    >
      <button
        type="button"
        className={`cursor-grab touch-none rounded p-1 ${
          active ? "text-white/70 hover:bg-white/10" : "text-muted-foreground hover:bg-background"
        }`}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        className="flex flex-1 items-center gap-2 truncate text-left"
        onClick={onActivate}
      >
        {page.is_home ? (
          <Home className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Globe
            className={`h-3.5 w-3.5 shrink-0 ${active ? "text-white/80" : "text-muted-foreground"}`}
          />
        )}
        <span className="truncate font-medium">{page.title}</span>
        {page.status === "draft" && (
          <Badge
            variant="outline"
            className={`ml-auto h-4 shrink-0 px-1.5 text-[9px] uppercase ${
              active ? "border-white/40 text-white/90" : ""
            }`}
          >
            draft
          </Badge>
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`rounded p-1 ${
              active ? "hover:bg-white/20" : "hover:bg-background"
            } opacity-0 transition group-hover:opacity-100 data-[state=open]:opacity-100`}
            aria-label="Page actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
          </DropdownMenuItem>
          {!page.is_home && (
            <DropdownMenuItem onClick={onSetHome}>
              <Home className="mr-2 h-3.5 w-3.5" /> Set as homepage
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={page.is_home}
            onClick={onDelete}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function CreatePageDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDesc, setSeoDesc] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      adminCreatePage({
        data: {
          title: title.trim(),
          slug: (slug || slugify(title)).trim(),
          seo_title: seoTitle.trim() || null,
          seo_description: seoDesc.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Page created");
      setTitle("");
      setSlug("");
      setSeoTitle("");
      setSeoDesc("");
      onOpenChange(false);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new page</DialogTitle>
          <DialogDescription>
            New pages start as drafts. Set them to published when ready.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="page-title">Page title</Label>
            <Input
              id="page-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="About Us"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="page-slug">URL slug</Label>
            <Input
              id="page-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder={slugify(title) || "about-us"}
            />
            <p className="text-[11px] text-muted-foreground">
              Will appear at /{slug || slugify(title) || "your-page"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="page-seo-title">SEO title (optional)</Label>
            <Input
              id="page-seo-title"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder="Shown in browser tab and search results"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="page-seo-desc">SEO description (optional)</Label>
            <Textarea
              id="page-seo-desc"
              value={seoDesc}
              onChange={(e) => setSeoDesc(e.target.value)}
              rows={2}
              placeholder="Short summary for search engines"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!title.trim() || createMut.isPending}
          >
            {createMut.isPending ? "Creating…" : "Create page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPageDialog({
  page,
  onOpenChange,
  onSaved,
}: {
  page: SitePage | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDesc, setSeoDesc] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");

  // sync on open
  useMemo(() => {
    if (page) {
      setTitle(page.title);
      setSlug(page.slug);
      setSeoTitle(page.seo_title ?? "");
      setSeoDesc(page.seo_description ?? "");
      setStatus(page.status);
    }
  }, [page]);

  const updateMut = useMutation({
    mutationFn: () =>
      adminUpdatePage({
        data: {
          id: page!.id,
          title: title.trim(),
          slug: slug.trim(),
          seo_title: seoTitle.trim() || null,
          seo_description: seoDesc.trim() || null,
          status,
        },
      }),
    onSuccess: () => {
      toast.success("Page updated");
      onOpenChange(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!page} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit page</DialogTitle>
          <DialogDescription>Update title, URL slug, SEO and publish status.</DialogDescription>
        </DialogHeader>
        {page && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>URL slug</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                disabled={page.is_home}
              />
              {page.is_home && (
                <p className="text-[11px] text-muted-foreground">The homepage slug is locked.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>SEO title</Label>
              <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>SEO description</Label>
              <Textarea value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex gap-2">
                {(["draft", "published", "archived"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs capitalize transition ${
                      status === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => updateMut.mutate()}
            disabled={!title.trim() || updateMut.isPending}
          >
            {updateMut.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeletePageDialog({
  page,
  onOpenChange,
  onDeleted,
}: {
  page: SitePage | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const delMut = useMutation({
    mutationFn: () => adminDeletePage({ data: { id: page!.id } }),
    onSuccess: () => {
      toast.success("Page deleted");
      onOpenChange(false);
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open={!!page} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete page?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{page?.title}</strong> and all its sections. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              delMut.mutate();
            }}
            disabled={delMut.isPending}
          >
            {delMut.isPending ? "Deleting…" : "Delete page"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
