import * as React from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * TitleWithTooltip
 * Truncates long text with ellipsis and reveals the full content on hover.
 * Use anywhere a dynamic title/label could grow unexpectedly long.
 */
export interface TitleWithTooltipProps extends React.HTMLAttributes<HTMLSpanElement> {
  text: string;
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3" | "h4";
  clamp?: 1 | 2;
}

export const TitleWithTooltip = React.forwardRef<HTMLSpanElement, TitleWithTooltipProps>(
  ({ text, as: Tag = "span", clamp = 1, className, ...rest }, ref) => {
    const Inner = Tag as React.ElementType;
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Inner
              ref={ref as never}
              className={cn(
                "block min-w-0 max-w-full",
                clamp === 1 ? "truncate-safe" : "line-clamp-2-safe",
                className,
              )}
              title={text}
              {...rest}
            >
              {text}
            </Inner>
          </TooltipTrigger>
          <TooltipContent className="max-w-[min(90vw,420px)] break-words">{text}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
TitleWithTooltip.displayName = "TitleWithTooltip";

/**
 * ResponsiveListItem
 * Standard row layout: [leading] [title/subtitle - flex-grow + truncated] [actions - pinned right].
 * Guarantees actions stay visible no matter how long the title is.
 */
export interface ResponsiveListItemProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "title"
> {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

export const ResponsiveListItem = React.forwardRef<HTMLDivElement, ResponsiveListItemProps>(
  ({ leading, title, subtitle, meta, actions, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "row-safe rounded-lg border border-border/40 bg-card/40 px-3 py-2.5",
        "flex-wrap sm:flex-nowrap",
        className,
      )}
      {...rest}
    >
      {leading ? <div className="flex-none">{leading}</div> : null}
      <div className="row-safe-grow">
        {typeof title === "string" ? (
          <TitleWithTooltip text={title} className="font-medium" />
        ) : (
          <div className="min-w-0 truncate-safe font-medium">{title}</div>
        )}
        {subtitle ? (
          <div className="min-w-0 truncate-safe text-xs text-muted-foreground">{subtitle}</div>
        ) : null}
        {meta ? (
          <div className="min-w-0 truncate-safe text-xs text-muted-foreground">{meta}</div>
        ) : null}
      </div>
      {actions ? <div className="row-safe-actions">{actions}</div> : null}
    </div>
  ),
);
ResponsiveListItem.displayName = "ResponsiveListItem";

/**
 * ResponsiveCard
 * Card with built-in min-w-0 and overflow protection so badges/buttons
 * never get pushed out by long titles.
 */
export const ResponsiveCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...rest }, ref) => (
  <div
    ref={ref}
    className={cn(
      "min-w-0 max-w-full overflow-hidden rounded-xl border border-border/40 bg-card/50 p-4",
      className,
    )}
    {...rest}
  >
    {children}
  </div>
));
ResponsiveCard.displayName = "ResponsiveCard";

/**
 * DragSortableRow
 * Row with a permanently-visible drag handle on the left and pinned actions
 * on the right. The middle content scrolls/truncates safely no matter the title length.
 */
export interface DragSortableRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  isDragging?: boolean;
}

export const DragSortableRow = React.forwardRef<HTMLDivElement, DragSortableRowProps>(
  ({ dragHandleProps, title, subtitle, actions, isDragging, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "row-safe rounded-lg border border-border/40 bg-card/40 px-2 py-2 transition-shadow",
        isDragging && "shadow-glow ring-1 ring-primary/40",
        className,
      )}
      {...rest}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        {...dragHandleProps}
        className={cn(
          "flex-none cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted/60 active:cursor-grabbing",
          dragHandleProps?.className,
        )}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="row-safe-grow">
        {typeof title === "string" ? (
          <TitleWithTooltip text={title} className="font-medium" />
        ) : (
          <div className="min-w-0 truncate-safe font-medium">{title}</div>
        )}
        {subtitle ? (
          <div className="min-w-0 truncate-safe text-xs text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div className="row-safe-actions">{actions}</div> : null}
    </div>
  ),
);
DragSortableRow.displayName = "DragSortableRow";
