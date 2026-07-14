import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getAuthControls, type AuthControls } from "@/lib/auth-controls.functions";

const QUERY_KEY = ["auth-controls"] as const;

export function useAuthControls() {
  const fetchFn = useServerFn(getAuthControls);
  const qc = useQueryClient();

  const query = useQuery<AuthControls>({
    queryKey: QUERY_KEY,
    queryFn: () => fetchFn(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel("auth-controls-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auth_access_controls" },
        () => {
          qc.invalidateQueries({ queryKey: QUERY_KEY });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  // Also refresh roughly when the next auto-enable timestamp passes,
  // so the maintenance screen flips to the live form without manual reload.
  useEffect(() => {
    const data = query.data;
    if (!data) return;
    const next = [data.login_auto_enable_at, data.signup_auto_enable_at]
      .filter(Boolean)
      .map((t) => new Date(t as string).getTime())
      .filter((t) => t > Date.now())
      .sort()[0];
    if (!next) return;
    const delay = Math.min(next - Date.now() + 500, 2_147_483_000);
    const id = window.setTimeout(() => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    }, Math.max(delay, 1000));
    return () => window.clearTimeout(id);
  }, [query.data, qc]);

  return query;
}