// Phase-4 — Publish protection layer.
// Final guard run before invoking editor_publish_page. Prevents accidental
// overwrites by detecting stale drafts and version mismatches.

export interface PublishGuardInput {
  localVersionId: string;
  localUpdatedAt: number;
  remoteVersionId: string | null;
  remoteUpdatedAt: number | null;
  remotePublishedVersionId: string | null;
  sectionCount: number;
}

export type PublishGuardSeverity = "ok" | "warn" | "block";

export interface PublishGuardResult {
  severity: PublishGuardSeverity;
  reasons: string[];
  requiresConfirmation: boolean;
}

const STALE_DRAFT_MS = 10 * 60 * 1000; // 10 minutes

export function evaluatePublishGuard(input: PublishGuardInput): PublishGuardResult {
  const reasons: string[] = [];
  let severity: PublishGuardSeverity = "ok";

  if (input.sectionCount === 0) {
    reasons.push("Draft contains no sections — publishing will clear the live page.");
    severity = "block";
  }

  if (input.remoteVersionId && input.remoteVersionId !== input.localVersionId) {
    reasons.push(
      "Another admin has saved a newer draft. Reload before publishing to avoid overwriting their work.",
    );
    severity = "block";
  }

  if (
    input.remoteUpdatedAt &&
    Date.now() - input.localUpdatedAt > STALE_DRAFT_MS &&
    input.remoteUpdatedAt > input.localUpdatedAt
  ) {
    reasons.push("Your local draft is stale (older than 10 minutes).");
    if (severity === "ok") severity = "warn";
  }

  if (input.remotePublishedVersionId === input.localVersionId) {
    reasons.push("This version is already published — nothing to do.");
    if (severity === "ok") severity = "warn";
  }

  return {
    severity,
    reasons,
    requiresConfirmation: severity !== "ok",
  };
}
