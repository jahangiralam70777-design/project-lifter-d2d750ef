/**
 * Admin users service — composes admin user management repository calls.
 */
import { AdminUsers } from "@/lib/repositories";

export type AdminUserListResult = Awaited<ReturnType<typeof AdminUsers.adminListUsers>>;
export type AdminUserStats = Awaited<ReturnType<typeof AdminUsers.adminUserStats>>;
export type AdminReferralStats = Awaited<ReturnType<typeof AdminUsers.adminReferralStats>>;

export interface ListUsersFilters {
  search?: string;
  role?: "admin" | "moderator" | "student";
  status?: "active" | "suspended" | "pending" | "deleted";
  level?: string;
  referralSource?: string;
  dateRange?: "24h" | "7d" | "30d" | "lifetime";
  includeDeleted?: boolean;
  verified?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listUsers(filters: ListUsersFilters = {}): Promise<AdminUserListResult> {
  return AdminUsers.adminListUsers({
    data: { page: 1, pageSize: 25, ...filters },
  });
}

export async function getUserStats(): Promise<AdminUserStats> {
  return AdminUsers.adminUserStats();
}

export async function getReferralStats(): Promise<AdminReferralStats> {
  return AdminUsers.adminReferralStats();
}
