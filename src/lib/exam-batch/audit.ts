// Best-effort audit logger for Exam Batch. Never blocks the caller — a
// logging failure is recorded to server logs so silent breakage is visible.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AuditAction =
  | "session.create"
  | "session.update"
  | "session.delete"
  | "session.archive"
  | "session.hide"
  | "session.set_active"
  | "session.set_registration"
  | "enroll"
  | "approve"
  | "reject"
  | "remove"
  | "set_status.pending"
  | "set_status.approved"
  | "set_status.rejected"
  | "set_status.banned"
  | "subject.add"
  | "subject.add.bulk"
  | "subject.remove"
  | "subject.remove.bulk"
  | "student_id.assign"
  | "exam.create"
  | "exam.update"
  | "exam.delete"
  | "exam.publish"
  | "exam.archive"
  | "exam.hide"
  | "exam.force_close"
  | "exam.set_questions"
  | "attempt.start"
  | "attempt.resume"
  | "attempt.answer_save"
  | "attempt.answer_change"
  | "attempt.submit_manual"
  | "attempt.submit_auto"
  | "attempt.submit_timeout"
  | "attempt.submit_admin"
  | "result.score"
  | "leaderboard.publish"
  | "leaderboard.delete"
  | "leaderboard.recalculate"
  | "analytics.generate"
  | "progress.update"
  | "history.view"
  | "settings.update"
  | "visibility.change"
  | "content.update"
  | "comment_rules.replace"
  | "export.generate"
  | "export.download"
  | "attendance.missed"
  | "attendance.counter_increment"
  | "attendance.counter_decrement"
  | "attendance.counter_set"
  | "attendance.counter_reset"
  | "attendance.auto_ban"
  | "attendance.manual_ban"
  | "attendance.manual_unban"
  | "attendance.process_exam"
  | "attendance.settings.update"
  | "academic.level.upsert"
  | "academic.level.delete"
  | "academic.subject.create"
  | "academic.subject.update"
  | "academic.subject.delete"
  | "academic.chapter.create"
  | "academic.chapter.update"
  | "academic.chapter.delete"
  | "mcq.create"
  | "mcq.update"
  | "mcq.delete"
  | "mcq.bulk_import";

export type AuditEntity =
  | "session"
  | "enrollment"
  | "subject"
  | "student_id"
  | "exam"
  | "attempt"
  | "leaderboard"
  | "analytics"
  | "progress"
  | "settings"
  | "content"
  | "visibility"
  | "comment_rules"
  | "export"
  | "attendance"
  | "level"
  | "chapter"
  | "mcq";

export async function audit(
  supabase: any,
  actorId: string | null,
  action: AuditAction,
  entity: AuditEntity,
  entityId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await supabase.from("exam_batch_audit_log").insert({
      actor_id: actorId,
      action,
      entity,
      entity_id: entityId,
      metadata,
    });
    if (error) {
      console.error("[exam-batch:audit-log-fail]", { action, entity, entityId, message: error.message });
    }
  } catch (err) {
    console.error("[exam-batch:audit-log-fail]", { action, entity, entityId, err });
  }
}
