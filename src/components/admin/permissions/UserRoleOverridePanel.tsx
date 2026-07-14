/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, UserCog, ShieldAlert } from "lucide-react";
import { lookupUsersForRbac, overrideUserRole } from "@/lib/rbac/rbac.functions";
import { ALL_ROLES } from "@/lib/admin-role-permissions.functions";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { getRoleDisplayName } from "@/lib/role-display";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
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

type Row = { id: string; email: string | null; display_name: string | null; roles: string[] };

export function UserRoleOverridePanel() {
  const qc = useQueryClient();
  const lookup = useServerFn(lookupUsersForRbac);
  const override = useServerFn(overrideUserRole);
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q, 250);
  const [pending, setPending] = useState<{ user: Row; role: string; grant: boolean } | null>(null);

  const list = useQuery({
    queryKey: ["rbac", "users", debounced],
    queryFn: () => lookup({ data: { q: debounced, limit: 25 } as any }),
    staleTime: 5_000,
  });

  const mut = useMutation({
    mutationFn: (v: { user_id: string; role: string; grant: boolean }) =>
      override({ data: v as any }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["rbac", "users"] });
      qc.invalidateQueries({ queryKey: ["rbac", "audit"] });
      qc.invalidateQueries({ queryKey: ["rbac", "me"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const rows = (list.data as any)?.rows as Row[] | undefined;
  const targetRoles = useMemo(() => ALL_ROLES.filter((r) => r !== "super_admin"), []);

  return (
    <section className="glass shadow-card-soft space-y-4 rounded-3xl p-5">
      <div className="flex items-center gap-3">
        <div className="bg-cta-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-white">
          <UserCog className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">User role overrides</h2>
          <p className="text-[11px] text-muted-foreground">
            Grant or revoke roles per user. Changes are audited and propagate in real time.
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email, name or user id…"
          className="pl-9"
        />
      </div>

      <div className="overflow-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">User</th>
              {targetRoles.map((r) => (
                <th key={r} className="px-3 py-3 text-center font-medium">
                  {getRoleDisplayName(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={targetRoles.length + 1} className="px-4 py-6 text-center text-muted-foreground">
                  Searching…
                </td>
              </tr>
            )}
            {!list.isLoading && (rows?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={targetRoles.length + 1} className="px-4 py-6 text-center text-muted-foreground">
                  No users match.
                </td>
              </tr>
            )}
            {rows?.map((u) => {
              const isSuper = u.roles.includes("super_admin");
              return (
                <tr key={u.id} className="border-t border-white/5">
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="font-medium">{u.display_name ?? u.email ?? u.id.slice(0, 8)}</span>
                      <span className="text-[11px] text-muted-foreground">{u.email ?? u.id}</span>
                      {isSuper && (
                        <Badge variant="outline" className="mt-1 w-fit gap-1 text-[10px]">
                          <ShieldAlert className="h-3 w-3" /> Super Admin (immutable)
                        </Badge>
                      )}
                    </div>
                  </td>
                  {targetRoles.map((role) => {
                    const has = u.roles.includes(role);
                    return (
                      <td key={role} className="px-3 py-2 text-center">
                        <Switch
                          checked={has}
                          disabled={isSuper || mut.isPending}
                          onCheckedChange={(v) =>
                            setPending({ user: u, role, grant: v })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.grant ? "Grant" : "Revoke"} {pending && getRoleDisplayName(pending.role)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.grant
                ? `This will give ${pending.user.email ?? pending.user.display_name ?? "the user"} every capability associated with the ${getRoleDisplayName(pending.role)} role.`
                : `This removes the ${pending ? getRoleDisplayName(pending.role) : ""} role from ${pending?.user.email ?? pending?.user.display_name ?? "the user"}. They will lose any pages and permissions granted only by that role.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pending) return;
                mut.mutate({ user_id: pending.user.id, role: pending.role, grant: pending.grant });
                setPending(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}