// Student-facing Exam Batch ban screen. Rendered by the exam-batch layout
// whenever `getExamBatchAccessState` reports one or more active bans. It
// blocks ONLY the Exam Batch module — the rest of the site (Dashboard,
// Quiz, Mock, MCQ Practice, etc.) stays fully accessible.

import { format } from "date-fns";
import {
  ShieldOff,
  Ban,
  Clock,
  Info,
  AlertTriangle,
  MessageCircle,
  Home,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ExamBatchAccessDecision, ExamBatchBanInfo } from "@/lib/exam-batch/attendance.types";

function safeFmt(iso: string | null | undefined, fallback = "—") {
  if (!iso) return fallback;
  try {
    return format(new Date(iso), "PPpp");
  } catch {
    return fallback;
  }
}

function banDurationLabel(ban: ExamBatchBanInfo): string {
  if (!ban.bannedUntil) return "Permanent";
  try {
    const end = new Date(ban.bannedUntil).getTime();
    const now = Date.now();
    const diffMs = end - now;
    if (diffMs <= 0) return "Expired";
    const days = Math.ceil(diffMs / 86_400_000);
    if (days === 1) return "1 day remaining";
    if (days < 30) return `${days} days remaining`;
    const months = Math.round(days / 30);
    return `${months} month${months === 1 ? "" : "s"} remaining`;
  } catch {
    return "Scheduled";
  }
}

function normalizeWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

export function StudentExamBatchBanPage({ decision }: { decision: ExamBatchAccessDecision }) {
  const primary = decision.ban;
  const others = decision.bans.slice(1);
  const waHref = normalizeWhatsapp(decision.whatsappContact ?? primary?.whatsappContact ?? null);
  const waLabel =
    decision.whatsappButtonText?.trim() ||
    primary?.whatsappButtonText?.trim() ||
    "Contact on WhatsApp";

  const title = primary?.title ?? "Exam Batch Access Restricted";
  const message = primary?.message ?? "Your Exam Batch access is currently suspended.";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="glass shadow-card-soft overflow-hidden rounded-3xl border border-destructive/30">
        {/* Hero */}
        <div className="relative bg-gradient-to-br from-destructive/20 via-destructive/10 to-background p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
              <ShieldOff className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-destructive">
                Access Restricted
              </p>
              <h1 className="mt-1 font-display text-2xl font-bold leading-tight sm:text-3xl">
                {title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">{message}</p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="grid gap-3 border-t border-border/60 p-5 sm:grid-cols-2 sm:p-6">
          <DetailTile
            icon={Info}
            label="Reason"
            value={primary?.reason ?? "—"}
            tone="warn"
          />
          <DetailTile
            icon={Ban}
            label="Ban Type"
            value={primary?.autoBanned ? "Auto-banned" : "Manually banned"}
            tone={primary?.autoBanned ? "warn" : "danger"}
          />
          <DetailTile
            icon={Clock}
            label="Ban Date"
            value={safeFmt(primary?.banDate ?? null)}
          />
          <DetailTile
            icon={Clock}
            label="Ban Duration"
            value={primary ? banDurationLabel(primary) : "—"}
            tone={primary?.bannedUntil ? "warn" : "danger"}
          />
          {primary?.bannedUntil && (
            <DetailTile
              icon={Clock}
              label="Ban Ends"
              value={safeFmt(primary.bannedUntil)}
              className="sm:col-span-2"
            />
          )}
          {primary?.sessionTitle && (
            <DetailTile icon={Info} label="Session" value={primary.sessionTitle} />
          )}
          {primary?.subjectName && (
            <DetailTile icon={Info} label="Subject" value={primary.subjectName} />
          )}
        </div>

        {/* Suggested action */}
        {primary?.suggestedAction && (
          <div className="border-t border-border/60 bg-amber-500/5 p-5 sm:p-6">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <p className="text-sm text-foreground/90">{primary.suggestedAction}</p>
            </div>
          </div>
        )}

        {/* Contact Administrator */}
        <div className="border-t border-border/60 p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Need assistance?
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold">
            Contact the Exam Batch Administrator
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Our team can review your case and restore Exam Batch access after
            verification.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 sm:flex-none"
              >
                <MessageCircle className="h-5 w-5" />
                {waLabel}
              </a>
            ) : null}
            <Link
              to={"/dashboard" as never}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-input bg-background/60 px-6 py-3 text-sm font-semibold hover:bg-muted"
            >
              <Home className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </div>
          {!waHref && (
            <p className="mt-3 text-xs text-muted-foreground">
              Ask your admin to configure a WhatsApp contact number so students
              can reach out directly from this screen.
            </p>
          )}
        </div>

        {/* Other active bans */}
        {others.length > 0 && (
          <div className="border-t border-border/60 p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Other active bans
            </p>
            <ul className="mt-2 space-y-2">
              {others.map((b, i) => (
                <li
                  key={`${b.sessionId}::${b.subjectId}::${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 p-3 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{b.subjectName ?? "Subject"}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {b.sessionTitle ?? "Session"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      b.autoBanned
                        ? "bg-amber-500/15 text-amber-500"
                        : "bg-destructive/15 text-destructive",
                    )}
                  >
                    {banDurationLabel(b)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailTile({
  icon: Icon,
  label,
  value,
  tone = "default",
  className,
}: {
  icon: typeof ShieldOff;
  label: string;
  value: string;
  tone?: "default" | "danger" | "warn";
  className?: string;
}) {
  const toneCls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-500"
        : "text-primary";
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-background/40 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", toneCls)} />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}
