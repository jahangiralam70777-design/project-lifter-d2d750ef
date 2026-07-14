// Thin adapter over the live-chat server permission resolver. Chat controls
// must mirror the server functions' role rules, not the generic RBAC matrix.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyChatPermissions } from "@/lib/live-chat.functions";
import { useAppStore } from "@/stores/app-store";

export type ChatPermissions = {
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isStaff: boolean;
  canReply: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canManageSettings: boolean;
  userId: string | null;
  loading: boolean;
  failed: boolean;
  error: string | null;
};

const EMPTY: ChatPermissions = {
  isAuthenticated: false,
  isSuperAdmin: false,
  isAdmin: false,
  isModerator: false,
  isStaff: false,
  canReply: false,
  canAssign: false,
  canDelete: false,
  canManageSettings: false,
  userId: null,
  loading: false,
  failed: false,
  error: null,
};

export function useChatPermissions(): ChatPermissions {
  const getPerms = useServerFn(getMyChatPermissions);
  const q = useQuery({
    queryKey: ["chat", "permissions", "me"],
    queryFn: () => getPerms(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const storeUser = useAppStore((s) => s.user);
  const data = q.data;
  const userId = data?.userId || storeUser?.id || null;
  if (q.isLoading) {
    return { ...EMPTY, isAuthenticated: !!userId, userId, loading: true };
  }
  if (q.isError) {
    return {
      ...EMPTY,
      isAuthenticated: !!userId,
      userId,
      failed: true,
      error: q.error instanceof Error ? q.error.message : "Chat permission lookup failed",
    };
  }
  if (!data?.userId) return { ...EMPTY, loading: false };
  return {
    isAuthenticated: true,
    isSuperAdmin: data.isSuperAdmin,
    isAdmin: data.isAdmin,
    isModerator: data.isModerator,
    isStaff: data.isStaff,
    canReply: data.canReply,
    canAssign: data.canAssign,
    canDelete: data.canDelete,
    canManageSettings: data.canManageSettings,
    userId: data.userId,
    loading: false,
    failed: false,
    error: null,
  };
}
