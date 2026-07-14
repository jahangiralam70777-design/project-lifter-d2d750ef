// Shared, presentational Verification content. Rendered by BOTH the
// real Student Verification page AND the Admin "Verification Content"
// preview so the two views can never drift.
//
// Given a `ContentSettings` object (from `public-settings.functions.ts`
// or an in-memory admin draft) this renders:
//   * Follow / Join / Subscribe (Facebook Page, Facebook Group, YouTube)
//   * WhatsApp panel with the configured number + button text
//   * Verification instructions
//   * Help text
//
// When `content.verificationVisible === false` it instead renders the
// exact "Verification page hidden" state students will see.
//
// This file is purely presentational — no data fetching, no mutations.

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Facebook,
  Users,
  Youtube,
  MessageCircle,
  ShieldOff,
  Info,
  HelpCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard, primaryBtnCls } from "./kit";
import type { ContentSettings } from "@/lib/exam-batch/settings.types";

// Sensible fallbacks — used only when the admin has not configured a value
// yet. Never fake data; these are neutral labels.
const DEFAULTS = {
  whatsappButtonText: "Open WhatsApp",
  verificationInstructions:
    "Complete these quick steps to verify your identity and unlock your batch.",
  verificationHelpText:
    "Need help? Follow the pages above, then send your full name to the WhatsApp number.",
  pendingTitle: "Pending approval",
  pendingDescription:
    "Your enrollment has been submitted. An admin will review and approve shortly.",
  verificationSuccessMessage: "Submitted for approval.",
  verificationHiddenMessage:
    "The verification page is temporarily unavailable. Please check back later.",
};

export function resolveContent(content: ContentSettings | null | undefined) {
  const c = content ?? {};
  return {
    facebookPageUrl: c.facebookPageUrl ?? null,
    facebookGroupUrl: c.facebookGroupUrl ?? null,
    youtubeChannelUrl: c.youtubeChannelUrl ?? null,
    whatsappContact: c.whatsappContact ?? null,
    whatsappButtonText: c.whatsappButtonText || DEFAULTS.whatsappButtonText,
    verificationInstructions:
      c.verificationInstructions || DEFAULTS.verificationInstructions,
    verificationHelpText:
      c.verificationHelpText || DEFAULTS.verificationHelpText,
    pendingTitle: c.pendingTitle || DEFAULTS.pendingTitle,
    pendingDescription: c.pendingDescription || DEFAULTS.pendingDescription,
    verificationSuccessMessage:
      c.verificationSuccessMessage || DEFAULTS.verificationSuccessMessage,
    verificationHiddenMessage:
      c.verificationHiddenMessage || DEFAULTS.verificationHiddenMessage,
    verificationVisible: c.verificationVisible !== false,
  };
}

export type ResolvedContent = ReturnType<typeof resolveContent>;

type SocialLink = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  cta: string;
  href: string | null;
  toneClass: string;
};

function buildSocials(c: ResolvedContent): SocialLink[] {
  return [
    {
      id: "fb-page",
      icon: Facebook,
      title: "Facebook Page",
      description:
        "Like our official Facebook page for exam updates and results.",
      cta: "Visit Page",
      href: c.facebookPageUrl,
      toneClass: "from-blue-500 to-indigo-500",
    },
    {
      id: "fb-group",
      icon: Users,
      title: "Facebook Group",
      description:
        "Join the batch community group to discuss and ask questions.",
      cta: "Visit Group",
      href: c.facebookGroupUrl,
      toneClass: "from-indigo-500 to-purple-500",
    },
    {
      id: "youtube",
      icon: Youtube,
      title: "YouTube Channel",
      description: "Subscribe for lectures, walkthroughs and exam strategies.",
      cta: "Visit Channel",
      href: c.youtubeChannelUrl,
      toneClass: "from-rose-500 to-red-500",
    },
  ];
}

export function VerificationHiddenState({
  message,
}: {
  message: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-8 text-center"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-cta-gradient opacity-20 blur-3xl" />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground ring-1 ring-inset ring-border/60">
          <ShieldOff className="h-8 w-8" />
        </span>
        <div>
          <p className="font-display text-xl font-bold">
            Verification unavailable
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </motion.div>
  );
}

export function VerificationBody({
  content,
  interactive = true,
  aside,
}: {
  content: ContentSettings | null | undefined;
  /**
   * When false, external links are rendered as non-clickable buttons so
   * previews inside admin do not navigate away.
   */
  interactive?: boolean;
  /**
   * The right-hand sidebar (enrollment summary + submit CTA on the real
   * page, a summary placeholder in preview mode). When omitted the layout
   * collapses to a single column.
   */
  aside?: ReactNode;
}) {
  const c = resolveContent(content);

  if (!c.verificationVisible) {
    return <VerificationHiddenState message={c.verificationHiddenMessage} />;
  }

  const socials = buildSocials(c);
  const whatsappHref = c.whatsappContact
    ? `https://wa.me/${c.whatsappContact.replace(/[^0-9]/g, "")}`
    : null;

  const renderCta = (href: string | null, label: string, icon: ReactNode) => {
    const disabled = !href || !interactive;
    if (!href || !interactive) {
      return (
        <button
          type="button"
          disabled={disabled}
          className={cn(
            primaryBtnCls,
            "shrink-0",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          {label} {icon}
        </button>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(primaryBtnCls, "shrink-0")}
      >
        {label} {icon}
      </a>
    );
  };

  return (
    <div className={cn("grid grid-cols-1 gap-4", aside && "lg:grid-cols-3")}>
      <div className={cn("space-y-4", aside && "lg:col-span-2")}>
        {c.verificationInstructions && (
          <SectionCard title="Verification steps" description={undefined}>
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="whitespace-pre-wrap leading-relaxed">
                {c.verificationInstructions}
              </p>
            </div>
          </SectionCard>
        )}

        <SectionCard
          title="Follow / Join / Subscribe"
          description="Visit each link and complete the action."
        >
          <ul className="grid grid-cols-1 gap-3">
            {socials.map((s) => {
              const Icon = s.icon;
              const notConfigured = !s.href;
              return (
                <li
                  key={s.id}
                  className="glass shadow-card-soft flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-glow ${s.toneClass}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold">
                        {s.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {notConfigured
                          ? "Not configured yet."
                          : s.description}
                      </p>
                    </div>
                  </div>
                  {renderCta(
                    s.href,
                    s.cta,
                    <MessageCircle className="hidden h-4 w-4" />,
                  )}
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl shadow-card-soft"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500" />
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-black/20 blur-3xl" />
          <div className="relative flex flex-col gap-4 p-6 text-white sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white/15 backdrop-blur">
              <MessageCircle className="h-8 w-8" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/80">
                WhatsApp
              </p>
              <p className="font-display text-lg font-bold tabular-nums">
                {c.whatsappContact ?? "Not configured"}
              </p>
              <p className="mt-1 text-xs text-white/85">
                Complete the above steps and send your Name through WhatsApp.
              </p>
            </div>
            {whatsappHref && interactive ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-white/90"
              >
                <MessageCircle className="h-4 w-4" /> {c.whatsappButtonText}
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex shrink-0 cursor-not-allowed items-center gap-2 rounded-xl bg-white/90 px-4 py-2.5 text-sm font-bold text-emerald-700 opacity-80"
              >
                <MessageCircle className="h-4 w-4" /> {c.whatsappButtonText}
              </button>
            )}
          </div>
        </motion.div>

        {c.verificationHelpText && (
          <div className="glass shadow-card-soft flex items-start gap-3 rounded-3xl p-4">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HelpCircle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold">Need help?</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {c.verificationHelpText}
              </p>
            </div>
          </div>
        )}
      </div>

      {aside}
    </div>
  );
}
