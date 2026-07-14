export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: "Admin",
  moderator: "Moderator",
  user: "User",
  student: "Student",
  super_admin: "Super Admin",
};

export function getRoleDisplayName(role: string): string {
  return ROLE_DISPLAY_NAMES[role] ?? role;
}
