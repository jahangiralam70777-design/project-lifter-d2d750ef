import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const ProfileSettingsFlow = lazy(() =>
  import("@/components/dashboard/ProfileSettingsFlow").then((m) => ({
    default: m.ProfileSettingsFlow,
  })),
);

export const Route = createFileRoute("/_student/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "Profile & Settings · CA Aspire BD" },
      {
        name: "description",
        content:
          "Manage your account, appearance, privacy and learning preferences inside the premium CA Aspire BD student portal.",
      },
      { property: "og:title", content: "Profile & Settings · CA Aspire BD" },
      {
        property: "og:description",
        content:
          "Premium glassmorphism profile hub with appearance, notifications, security and learning preference controls.",
      },
    ],
  }),
});

function ProfilePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
      <ProfileSettingsFlow />
    </Suspense>
  );
}
