import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Loader2,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudyRoutineRow } from "@/lib/study-routine.functions";
import { useStudyRoutineMutations } from "@/hooks/use-study-routine";

interface Props {
  routines: StudyRoutineRow[];
  loading?: boolean;
}

export function ManageRoutinesCard({ routines, loading }: Props) {
  const mut = useStudyRoutineMutations();
  const [confirmDelete, setConfirmDelete] = useState<StudyRoutineRow | null>(null);

  const busyId =
    mut.setRoutineFlags.variables?.id ??
    mut.duplicateRoutine.variables ??
    mut.deleteRoutine.variables ??
    null;

  return (
    <Card className="border-primary/10 bg-card/60 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base font-semibold">Manage Routines</CardTitle>
        <Badge variant="secondary" className="text-[10px]">
          {routines.length} total
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="grid place-items-center py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : routines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No routines yet. Create one above to get started.
          </p>
        ) : (
          routines.map((r) => {
            const isBusy = busyId === r.id;
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/60 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {r.type}
                    </Badge>
                    {r.is_archived ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Archived
                      </Badge>
                    ) : r.is_active ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 text-[10px]">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Inactive
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconAction
                    label={r.is_active ? "Deactivate" : "Activate"}
                    disabled={isBusy || r.is_archived}
                    onClick={() =>
                      mut.setRoutineFlags.mutate({ id: r.id, is_active: !r.is_active })
                    }
                  >
                    {r.is_active ? (
                      <PowerOff className="h-4 w-4" />
                    ) : (
                      <Power className="h-4 w-4" />
                    )}
                  </IconAction>
                  <IconAction
                    label={r.is_archived ? "Restore" : "Archive"}
                    disabled={isBusy}
                    onClick={() =>
                      mut.setRoutineFlags.mutate({
                        id: r.id,
                        is_archived: !r.is_archived,
                      })
                    }
                  >
                    {r.is_archived ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </IconAction>
                  <IconAction
                    label="Duplicate"
                    disabled={isBusy}
                    onClick={() => mut.duplicateRoutine.mutate(r.id)}
                  >
                    <Copy className="h-4 w-4" />
                  </IconAction>
                  <IconAction
                    label="Delete"
                    disabled={isBusy}
                    variant="destructive-ghost"
                    onClick={() => setConfirmDelete(r)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconAction>
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this routine?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{confirmDelete?.name}” and unlinks its tasks.
              Consider archiving instead if you might use it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) mut.deleteRoutine.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function IconAction({
  children,
  label,
  onClick,
  disabled,
  variant,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "destructive-ghost";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={
            variant === "destructive-ghost"
              ? "h-8 w-8 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
              : "h-8 w-8"
          }
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
