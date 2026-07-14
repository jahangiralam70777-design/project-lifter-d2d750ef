import { Fragment, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; to?: string };

/**
 * AdminPageHeader — consistent page chrome for every admin route.
 * Renders breadcrumbs, page title, optional subtitle, and an actions slot.
 */
export function AdminPageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-border/60 pb-5",
        className,
      )}
    >
      <div className="min-w-0">
        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {breadcrumbs.map((c, i) => (
                <Fragment key={`${c.label}-${i}`}>
                  <li className="inline-flex items-center">
                    {c.to ? (
                      <Link
                        to={c.to as never}
                        className="hover:text-foreground focus-visible:outline-none focus-visible:underline"
                      >
                        {c.label}
                      </Link>
                    ) : (
                      <span aria-current="page" className="text-foreground">
                        {c.label}
                      </span>
                    )}
                  </li>
                  {i < breadcrumbs.length - 1 && (
                    <li aria-hidden="true">
                      <ChevronRight className="h-3 w-3" />
                    </li>
                  )}
                </Fragment>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="truncate font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
      )}
    </header>
  );
}
