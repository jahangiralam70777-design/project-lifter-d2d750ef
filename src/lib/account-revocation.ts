/* eslint-disable @typescript-eslint/no-explicit-any */

export type AccountRevocationReason = "deleted" | "banned" | "suspended" | "missing";

/**
 * Publish an account-revocation event.
 *
 * Two writes happen:
 *  1. CRITICAL: insert into `account_status_events` — the canonical audit
 *     record. If this fails, the revocation has NOT been persisted; we
 *     throw so the calling admin server function surfaces a real error
 *     to the Admin UI instead of a false success.
 *  2. BEST-EFFORT: upsert a marker into `user_sessions.active_session_id`
 *     to nudge any currently-connected device to drop its session via the
 *     SingleSession Realtime guard. AccountStatusGuard independently
 *     re-checks `is_user_banned` / profile state on every probe, so a
 *     missed marker only delays the kick by one probe cycle — it never
 *     leaves a banned user permanently authenticated.
 */
export async function publishAccountRevocation(
  supabaseAdmin: any,
  input: {
    userId: string;
    reason: AccountRevocationReason;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const now = new Date().toISOString();
  const marker = `revoked:${input.reason}:${Date.now()}`;

  // --- 1. CRITICAL write: audit event ---------------------------------
  // Await directly so any thrown error or returned `{ error }` envelope
  // propagates up to the caller. Do NOT wrap in allSettled.
  let eventErr: unknown = null;
  try {
    const { error } = await supabaseAdmin.from("account_status_events").insert({
      user_id: input.userId,
      reason: input.reason,
      created_by: input.actorId ?? null,
      metadata: input.metadata ?? {},
      created_at: now,
    });
    if (error) eventErr = error;
  } catch (err) {
    eventErr = err;
  }
  if (eventErr) {
    const msg =
      (eventErr as { message?: string } | null)?.message ??
      String(eventErr ?? "unknown error");
    console.error("[account-revocation] failed to record status event", {
      userId: input.userId,
      reason: input.reason,
      error: msg,
    });
    throw new Error(`Failed to record account status event: ${msg}`);
  }

  // --- 2. BEST-EFFORT write: session-revocation marker ----------------
  // A failure here only means the in-tab Realtime kick may be delayed;
  // AccountStatusGuard's periodic probes still enforce the revocation.
  try {
    const { error } = await supabaseAdmin.from("user_sessions").upsert(
      {
        user_id: input.userId,
        active_session_id: marker,
        user_agent: `admin:${input.reason}`,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.warn(
        "[account-revocation] session marker upsert failed (non-fatal)",
        { userId: input.userId, reason: input.reason, error: error.message },
      );
    }
  } catch (err) {
    console.warn(
      "[account-revocation] session marker upsert threw (non-fatal)",
      { userId: input.userId, reason: input.reason, error: (err as Error)?.message ?? err },
    );
  }
}
