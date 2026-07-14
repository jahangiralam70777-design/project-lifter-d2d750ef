import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { publicGetHomepageContent, publicGetSiteSettings } from "@/lib/site-management.functions";

/**
 * Public read hooks for the admin-managed site content.
 *
 * These read ONLY published columns (drafts never leak) and are cached by
 * React Query with a long staleTime; the realtime invalidator
 * (`useRealtimeInvalidator`) invalidates the `site-content` / `site-settings`
 * query keys whenever `homepage_sections` / `site_settings` rows change, so
 * admin publishes appear on the public site within seconds without any
 * manual refresh.
 *
 * Components should always pass a `fallback` so the UI degrades gracefully
 * to its existing hardcoded copy if the section/setting hasn't been
 * configured yet.
 */

export const SITE_CONTENT_KEY = ["site-content"] as const;
export const SITE_SETTINGS_KEY = ["site-settings"] as const;

export type SectionEntry = {
  key: string;
  position: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: Record<string, any>;
  publishedAt: string | null;
};

export function useHomepageSections() {
  return useQuery({
    queryKey: SITE_CONTENT_KEY,
    queryFn: async () => {
      try {
        const res = await publicGetHomepageContent();
        return res.sections as SectionEntry[];
      } catch {
        return [] as SectionEntry[];
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useSiteSettings() {
  return useQuery({
    queryKey: SITE_SETTINGS_KEY,
    queryFn: async () => {
      try {
        const res = await publicGetSiteSettings();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return res.settings as Record<string, Record<string, any>>;
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return {} as Record<string, Record<string, any>>;
      }
    },
    // Short stale time + window-focus refetch acts as a safety net so notice
    // banner / live chat / whatsapp settings stay in sync even if the realtime
    // publication is briefly unavailable.
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30_000,
  });
}

/** Get a single section's content, falling back to a defaults object. */
export function useSection<T extends object>(key: string, fallback: T): T {
  const { data } = useHomepageSections();
  return useMemo(() => {
    const found = data?.find((s) => s.key === key && s.content);
    if (!found) return fallback;
    return { ...fallback, ...(found.content as object) } as T;
  }, [data, key, fallback]);
}

/** Get a single setting's value, falling back. */
export function useSetting<T extends object>(key: string, fallback: T): T {
  const { data } = useSiteSettings();
  return useMemo(() => {
    const v = data?.[key];
    if (!v) return fallback;
    return { ...fallback, ...(v as object) } as T;
  }, [data, key, fallback]);
}
