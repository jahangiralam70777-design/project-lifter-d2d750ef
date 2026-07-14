import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listMyAccess } from "@/lib/rbac/rbac.functions";
import { supabase } from "@/integrations/supabase/client";

const KEY = ["rbac", "me"] as const;
const ACCESS_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(label)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export type MyAccess = {
  userId: string;
  roles: string[];
  permissions: Set<string>;
  pages: Set<string>;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  loading: boolean;
  failed: boolean;
};

const EMPTY: MyAccess = {
  userId: "",
  roles: [],
  permissions: new Set(),
  pages: new Set(),
  isSuperAdmin: false,
  isAdmin: false,
  loading: true,
  failed: false,
};

export function useMyAccess(): MyAccess {
  const fn = useServerFn(listMyAccess);
  const q = useQuery({
    queryKey: KEY,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async () => withTimeout(fn(), ACCESS_TIMEOUT_MS, "RBAC access lookup timed out"),
  });
  return useMemo(() => {
    if (!q.data) {
      return {
        ...EMPTY,
        loading: q.isLoading,
        failed: !q.isLoading && q.isError,
      };
    }
    return {
      userId: q.data.userId,
      roles: q.data.roles,
      permissions: new Set(q.data.permissions),
      pages: new Set(q.data.pages),
      isSuperAdmin: q.data.isSuperAdmin,
      isAdmin: q.data.isAdmin,
      loading: false,
      failed: false,
    };
  }, [q.data, q.isLoading, q.isError]);
}

/**
 * Subscribe once at the admin layout. Any change to page_access, app_pages,
 * permission_audit_log, or the caller's own user_roles row invalidates the
 * RBAC caches → guards re-render in the next frame.
 *
 * NOTE: `role_permissions` is intentionally NOT in the realtime publication
 * (see security hardening migration 20260610120000 + DB-H1 reconciliation).
 * Role-permission edits are admin-rare; the matrix editor polls via
 * `refetchInterval` and other invalidations cover the rest.
 */
export function useRbacRealtime(userId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["rbac", "matrix"] });
      qc.invalidateQueries({ queryKey: ["rbac", "audit"] });
    };
    const ch = supabase
      .channel(`rbac:${userId}`)

      .on("postgres_changes", { event: "*", schema: "public", table: "page_access" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_pages" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "permission_audit_log" },
        () => qc.invalidateQueries({ queryKey: ["rbac", "audit"] }))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${userId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc, userId]);
}

export const RBAC_QUERY_KEY = KEY;

/**
 * Capability hook — gate a UI control on a permission key.
 * super_admin / admin pass through automatically.
 */
export function useCan(permission: string | string[]): boolean {
  const a = useMyAccess();
  if (a.loading) return false;
  if (a.isSuperAdmin || a.isAdmin) return true;
  const list = Array.isArray(permission) ? permission : [permission];
  return list.some((p) => a.permissions.has(p));
}

/** Capability hook for page keys (from page-registry). */
export function useCanPage(pageKey: string): boolean {
  const a = useMyAccess();
  if (a.loading) return false;
  if (a.isSuperAdmin || a.isAdmin) return true;
  return a.pages.has(pageKey);
}