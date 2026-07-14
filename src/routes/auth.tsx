import { createFileRoute, Navigate, Outlet, useLocation } from "@tanstack/react-router";

function AuthLayout() {
  const location = useLocation();
  if (location.pathname === "/auth") return <Navigate to="/login" replace />;
  return <Outlet />;
}

export const Route = createFileRoute("/auth")({
  component: AuthLayout,
});