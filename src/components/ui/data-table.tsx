import { type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
};

/**
 * DataTable — opinionated table wrapper with sticky header, loading
 * skeletons, empty state, and responsive horizontal scroll. Keep markup
 * semantic so screen readers announce rows correctly.
 */
export function DataTable<T>({
  data,
  columns,
  rowKey,
  loading = false,
  emptyTitle = "Nothing to show yet",
  emptyDescription,
  caption,
  className,
}: {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T, i: number) => string | number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  caption?: string;
  className?: string;
}) {
  if (!loading && data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={cn("relative w-full overflow-x-auto rounded-xl border border-border", className)}>
      <Table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={c.headerClassName} scope="col">
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : data.map((row, i) => (
                <TableRow key={rowKey(row, i)}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
