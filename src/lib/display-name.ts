/** Unified display-name fallback used everywhere user identity is shown. */
export function pickDisplayName(p: {
  display_name?: string | null;
  full_name?: string | null;
  profile_name?: string | null;
  name?: string | null;
  email?: string | null;
} | null | undefined): string {
  if (!p) return "User";
  return (
    (p.display_name && p.display_name.trim()) ||
    (p.full_name && p.full_name.trim()) ||
    (p.profile_name && p.profile_name.trim()) ||
    (p.name && p.name.trim()) ||
    (p.email && p.email.trim()) ||
    "User"
  );
}
