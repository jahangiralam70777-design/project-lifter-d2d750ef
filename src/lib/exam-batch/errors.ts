// Typed errors + a Supabase-error mapper so every server function returns a
// consistent, professional error surface without leaking Postgres internals.

export class ExamBatchError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ExamBatchError";
  }
}

export const errors = {
  notFound: (what: string) => new ExamBatchError("NOT_FOUND", `${what} not found.`),
  forbidden: (why = "You do not have access to this resource.") =>
    new ExamBatchError("FORBIDDEN", why),
  invalidState: (why: string) => new ExamBatchError("INVALID_STATE", why),
  conflict: (why: string) => new ExamBatchError("CONFLICT", why),
  guest: () => new ExamBatchError("AUTH_REQUIRED", "You must be signed in to continue."),
  sessionExpired: () =>
    new ExamBatchError(
      "AUTH_REQUIRED",
      "Your session has expired. Please sign in again to continue.",
    ),
  backendMissing: () =>
    new ExamBatchError(
      "BACKEND_UNAVAILABLE",
      "The Exam Batch backend is not yet provisioned. Please try again shortly.",
    ),
};

// Supabase Postgrest error mapper. Never leak `message` details to the client
// — surface a stable, user-friendly reason and log the raw error server-side.
export function mapSupabaseError(
  err: { code?: string; message?: string; details?: string | null; hint?: string | null } | null | undefined,
  ctx: string,
): never {
  if (!err) throw new ExamBatchError("UNKNOWN", `Unexpected failure in ${ctx}.`);
  const code = err.code ?? "";
  console.error(`[exam-batch] ${ctx} failed`, {
    code,
    message: err.message,
    details: err.details,
    hint: err.hint,
  });

  // Diagnostic suffix so the browser toast reveals the ACTUAL Postgres /
  // PostgREST code without leaking SQL. Removing once the module is stable
  // is safe — the server log above already captures the full detail.
  const diag = code ? ` [${ctx}:${code}]` : ` [${ctx}]`;

  if (
    code === "42P01" || code === "42883" || code === "42703" ||
    code === "PGRST202" || code === "PGRST205"
  ) {
    throw new ExamBatchError("BACKEND_UNAVAILABLE",
      `The Exam Batch backend is not yet provisioned. Please try again shortly.${diag}`);
  }
  if (code === "23505") throw new ExamBatchError("CONFLICT", `This action would create a duplicate record.${diag}`);
  if (code === "23503") throw new ExamBatchError("INVALID_STATE", `Referenced record no longer exists.${diag}`);
  if (code === "23514" || code === "23502") throw new ExamBatchError("INVALID_STATE", `Invalid data submitted.${diag}`);
  if (code === "PGRST301" || code === "PGRST302" || code === "PGRST303") {
    throw new ExamBatchError("AUTH_REQUIRED",
      `Your session has expired. Please sign in again to continue.${diag}`);
  }
  if (code === "42501") {
    // Postgres insufficient_privilege. Postgres' hint typically names the
    // missing GRANT EXECUTE target — surface it so we can see which
    // function inside the RLS chain is unreachable.
    const hint = err.hint ? ` hint: ${err.hint}` : "";
    throw new ExamBatchError("FORBIDDEN",
      `You do not have access to this resource.${diag}${hint}`);
  }
  if (code === "PGRST116") throw new ExamBatchError("NOT_FOUND", `Record not found.${diag}`);

  throw new ExamBatchError("UNKNOWN", `Operation failed: ${ctx}.${diag} ${err.message ?? ""}`.trim());
}
