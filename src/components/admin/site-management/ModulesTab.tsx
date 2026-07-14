import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useModuleVisibility } from "@/hooks/use-module-visibility";
import { adminSetModuleHidden } from "@/lib/module-visibility.functions";

/**
 * ModulesTab — standalone module-visibility editor for SiteManagementFlow.
 * Mirrors the behaviour of ModulesPanel in AdminSettingsFlow so both surfaces
 * stay in sync (same query key, optimistic update, same server fn).
 */
export function ModulesTab() {
  const { rows } = useModuleVisibility();
  const qc = useQueryClient();
  const setFn = useServerFn(adminSetModuleHidden);
  type Row = (typeof rows)[number];
  type Vars = { key: Row["key"]; hidden: boolean };

  const mut = useMutation<unknown, Error, Vars, { prev?: Row[] }>({
    mutationFn: (v) => setFn({ data: { key: v.key, hidden: v.hidden } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["module-visibility"] });
      const prev = qc.getQueryData<Row[]>(["module-visibility"]);
      if (prev) {
        qc.setQueryData<Row[]>(
          ["module-visibility"],
          prev.map((r) => (r.key === v.key ? { ...r, hidden: v.hidden } : r)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["module-visibility"], ctx.prev);
      toast.error("Could not update module");
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.hidden ? "Hidden" : "Visible"} for students`);
      qc.invalidateQueries({ queryKey: ["module-visibility"] });
    },
  });

  const liveCount = rows.filter((r) => !r.hidden).length;

  return (
    <section className="glass shadow-card-soft rounded-2xl p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
            <Eye className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Module Visibility</h2>
            <p className="text-xs text-muted-foreground">
              Show or hide student-facing modules globally
            </p>
          </div>
        </div>
        <Badge variant="outline" className="rounded-full">
          {liveCount}/{rows.length} live
        </Badge>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((m) => (
          <div
            key={m.key}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-background/30 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  !m.hidden
                    ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_#10b981]"
                    : "bg-zinc-500"
                }`}
              />
              <p className="text-sm font-medium">{m.label}</p>
            </div>
            <Switch
              checked={!m.hidden}
              disabled={mut.isPending}
              onCheckedChange={(on) => mut.mutate({ key: m.key, hidden: !on })}
            />
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">No modules configured.</p>
        )}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Changes apply instantly to the student-facing site and are mirrored in
        Admin → Settings → Modules.
      </p>
    </section>
  );
}
