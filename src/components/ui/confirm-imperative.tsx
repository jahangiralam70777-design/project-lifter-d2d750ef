/**
 * Imperative ConfirmDialog — call `confirmDialog({...})` from anywhere; it
 * returns a Promise<boolean> resolved when the user confirms or cancels.
 *
 * Mount <ConfirmDialogHost /> ONCE in __root.tsx for the singleton to render.
 *
 * Designed as a drop-in replacement for `window.confirm(...)`:
 *   if (await confirmDialog({ title: "Delete row?", variant: "destructive" })) { ... }
 *
 * Built on the existing shadcn AlertDialog so it inherits focus trap +
 * Escape-to-close + correct ARIA roles for free.
 */
import { useEffect, useState, type ReactNode } from "react";
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
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

type Listener = (p: Pending | null) => void;
const listeners = new Set<Listener>();
let current: Pending | null = null;

function emit(p: Pending | null) {
  current = p;
  for (const l of listeners) l(p);
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  // SSR fallback: in non-browser contexts there is no host mounted.
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => emit({ ...opts, resolve }));
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending | null>(current);

  useEffect(() => {
    const fn: Listener = (p) => setPending(p);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const open = !!pending;
  const close = (ok: boolean) => {
    if (!pending) return;
    pending.resolve(ok);
    emit(null);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title ?? ""}</AlertDialogTitle>
          {pending?.description ? (
            <AlertDialogDescription>{pending.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {pending?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              close(true);
            }}
            className={cn(
              pending?.variant === "destructive" &&
                buttonVariants({ variant: "destructive" }),
            )}
          >
            {pending?.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
