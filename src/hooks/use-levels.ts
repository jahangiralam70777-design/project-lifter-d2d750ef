import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLevels } from "@/lib/learning.functions";

export type LevelRow = {
  code: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_locked?: boolean;
};

/**
 * Returns admin-managed levels in real-time. Realtime invalidator
 * already invalidates ["levels"] when levels table changes.
 *
 * Levels with status="archived" are surfaced as is_locked=true so
 * UIs can render a lock badge instead of hiding them. Pass
 * { includeLocked: false } to filter them out (default behaviour
 * for non-MCQ flows that historically only saw "published").
 */
export function useLevels(options?: { includeLocked?: boolean }) {
  const includeLocked = options?.includeLocked ?? false;
  const fn = useServerFn(listLevels);
  return useQuery({
    queryKey: ["levels", includeLocked ? "all" : "active"],
    queryFn: async () => {
      const rows = (await fn()) as LevelRow[];
      return includeLocked ? rows : rows.filter((l) => !l.is_locked);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}
