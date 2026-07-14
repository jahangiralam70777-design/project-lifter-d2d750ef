/**
 * Admin users hooks.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import * as AdminUsersService from "@/lib/services/admin-users.service";
import type { ListUsersFilters } from "@/lib/services/admin-users.service";

export const adminUsersQueries = {
  list: (filters: ListUsersFilters = {}) =>
    queryOptions({
      queryKey: ["admin", "users", "list", filters] as const,
      queryFn: () => AdminUsersService.listUsers(filters),
    }),
  stats: () =>
    queryOptions({
      queryKey: ["admin", "users", "stats"] as const,
      queryFn: () => AdminUsersService.getUserStats(),
    }),
  referralStats: () =>
    queryOptions({
      queryKey: ["admin", "users", "referrals"] as const,
      queryFn: () => AdminUsersService.getReferralStats(),
    }),
};

export const useAdminUsersList = (filters: ListUsersFilters = {}) =>
  useQuery(adminUsersQueries.list(filters));
export const useAdminUserStats = () => useQuery(adminUsersQueries.stats());
export const useAdminReferralStats = () => useQuery(adminUsersQueries.referralStats());
