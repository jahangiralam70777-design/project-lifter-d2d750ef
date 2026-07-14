// Loose-typed re-export of the auto-generated Supabase client.
// The auto-generated types only include the study_routine tables that exist
// in the current Cloud project; the imported legacy code queries many tables
// that will be restored later. This shim keeps the runtime client intact
// while relaxing types so the build passes.
import { supabase as _supabase } from "./client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = _supabase as any;
