// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { sanitizeSearchTerm } from "@/lib/admin-search-sanitize";
import { noInput } from "@/lib/validate";
import { z } from "zod";

// Tables we block from writes/deletes via the Database Manager — manage them
// through their dedicated admin screens.
export const PROTECTED_WRITE_TABLES = new Set<string>([
  "user_roles",
  "site_settings",
  "module_visibility",
]);

// Backwards-compat re-export so any older imports of `INSPECTABLE_TABLES` keep
// resolving. The UI now discovers tables dynamically via adminListPublicTables.
export const INSPECTABLE_TABLES = [] as const;
export type InspectableTable = string;

// Columns whose values must never leave the server, even for admins. Matched
// case-insensitively against the column name. Defense-in-depth — sensitive
// fields (auth hashes, API keys, OAuth tokens, webhook secrets) should not be
// stored in app tables in the first place, but if they ever are, this layer
// scrubs them out of the row viewer / CSV export / detail drawer.
const SENSITIVE_COLUMN_PATTERNS: RegExp[] = [
  /password/i,
  /secret/i,
  /api[_-]?key/i,
  /access[_-]?token|refresh[_-]?token|id[_-]?token|bearer/i,
  /private[_-]?key/i,
  /service[_-]?role/i,
  /webhook[_-]?secret/i,
  /encryption[_-]?key|signing[_-]?key/i,
];
const REDACTED = "•••••• (redacted)";
function redactRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] =
      SENSITIVE_COLUMN_PATTERNS.some((re) => re.test(k)) && v !== null && v !== undefined
        ? REDACTED
        : v;
  }
  return out as T;
}

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertTableExists(supabase: any, table: string): Promise<void> {
  if (!IDENT.test(table)) throw new Error("Invalid table name");
  const { data, error } = await supabase.rpc("admin_list_public_tables");
  if (error) throw new Error(error.message);
  const known = new Set((data as Array<{ table_name: string }>).map((t) => t.table_name));
  if (!known.has(table)) throw new Error(`Unknown table: ${table}`);
}

export type PublicTableInfo = {
  table_name: string;
  size_bytes: number;
  row_estimate: number;
  rls_enabled: boolean;
};

export const adminListPublicTables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }): Promise<PublicTableInfo[]> => {
    await assertPermission(context.supabase, context.userId, "manage_system");
    console.log("[admin-db] list tables request", { userId: context.userId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any).rpc("admin_list_public_tables");
    if (error) throw new Error(error.message);
    console.log("[admin-db] list tables response", { count: data?.length ?? 0 });
    return (data ?? []) as PublicTableInfo[];
  });

export type TableMetadata = {
  table: string;
  primary_key: string[];
  columns: Array<{
    name: string;
    data_type: string;
    is_nullable: boolean;
    default: string | null;
    ordinal_position: number;
    is_pk: boolean;
  }>;
  foreign_keys: Array<{
    constraint_name: string;
    columns: string[];
    foreign_table: string;
    foreign_columns: string[];
  }>;
  referenced_by: Array<{
    constraint_name: string;
    from_table: string;
    from_columns: string[];
    columns: string[];
  }>;
  indexes: Array<{ name: string; definition: string }>;
  policies: Array<{
    name: string;
    command: string;
    roles: string[];
    permissive: string;
    using: string | null;
    with_check: string | null;
  }>;
};

export const adminGetTableMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ table: z.string().min(1).max(63) }).parse(input))
  .handler(async ({ data, context }): Promise<TableMetadata> => {
    await assertPermission(context.supabase, context.userId, "manage_system");
    await assertTableExists(context.supabase, data.table);
    console.log("[admin-db] metadata request", { table: data.table });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: meta, error } = await (context.supabase as any).rpc("admin_table_metadata", {
      _table: data.table,
    });
    if (error) throw new Error(error.message);
    return meta as TableMetadata;
  });

const listInput = z.object({
  table: z.string().min(1).max(63),
  page: z.number().int().min(0).max(10000).default(0),
  // Hard cap at 100 rows / page. Prevents full-table extraction via the
  // admin Database Manager — large exports should use dedicated tools.
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().max(200).optional(),
  sortColumn: z.string().min(1).max(63).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  // Optional explicit column projection. When provided, only listed columns
  // are selected (still passed through redactRow). When omitted, "*" is
  // selected so existing UIs continue to work unchanged.
  columns: z.array(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/)).max(64).optional(),
});

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type TableRow = Record<string, JsonValue>;
export type TableRowsResult = {
  table: string;
  rows: TableRow[];
  total: number;
  page: number;
  pageSize: number;
  columns: string[];
};

export const adminListTableRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => listInput.parse(input))
  .handler(async ({ data, context }): Promise<TableRowsResult> => {
    await assertPermission(context.supabase, context.userId, "manage_system");
    await assertTableExists(context.supabase, data.table);
    console.log("[admin-db] rows request", {
      table: data.table,
      page: data.page,
      pageSize: data.pageSize,
      search: data.search ?? null,
      sortColumn: data.sortColumn ?? null,
      sortDir: data.sortDir,
    });
    const { table, page, pageSize, search, sortColumn, sortDir } = data;
    const requestedColumns = data.columns;
    const projection =
      requestedColumns && requestedColumns.length > 0
        ? requestedColumns.map((c) => `"${c}"`).join(",")
        : "*";
    const from = page * pageSize;
    const to = from + pageSize - 1;
    let usedFallbackQuery = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const trimmedSearch = (search ?? "").trim();

    // For tables that reference users via `user_id` (e.g. user_roles), let
    // admins search by the actual person's display name / email by first
    // resolving the term against profiles + auth.users and then filtering
    // the target table by the matching ids.
    let userIdSearchFilter: string[] | null = null;
    if (trimmedSearch) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sanitized = sanitizeSearchTerm(trimmedSearch);
        const ids = new Set<string>();
        if (sanitized) {
          const { data: profMatches } = await sb
            .from("profiles")
            .select("id")
            .ilike("display_name", `%${sanitized}%`)
            .limit(500);
          for (const r of (profMatches ?? []) as Array<{ id: string }>) ids.add(r.id);
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: u } = await (supabaseAdmin.auth.admin as any).listUsers({
            page: 1,
            perPage: 1000,
          });
          const lower = trimmedSearch.toLowerCase();
          for (const usr of (u?.users ?? []) as Array<{ id: string; email?: string | null }>) {
            if ((usr.email ?? "").toLowerCase().includes(lower)) ids.add(usr.id);
          }
        } catch {
          // best-effort
        }
        userIdSearchFilter = Array.from(ids);
      } catch {
        userIdSearchFilter = null;
      }
    }

    let query = sb.from(table).select(projection, { count: "exact" });
    if (search && search.trim()) {
      // H-1: strip PostgREST `.or()` and ilike meta-chars so a `,` or `)`
      // in the user's search can't break out of the filter expression.
      const term = sanitizeSearchTerm(search.trim());
      if (term) {
        const pattern = `%${term}%`;
        const candidates = [
          "name",
          "title",
          "email",
          "label",
          "key",
          "slug",
          "display_name",
          "question",
          "description",
        ];
        const filters = candidates.map((c) => `${c}.ilike.${pattern}`).join(",");
        query = query.or(filters);
      }
    }
    const orderCol = sortColumn && IDENT.test(sortColumn) ? sortColumn : "created_at";
    const ordered = query.order(orderCol, { ascending: sortDir === "asc", nullsFirst: false });
    let res = await ordered.range(from, to);
    if (res.error) {
      usedFallbackQuery = true;
      res = await sb.from(table).select(projection, { count: "exact" }).range(from, to);
    }
    // If the column-level search came up empty but the term matched some
    // user ids, retry by filtering on user_id — covers tables like
    // user_roles whose searchable text lives in profiles / auth.users.
    if (
      !res.error &&
      (res.data?.length ?? 0) === 0 &&
      userIdSearchFilter &&
      userIdSearchFilter.length > 0
    ) {
      const retry = await sb
        .from(table)
        .select("*", { count: "exact" })
        .in("user_id", userIdSearchFilter)
        .order(orderCol, { ascending: sortDir === "asc", nullsFirst: false })
        .range(from, to);
      if (!retry.error) res = retry;
    }
    if (res.error) throw new Error(res.error.message);
    const rows = (res.data ?? []) as unknown as TableRow[];
    let safeRows = rows.map((r) => redactRow(r));

    // Identity enrichment: when the table has a `user_id` column, join
    // profiles + auth.users to expose readable name and email columns.
    // Resolves the "user_roles shows only UUIDs" issue.
    const hasUserId =
      safeRows.length > 0 && Object.prototype.hasOwnProperty.call(safeRows[0], "user_id");
    if (hasUserId) {
      const ids = Array.from(
        new Set(
          safeRows
            .map((r) => r.user_id)
            .filter((v): v is string => typeof v === "string" && v.length > 0),
        ),
      );
      const nameMap = new Map<string, string | null>();
      const emailMap = new Map<string, string | null>();
      if (ids.length) {
        try {
          const { data: profs } = await sb
            .from("profiles")
            .select("id,display_name")
            .in("id", ids);
          for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
            nameMap.set(p.id, p.display_name);
          }
        } catch {
          // best-effort
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const idSet = new Set(ids);
          const perPage = 1000;
          for (let pg = 1; pg <= 10 && emailMap.size < idSet.size; pg++) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: u } = await (supabaseAdmin.auth.admin as any).listUsers({
              page: pg,
              perPage,
            });
            const users: Array<{
              id: string;
              email?: string | null;
              user_metadata?: {
                display_name?: string | null;
                full_name?: string | null;
                name?: string | null;
              } | null;
            }> = u?.users ?? [];
            if (!users.length) break;
            for (const usr of users) {
              if (idSet.has(usr.id)) {
                emailMap.set(usr.id, usr.email ?? null);
                // Display priority: profile.display_name → metadata.display_name
                // → metadata.full_name → metadata.name → email.
                if (!nameMap.get(usr.id)) {
                  const md = usr.user_metadata ?? {};
                  nameMap.set(
                    usr.id,
                    md.display_name ?? md.full_name ?? md.name ?? usr.email ?? null,
                  );
                }
              }
            }
            if (users.length < perPage) break;
          }
        } catch {
          // best-effort
        }
      }
      safeRows = safeRows.map((r) => {
        const uid = typeof r.user_id === "string" ? r.user_id : null;
        const displayName = uid ? (nameMap.get(uid) ?? null) : null;
        const email = uid ? (emailMap.get(uid) ?? null) : null;
        return {
          user_display_name:
            displayName ?? email ?? (uid ? `${uid.slice(0, 8)}…` : null),
          user_email: email,
          ...r,
        };
      });
    }

    // Column order: surface readable identity columns first, push raw
    // user_id to the end so admins see names/emails instead of just UUIDs.
    let columns = safeRows[0] ? Object.keys(safeRows[0]) : [];
    if (hasUserId) {
      const priority = ["user_display_name", "user_email", "role"];
      const head = priority.filter((c) => columns.includes(c));
      const tail = columns.filter((c) => !head.includes(c) && c !== "user_id");
      columns = [...head, ...tail, "user_id"];
    }
    console.log("[admin-db] rows response", {
      table,
      count: safeRows.length,
      total: res.count ?? rows.length,
      usedFallbackQuery,
      enriched: hasUserId,
    });
    return { table, rows: safeRows, total: res.count ?? rows.length, page, pageSize, columns };
  });

const deleteInput = z
  .object({
    table: z.string().min(1).max(63),
    id: z.string().min(1).max(200),
    idColumn: z.string().min(1).max(64).default("id"),
  })
  .superRefine((v, ctx) => {
    if (v.idColumn === "id" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "id must be a UUID when idColumn='id'",
      });
    }
  });

export const adminDeleteTableRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => deleteInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_system", "db.delete_row", {
      table: data.table,
      id: data.id,
      id_column: data.idColumn,
    });
    await assertTableExists(context.supabase, data.table);
    if (PROTECTED_WRITE_TABLES.has(data.table)) {
      throw new Error(`Row deletion is disabled on protected table "${data.table}".`);
    }
    if (!IDENT.test(data.idColumn)) throw new Error("Invalid id column");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any)
      .from(data.table)
      .delete()
      .eq(data.idColumn, data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const bulkDeleteInput = z
  .object({
    table: z.string().min(1).max(63),
    ids: z.array(z.string().min(1).max(200)).min(1).max(500),
    idColumn: z.string().min(1).max(64).default("id"),
  })
  .superRefine((v, ctx) => {
    if (v.idColumn === "id") {
      const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const bad = v.ids.findIndex((x) => !re.test(x));
      if (bad >= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ids", bad],
          message: "all ids must be UUIDs when idColumn='id'",
        });
      }
    }
  });

export const adminBulkDeleteTableRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => bulkDeleteInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_system",
      "db.bulk_delete_rows",
      {
        table: data.table,
        id_count: data.ids.length,
        id_column: data.idColumn,
      },
    );
    await assertTableExists(context.supabase, data.table);
    if (PROTECTED_WRITE_TABLES.has(data.table)) {
      throw new Error(`Bulk delete is disabled on protected table "${data.table}".`);
    }
    if (!IDENT.test(data.idColumn)) throw new Error("Invalid id column");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, count } = await (context.supabase as any)
      .from(data.table)
      .delete({ count: "exact" })
      .in(data.idColumn, data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, deleted: count ?? data.ids.length };
  });

const writeInput = z.object({
  table: z.string().min(1).max(63),
  values: z.record(z.string().min(1).max(63), z.unknown()),
  id: z.string().min(1).max(200).optional(),
  idColumn: z.string().min(1).max(64).default("id"),
});

export const adminUpsertTableRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => writeInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_system",
      data.id ? "db.update_row" : "db.insert_row",
      { table: data.table, id: data.id ?? null, columns: Object.keys(data.values) },
    );
    await assertTableExists(context.supabase, data.table);
    if (PROTECTED_WRITE_TABLES.has(data.table)) {
      throw new Error(`Writes are disabled on protected table "${data.table}".`);
    }
    if (!IDENT.test(data.idColumn)) throw new Error("Invalid id column");
    for (const k of Object.keys(data.values)) {
      if (!IDENT.test(k)) throw new Error(`Invalid column name: ${k}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    if (data.id) {
      const { data: out, error } = await sb
        .from(data.table)
        .update(data.values)
        .eq(data.idColumn, data.id)
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { ok: true, row: out };
    }
    const { data: out, error } = await sb
      .from(data.table)
      .insert(data.values)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, row: out };
  });

/**
 * C-1: SELECT-only allow-list for the admin database inspector.
 *
 * The underlying RPC `admin_run_select_query` is the database-level gate;
 * this TypeScript layer adds defense-in-depth so a compromised admin
 * session cannot smuggle DDL/DML through the inspector even if the RPC's
 * own checks are bypassed or relaxed. Rules:
 *  - Strip a single trailing semicolon, then reject if any `;` remains
 *    (no multi-statement scripts).
 *  - Strip line + block comments before keyword inspection so a leading
 *    `/* … *​/ DELETE …` cannot disguise the real statement.
 *  - Require the first token to be `SELECT` or `WITH` (CTE → SELECT).
 *  - Reject any forbidden keyword on a word boundary anywhere in the
 *    statement (INSERT/UPDATE/DELETE/etc., plus `INTO` which would turn
 *    a SELECT into a write via `SELECT … INTO`).
 *
 * Fails closed: any violation throws before the RPC is invoked.
 */
const FORBIDDEN_SQL_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "MERGE",
  "UPSERT",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "RENAME",
  "GRANT",
  "REVOKE",
  "COMMENT",
  "REINDEX",
  "REFRESH",
  "VACUUM",
  "ANALYZE",
  "CLUSTER",
  "LOCK",
  "COPY",
  "CALL",
  "DO",
  "EXECUTE",
  "PREPARE",
  "DEALLOCATE",
  "LISTEN",
  "NOTIFY",
  "UNLISTEN",
  "SET",
  "RESET",
  "SHOW",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
  "START",
  "INTO",
];
const FORBIDDEN_SQL_RE = new RegExp(`\\b(${FORBIDDEN_SQL_KEYWORDS.join("|")})\\b`, "i");

function assertSelectOnly(rawSql: string): string {
  // Strip block comments /* ... */ and line comments -- ... \n before
  // keyword inspection, then trim and remove a single trailing ;
  const stripped = rawSql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ")
    .trim()
    .replace(/;\s*$/, "")
    .trim();
  if (!stripped) throw new Error("Empty SQL");
  if (stripped.includes(";")) {
    throw new Error("Only a single SQL statement is allowed");
  }
  const first = stripped.match(/^[A-Za-z]+/)?.[0]?.toUpperCase();
  if (first !== "SELECT" && first !== "WITH") {
    throw new Error("Only SELECT (or WITH … SELECT) queries are allowed");
  }
  const forbidden = stripped.match(FORBIDDEN_SQL_RE);
  if (forbidden) {
    throw new Error(`Forbidden keyword in SQL: ${forbidden[1].toUpperCase()}`);
  }
  return stripped;
}

export const adminRunSelectQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        sql: z.string().min(1).max(5000),
        maxRows: z.number().int().min(1).max(1000).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Defense-in-depth: validate before we even check permission so
    // a forbidden statement never reaches the audit log as "attempted".
    const safeSql = assertSelectOnly(data.sql);
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_system",
      "db.run_select_query",
      {
        sql_preview: safeSql.slice(0, 200),
        max_rows: data.maxRows,
      },
    );
    console.log("[admin-db] query request", {
      maxRows: data.maxRows,
      sqlPreview: safeSql.slice(0, 200),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: out, error } = await (context.supabase as any).rpc("admin_run_select_query", {
      _sql: safeSql,
      _max_rows: data.maxRows,
    });
    if (error) throw new Error(error.message);
    console.log("[admin-db] query response", {
      rowCount: Array.isArray((out as { rows?: unknown[] } | null)?.rows)
        ? ((out as { rows?: unknown[] }).rows?.length ?? 0)
        : 0,
    });
    return out as unknown as {
      rows: Array<Record<string, string | number | boolean | null>>;
      limit: number;
    };
  });

export const adminGlobalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        term: z.string().min(2).max(200),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_system");
    console.log("[admin-db] global search request", { term: data.term, limit: data.limit });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any).rpc("admin_global_search", {
      _term: data.term,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    console.log("[admin-db] global search response", { count: rows?.length ?? 0 });
    return (rows ?? []) as Array<{ table_name: string; id: string; snippet: string }>;
  });