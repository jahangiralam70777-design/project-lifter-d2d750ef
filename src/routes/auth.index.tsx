import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/")({
  component: () => <Navigate to="/login" replace />,
});