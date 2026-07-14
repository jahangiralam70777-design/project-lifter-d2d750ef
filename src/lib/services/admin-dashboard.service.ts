/**
 * Admin dashboard service — composes admin overview repository calls.
 */
import { AdminDashboard } from "@/lib/repositories";

export type AdminDashboardSnapshot = Awaited<ReturnType<typeof AdminDashboard.adminDashboardSnapshot>>;
export type AdminControlCenter = Awaited<ReturnType<typeof AdminDashboard.adminControlCenter>>;
export type AdminNotificationsBadge = Awaited<ReturnType<typeof AdminDashboard.adminNotificationsBadge>>;

export async function getDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  return AdminDashboard.adminDashboardSnapshot();
}

export async function getControlCenter(): Promise<AdminControlCenter> {
  return AdminDashboard.adminControlCenter();
}

export async function getNotificationsBadge(): Promise<AdminNotificationsBadge> {
  return AdminDashboard.adminNotificationsBadge();
}
