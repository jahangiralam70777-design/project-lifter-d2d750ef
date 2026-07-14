/**
 * Admin dashboard hooks.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import * as AdminDashboardService from "@/lib/services/admin-dashboard.service";

export const adminDashboardQueries = {
  snapshot: () =>
    queryOptions({
      queryKey: ["admin", "dashboard", "snapshot"] as const,
      queryFn: () => AdminDashboardService.getDashboardSnapshot(),
    }),
  controlCenter: () =>
    queryOptions({
      queryKey: ["admin", "dashboard", "control-center"] as const,
      queryFn: () => AdminDashboardService.getControlCenter(),
    }),
  notificationsBadge: () =>
    queryOptions({
      queryKey: ["admin", "notifications", "badge"] as const,
      queryFn: () => AdminDashboardService.getNotificationsBadge(),
    }),
};

export const useAdminDashboardSnapshot = () => useQuery(adminDashboardQueries.snapshot());
export const useAdminControlCenter = () => useQuery(adminDashboardQueries.controlCenter());
export const useAdminNotificationsBadge = () => useQuery(adminDashboardQueries.notificationsBadge());
