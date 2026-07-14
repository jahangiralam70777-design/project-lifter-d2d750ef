import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

interface LegalPageProps {
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}

export function LegalPage({ title, intro, updated, sections }: LegalPageProps) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-hero-glow opacity-50" />
      <div className="pointer-events-none fixed left-10 top-20 -z-10 h-72 w-72 rounded-full bg-[var(--neon-purple)]/15 blur-3xl" />
      <div className="pointer-events-none fixed right-10 bottom-10 -z-10 h-80 w-80 rounded-full bg-[var(--neon-blue)]/15 blur-3xl" />

      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <header className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Legal
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">{intro}</p>
          <p className="mt-3 text-xs text-muted-foreground/80">Last updated: {updated}</p>
        </header>

        <div className="glass-card mt-10 rounded-3xl p-6 sm:p-10">
          <div className="space-y-10">
            {sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Content is being updated. Please check back soon.
              </p>
            ) : (
              sections.map((s, i) => (
                <section key={s.heading}>
                  <h2 className="text-xl font-semibold tracking-tight">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {s.heading}
                  </h2>
                  <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/85">
                    {s.body}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Questions? Email{" "}
          <a className="underline hover:text-foreground" href="mailto:legal@caaspirebd.xyz">
            legal@caaspirebd.xyz
          </a>
        </p>
      </div>
    </div>
  );
}
