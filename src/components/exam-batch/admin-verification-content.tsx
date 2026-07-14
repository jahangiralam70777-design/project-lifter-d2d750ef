// Admin "Verification Content" page — authored copy, links, WhatsApp
// number/button, pending page text, help text, success message + a
// Show/Hide toggle for the entire Student Verification page.
//
// Uses the SAME `VerificationBody` the student page renders, so the live
// preview and the real page are guaranteed to look identical.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor, Smartphone, Eye, Save, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader, SectionCard, primaryBtnCls, ghostBtnCls } from "./kit";
import { VerificationBody } from "./verification-view";
import {
  adminGetExamBatchSettings,
  adminUpdateExamBatchSettings,
} from "@/lib/exam-batch/admin-settings.functions";
import type { ContentSettings } from "@/lib/exam-batch/settings.types";

const DRAFT_STORAGE_KEY = "exam-batch:verification-content:draft";

const EMPTY_DRAFT: ContentSettings = {
  facebookPageUrl: "",
  facebookGroupUrl: "",
  youtubeChannelUrl: "",
  whatsappContact: "",
  whatsappButtonText: "",
  verificationInstructions: "",
  pendingTitle: "",
  pendingDescription: "",
  verificationSuccessMessage: "",
  verificationHelpText: "",
  verificationVisible: true,
  verificationHiddenMessage: "",
};

function toDraft(c: ContentSettings | null | undefined): ContentSettings {
  const s = c ?? {};
  return {
    facebookPageUrl: s.facebookPageUrl ?? "",
    facebookGroupUrl: s.facebookGroupUrl ?? "",
    youtubeChannelUrl: s.youtubeChannelUrl ?? "",
    whatsappContact: s.whatsappContact ?? "",
    whatsappButtonText: s.whatsappButtonText ?? "",
    verificationInstructions: s.verificationInstructions ?? "",
    pendingTitle: s.pendingTitle ?? "",
    pendingDescription: s.pendingDescription ?? "",
    verificationSuccessMessage: s.verificationSuccessMessage ?? "",
    verificationHelpText: s.verificationHelpText ?? "",
    verificationVisible: s.verificationVisible !== false,
    verificationHiddenMessage: s.verificationHiddenMessage ?? "",
  };
}

// Normalize empty strings to null for the backend patch payload.
function toPatch(draft: ContentSettings): ContentSettings {
  const norm = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };
  return {
    facebookPageUrl: norm(draft.facebookPageUrl),
    facebookGroupUrl: norm(draft.facebookGroupUrl),
    youtubeChannelUrl: norm(draft.youtubeChannelUrl),
    whatsappContact: norm(draft.whatsappContact),
    whatsappButtonText: norm(draft.whatsappButtonText),
    verificationInstructions: norm(draft.verificationInstructions),
    pendingTitle: norm(draft.pendingTitle),
    pendingDescription: norm(draft.pendingDescription),
    verificationSuccessMessage: norm(draft.verificationSuccessMessage),
    verificationHelpText: norm(draft.verificationHelpText),
    verificationVisible: draft.verificationVisible !== false,
    verificationHiddenMessage: norm(draft.verificationHiddenMessage),
  };
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="mt-1 w-full rounded-xl border border-input bg-background/60 p-3 text-sm"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
        />
      )}
    </label>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-background/40 p-4">
      <div className="min-w-0">
        <p className="font-display text-sm font-semibold">{label}</p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition",
          value ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
            value ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function AdminVerificationContent() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["exam-batch", "admin", "settings"],
    queryFn: () => adminGetExamBatchSettings(),
  });

  const [draft, setDraft] = useState<ContentSettings>(EMPTY_DRAFT);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [initialized, setInitialized] = useState(false);

  // Hydrate the draft from the saved settings once they load.
  useEffect(() => {
    if (!initialized && settingsQuery.data) {
      setDraft(toDraft(settingsQuery.data.content));
      setInitialized(true);
    }
  }, [initialized, settingsQuery.data]);

  // Mirror the draft into sessionStorage so the Full Preview tab can
  // reflect unsaved changes instantly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify(draft),
      );
    } catch {
      /* ignore */
    }
  }, [draft]);

  const patchDraft = (patch: Partial<ContentSettings>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const saveMutation = useMutation({
    mutationFn: () =>
      adminUpdateExamBatchSettings({
        data: { content: toPatch(draft) },
      }),
    onSuccess: () => {
      toast.success("Verification content saved");
      void qc.invalidateQueries({ queryKey: ["exam-batch"] });
      void qc.invalidateQueries({ queryKey: ["exam-batch", "public-settings"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to save"),
  });

  const previewContent: ContentSettings = useMemo(
    () => toPatch(draft),
    [draft],
  );

  const openFullPreview = () => {
    if (typeof window === "undefined") return;
    window.open(
      "/admin/exam-batch/verification-preview",
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          eyebrow="Exam Batch · Admin"
          title="Verification Content"
          description="Author the copy, links and contact details students see on the verification page. Changes preview live and become active on save."
          icon={Eye}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={ghostBtnCls}
            onClick={openFullPreview}
          >
            <ExternalLink className="h-4 w-4" /> Full preview
          </button>
          <button
            type="button"
            className={primaryBtnCls}
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || settingsQuery.isLoading}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Editor */}
        <div className="space-y-4 xl:col-span-2">
          <SectionCard
            title="Visibility"
            description="Hide the verification page entirely — students see the hidden state below."
          >
            <div className="space-y-3">
              <ToggleRow
                label="Show verification page"
                description="Toggle off to temporarily hide the verification page from all students."
                value={draft.verificationVisible !== false}
                onChange={(v) => patchDraft({ verificationVisible: v })}
              />
              <TextField
                label="Hidden-state message"
                value={draft.verificationHiddenMessage ?? ""}
                onChange={(v) =>
                  patchDraft({ verificationHiddenMessage: v })
                }
                placeholder="The verification page is temporarily unavailable."
                multiline
              />
            </div>
          </SectionCard>

          <SectionCard title="Social links">
            <div className="space-y-3">
              <TextField
                label="Facebook page URL"
                value={draft.facebookPageUrl ?? ""}
                onChange={(v) => patchDraft({ facebookPageUrl: v })}
                placeholder="https://facebook.com/your-page"
              />
              <TextField
                label="Facebook group URL"
                value={draft.facebookGroupUrl ?? ""}
                onChange={(v) => patchDraft({ facebookGroupUrl: v })}
                placeholder="https://facebook.com/groups/your-group"
              />
              <TextField
                label="YouTube channel URL"
                value={draft.youtubeChannelUrl ?? ""}
                onChange={(v) => patchDraft({ youtubeChannelUrl: v })}
                placeholder="https://youtube.com/@your-channel"
              />
            </div>
          </SectionCard>

          <SectionCard title="WhatsApp">
            <div className="space-y-3">
              <TextField
                label="WhatsApp number"
                value={draft.whatsappContact ?? ""}
                onChange={(v) => patchDraft({ whatsappContact: v })}
                placeholder="+8801XXXXXXXXX"
              />
              <TextField
                label="WhatsApp button text"
                value={draft.whatsappButtonText ?? ""}
                onChange={(v) => patchDraft({ whatsappButtonText: v })}
                placeholder="Open WhatsApp"
              />
            </div>
          </SectionCard>

          <SectionCard title="Copy">
            <div className="space-y-3">
              <TextField
                label="Verification instructions"
                value={draft.verificationInstructions ?? ""}
                onChange={(v) =>
                  patchDraft({ verificationInstructions: v })
                }
                placeholder="Complete these quick steps to verify your identity…"
                multiline
              />
              <TextField
                label="Help text"
                value={draft.verificationHelpText ?? ""}
                onChange={(v) => patchDraft({ verificationHelpText: v })}
                placeholder="Need help? Send your full name on WhatsApp."
                multiline
              />
              <TextField
                label="Success message (toast after submit)"
                value={draft.verificationSuccessMessage ?? ""}
                onChange={(v) =>
                  patchDraft({ verificationSuccessMessage: v })
                }
                placeholder="Submitted for approval."
              />
            </div>
          </SectionCard>

          <SectionCard title="Pending page">
            <div className="space-y-3">
              <TextField
                label="Pending page title"
                value={draft.pendingTitle ?? ""}
                onChange={(v) => patchDraft({ pendingTitle: v })}
                placeholder="Pending approval"
              />
              <TextField
                label="Pending page description"
                value={draft.pendingDescription ?? ""}
                onChange={(v) => patchDraft({ pendingDescription: v })}
                placeholder="Your enrollment has been submitted…"
                multiline
              />
            </div>
          </SectionCard>
        </div>

        {/* Live preview */}
        <div className="xl:col-span-3">
          <SectionCard
            title="Live preview"
            description="Exactly what students will see. Changes appear instantly, no save required."
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex overflow-hidden rounded-full border border-border/60 bg-background/60 p-0.5">
                <button
                  type="button"
                  onClick={() => setDevice("desktop")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    device === "desktop"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Monitor className="h-3.5 w-3.5" /> Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setDevice("mobile")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    device === "mobile"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5" /> Mobile
                </button>
              </div>
              <span className="text-xs text-muted-foreground">
                {draft.verificationVisible === false
                  ? "Hidden state"
                  : "Visible state"}
              </span>
            </div>

            <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-3">
              <div
                className={cn(
                  "mx-auto transition-all",
                  device === "mobile"
                    ? "max-w-sm"
                    : "max-w-none",
                )}
              >
                <VerificationBody
                  content={previewContent}
                  interactive={false}
                />
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export function AdminVerificationFullPreview() {
  const settingsQuery = useQuery({
    queryKey: ["exam-batch", "admin", "settings"],
    queryFn: () => adminGetExamBatchSettings(),
  });

  const [draftContent, setDraftContent] = useState<ContentSettings | null>(
    null,
  );

  // Load the in-progress draft from sessionStorage so admins can preview
  // unsaved changes in the full-page view.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        setDraftContent(toPatch(JSON.parse(raw) as ContentSettings));
      }
    } catch {
      /* ignore */
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DRAFT_STORAGE_KEY || !e.newValue) return;
      try {
        setDraftContent(toPatch(JSON.parse(e.newValue) as ContentSettings));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const savedContent = settingsQuery.data?.content ?? null;
  const content = draftContent ?? savedContent;

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl space-y-4 bg-background p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Exam Batch · Preview"
        title="Verification (Student view)"
        description="Full-page preview of what students will see on /exam-batch/enrollment."
        icon={Eye}
      />
      <VerificationBody content={content} interactive={false} />
    </div>
  );
}
