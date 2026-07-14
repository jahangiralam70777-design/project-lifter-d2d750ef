// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";

export const MODULE_KEYS = [
  "mcq_practice",
  "quiz",
  "mock_test",
  "flash_cards",
  "short_notes",
  "qns_bank",
  "classes",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleVisibilityRow = {
  key: ModuleKey;
  label: string;
  hidden: boolean;
  updated_at: string;
};

const MODULE_LABELS: Record<ModuleKey, string> = {
  mcq_practice: "MCQ Practice",
  quiz: "Quiz",
  mock_test: "Mock Test",
  flash_cards: "Flash Cards",
  short_notes: "Short Notes",
  qns_bank: "Qns Bank",
  classes: "Classes",
};

const MANAGER_VISIBILITY_TABLE_BY_MODULE: Partial<Record<ModuleKey, string>> = {
  flash_cards: "flash_card_visibility",
  short_notes: "short_notes_visibility",
  qns_bank: "question_bank_visibility",
  classes: "video_class_visibility",
};

async function syncManagerSectionVisibility(
  supabase: unknown,
  key: ModuleKey,
  hidden: boolean,
  updatedAt: string,
) {
  const table = MANAGER_VISIBILITY_TABLE_BY_MODULE[key];
  if (!table) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from(table)
    .upsert({ id: 1, section_hidden: hidden, updated_at: updatedAt });
  if (error) throw error;
}

export async function syncModuleHiddenFlag(
  supabase: unknown,
  key: ModuleKey,
  hidden: boolean,
  updatedAt = new Date().toISOString(),
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("module_visibility")
    .update({ hidden, updated_at: updatedAt })
    .eq("key", key)
    .select("key")
    .maybeSingle();
  if (error) throw error;
  if (data) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (supabase as any)
    .from("module_visibility")
    .insert({ key, label: MODULE_LABELS[key], hidden, updated_at: updatedAt });
  if (insertError) throw insertError;
}

// Module-scoped singleton: avoids creating a new TCP-bearing client on every
// public visibility read. The publishable client has no session state, so it's
// safe to share across requests on the same Worker isolate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _publicClient: any | null = null;
async function getPublicClient() {
  if (_publicClient) return _publicClient;
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _publicClient = createClient<any>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  return _publicClient;
}

export const listModuleVisibility = createServerFn({ method: "GET" }).handler(async () => {
  // Public read. Use a server-side publishable client (NOT the browser client,
  // which touches localStorage and is unsafe on the Worker). Any failure here
  // must NOT bubble into the React tree — return [] on any unexpected error.
  try {
    const supabase = await getPublicClient();
    if (!supabase) {
      console.warn("listModuleVisibility: missing SUPABASE_URL/PUBLISHABLE_KEY; returning []");
      return [] as ModuleVisibilityRow[];
    }
    const [{ data, error }, flash, notes, qbank, classes] = await Promise.all([
      supabase
        .from("module_visibility")
        .select("key,label,hidden,updated_at")
        .order("label"),
      supabase
        .from("flash_card_visibility")
        .select("section_hidden,updated_at")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("short_notes_visibility")
        .select("section_hidden,updated_at")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("question_bank_visibility")
        .select("section_hidden,updated_at")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("video_class_visibility")
        .select("section_hidden,updated_at")
        .eq("id", 1)
        .maybeSingle(),
    ]);
    if (error) throw error;
    const sectionHidden: Partial<Record<ModuleKey, { hidden: boolean; updated_at?: string }>> = {
      flash_cards: {
        hidden: !!flash.data?.section_hidden,
        updated_at: flash.data?.updated_at,
      },
      short_notes: {
        hidden: !!notes.data?.section_hidden,
        updated_at: notes.data?.updated_at,
      },
      qns_bank: {
        hidden: !!qbank.data?.section_hidden,
        updated_at: qbank.data?.updated_at,
      },
      classes: {
        hidden: !!classes.data?.section_hidden,
        updated_at: classes.data?.updated_at,
      },
    };
    return ((data ?? []) as ModuleVisibilityRow[]).map((row) => {
      const manager = sectionHidden[row.key];
      if (!manager?.hidden) return row;
      return {
        ...row,
        hidden: true,
        updated_at: manager.updated_at ?? row.updated_at,
      };
    });
  } catch (e) {
    console.warn("listModuleVisibility failed; returning empty list:", e);
    return [] as ModuleVisibilityRow[];
  }
});

const setInput = z.object({
  key: z.enum(MODULE_KEYS),
  hidden: z.boolean(),
});

export const adminSetModuleHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof setInput>) => setInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_system",
      "set_module_visibility",
      { key: data.key, hidden: data.hidden },
    );
    const updatedAt = new Date().toISOString();
    await syncModuleHiddenFlag(context.supabase, data.key, data.hidden, updatedAt);
    await syncManagerSectionVisibility(context.supabase, data.key, data.hidden, updatedAt);
    return { ok: true };
  });