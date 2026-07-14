/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Lock, Search, FileClock, Layers as LayersIcon, KeySquare, UserCog } from "lucide-react";
import {
  listPermissionMatrix,
  toggleRolePermission,
  toggleRolePageAccess,
  listAuditLog,
  syncPageRegistry,
} from "@/lib/rbac/rbac.functions";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRoleDisplayName } from "@/lib/role-display";
import { UserRoleOverridePanel } from "./UserRoleOverridePanel";

export function PermissionsMatrixFlow() {
  const qc = useQueryClient();
  const fetchMatrix = useServerFn(listPermissionMatrix);
  const syncPages = useServerFn(syncPageRegistry);

  const matrix = useQuery({
    queryKey: ["rbac", "matrix"],
    queryFn: () => fetchMatrix(),
    staleTime: 15_000,
  });

  const syncMut = useMutation({
    mutationFn: () => syncPages(),
    onSuccess: () => {
      toast.success("Page registry synced");
      qc.invalidateQueries({ queryKey: ["rbac", "matrix"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  if (matrix.isLoading) {
    return <div className="glass shadow-card-soft rounded-3xl p-10 text-center text-muted-foreground">Loading matrix…</div>;
  }
  if (matrix.error || !matrix.data) {
    return (
      <div className="glass shadow-card-soft rounded-3xl p-10 text-center text-destructive">
        Failed to load permission matrix: {(matrix.error as any)?.message ?? "unknown error"}
      </div>
    );
  }

  const data = matrix.data;

  return (
    <div className="space-y-6">
      <header className="glass shadow-card-soft flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <div className="bg-cta-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-glow">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Roles & Permissions</h1>
            <p className="text-xs text-muted-foreground">
              Real-time matrix · super_admin is locked · changes propagate instantly
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
          {syncMut.isPending ? "Syncing…" : "Sync page registry"}
        </Button>
      </header>

      <Tabs defaultValue="permissions" className="space-y-4">
        <TabsList className="glass rounded-2xl p-1">
          <TabsTrigger value="permissions" className="gap-2">
            <KeySquare className="h-4 w-4" /> Permissions
          </TabsTrigger>
          <TabsTrigger value="pages" className="gap-2">
            <LayersIcon className="h-4 w-4" /> Page Access
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <UserCog className="h-4 w-4" /> User Overrides
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <FileClock className="h-4 w-4" /> Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions">
          <PermissionsGrid data={data} />
        </TabsContent>
        <TabsContent value="pages">
          <PagesGrid data={data} />
        </TabsContent>
        <TabsContent value="users">
          <UserRoleOverridePanel />
        </TabsContent>
        <TabsContent value="audit">
          <AuditLogTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function PermissionsGrid({ data }: { data: any }) {
  const qc = useQueryClient();
  const toggle = useServerFn(toggleRolePermission);
  const [q, setQ] = useState("");
  const grantSet = useMemo(
    () => new Set(data.rolePermissions.map((r: any) => `${r.role}::${r.permission}`)),
    [data.rolePermissions],
  );
  const mut = useMutation({
    mutationFn: (vars: { role: string; permission: string; enabled: boolean }) =>
      toggle({ data: vars as any }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["rbac", "matrix"] });
      const prev = qc.getQueryData<any>(["rbac", "matrix"]);
      if (prev) {
        const k = `${vars.role}::${vars.permission}`;
        const next = {
          ...prev,
          rolePermissions: vars.enabled
            ? [...prev.rolePermissions, { role: vars.role, permission: vars.permission }]
            : prev.rolePermissions.filter((r: any) => `${r.role}::${r.permission}` !== k),
        };
        qc.setQueryData(["rbac", "matrix"], next);
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["rbac", "matrix"], ctx.prev);
      toast.error(e?.message ?? "Update failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rbac", "me"] }),
  });

  const visible = data.permissions.filter((p: any) =>
    !q ? true : (p.key + " " + p.label).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <section className="glass shadow-card-soft space-y-4 rounded-3xl p-5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search permissions…"
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {visible.length} permissions
        </Badge>
      </div>

      <div className="overflow-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="lg:sticky lg:left-0 lg:z-10 bg-muted/60 px-4 py-3 text-left font-medium">
                Permission
              </th>
              {data.roles.map((role: string) => (
                <th key={role} className="px-3 py-3 text-center font-medium">
                  <span className="flex flex-col items-center gap-0.5 whitespace-nowrap">
                    {getRoleDisplayName(role)}
                    {role === "super_admin" && (
                      <Lock className="h-3 w-3 text-muted-foreground" aria-label="locked" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((perm: any, idx: number) => (
              <tr key={perm.key} className={idx % 2 === 0 ? "bg-background/0" : "bg-muted/10"}>
                <td className="lg:sticky lg:left-0 lg:z-10 whitespace-nowrap bg-background/95 px-4 py-2.5">
                  <div className="font-medium">{perm.label}</div>
                  <div className="text-[11px] text-muted-foreground">{perm.key}</div>
                </td>
                {data.roles.map((role: string) => {
                  const locked = role === "super_admin";
                  const checked = locked || grantSet.has(`${role}::${perm.key}`);
                  return (
                    <td key={role} className="px-3 py-2 text-center">
                      <Switch
                        checked={checked}
                        disabled={locked || mut.isPending}
                        onCheckedChange={(v) =>
                          mut.mutate({ role, permission: perm.key, enabled: v })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
function PagesGrid({ data }: { data: any }) {
  const qc = useQueryClient();
  const toggle = useServerFn(toggleRolePageAccess);
  const [q, setQ] = useState("");
  const grantSet = useMemo(
    () => new Set(data.pageAccess.map((r: any) => `${r.role}::${r.page_key}`)),
    [data.pageAccess],
  );
  const mut = useMutation({
    mutationFn: (vars: { role: string; page_key: string; enabled: boolean }) =>
      toggle({ data: vars as any }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["rbac", "matrix"] });
      const prev = qc.getQueryData<any>(["rbac", "matrix"]);
      if (prev) {
        const k = `${vars.role}::${vars.page_key}`;
        const next = {
          ...prev,
          pageAccess: vars.enabled
            ? [...prev.pageAccess, { role: vars.role, page_key: vars.page_key }]
            : prev.pageAccess.filter((r: any) => `${r.role}::${r.page_key}` !== k),
        };
        qc.setQueryData(["rbac", "matrix"], next);
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["rbac", "matrix"], ctx.prev);
      toast.error(e?.message ?? "Update failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rbac", "me"] }),
  });

  const filtered = data.pages.filter((p: any) =>
    !q ? true : (p.key + " " + p.label + " " + p.route).toLowerCase().includes(q.toLowerCase()),
  );
  const grouped = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of filtered) {
      const g = p.group ?? "General";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(p);
    }
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <section className="glass shadow-card-soft space-y-4 rounded-3xl p-5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages…"
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {filtered.length} pages
        </Badge>
      </div>

      <div className="overflow-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="lg:sticky lg:left-0 lg:z-10 bg-muted/60 px-4 py-3 text-left font-medium">Page</th>
              {data.roles.map((role: string) => (
                <th key={role} className="px-3 py-3 text-center font-medium">
                  <span className="flex flex-col items-center gap-0.5 whitespace-nowrap">
                    {getRoleDisplayName(role)}
                    {role === "super_admin" && (
                      <Lock className="h-3 w-3 text-muted-foreground" aria-label="locked" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([group, rows]) => (
              <>
                <tr key={`g-${group}`}>
                  <td
                    colSpan={data.roles.length + 1}
                    className="bg-muted/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                  >
                    {group}
                  </td>
                </tr>
                {rows.map((page: any) => (
                  <tr key={page.key}>
                    <td className="lg:sticky lg:left-0 lg:z-10 whitespace-nowrap bg-background/95 px-4 py-2.5">
                      <div className="font-medium">{page.label}</div>
                      <div className="text-[11px] text-muted-foreground">{page.route}</div>
                    </td>
                    {data.roles.map((role: string) => {
                      const locked = role === "super_admin";
                      const checked = locked || grantSet.has(`${role}::${page.key}`);
                      return (
                        <td key={role} className="px-3 py-2 text-center">
                          <Switch
                            checked={checked}
                            disabled={locked || mut.isPending}
                            onCheckedChange={(v) =>
                              mut.mutate({ role, page_key: page.key, enabled: v })
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
function AuditLogTable() {
  const fetchLog = useServerFn(listAuditLog);
  const q = useQuery({
    queryKey: ["rbac", "audit"],
    queryFn: () => fetchLog({ data: { limit: 100 } as any }),
    staleTime: 10_000,
  });
  if (q.isLoading) return <div className="glass rounded-3xl p-10 text-center text-muted-foreground">Loading…</div>;
  const rows = (q.data as any)?.rows ?? [];
  return (
    <section className="glass shadow-card-soft rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Recent permission changes</h2>
        <Badge variant="outline" className="text-[10px]">
          {rows.length} entries
        </Badge>
      </div>
      <div className="overflow-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">When</th>
              <th className="px-3 py-2 text-left font-medium">Actor</th>
              <th className="px-3 py-2 text-left font-medium">Action</th>
              <th className="px-3 py-2 text-left font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  No audit entries yet.
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">{r.actor_email ?? r.actor_id ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant="secondary" className="text-[10px]">{r.action}</Badge>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {[r.target_role, r.target_permission, r.target_page, r.target_user_id]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}