import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * AuthCard — generic frame for sign-in / sign-up / reset forms.
 * Provides title, subtitle, body, and footer slots with consistent spacing.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm backdrop-blur-2xl sm:p-8",
        className,
      )}
    >
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </header>
      <div>{children}</div>
      {footer && <footer className="mt-6 text-center text-xs text-muted-foreground">{footer}</footer>}
    </section>
  );
}
