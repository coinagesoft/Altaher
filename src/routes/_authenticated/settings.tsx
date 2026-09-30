import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { StaffSettings } from "@/components/staff-settings";
import type { Role } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "User management | Talent Operations" },
      { name: "description", content: "Invite staff, set their role and deactivate accounts while keeping their history." },
      { property: "og:title", content: "User management | Talent Operations" },
      { property: "og:description", content: "Invite staff, set their role and deactivate accounts while keeping their history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, role } = Route.useRouteContext() as { user: { id: string; email?: string }; role: Role };
  return (
    <AppShell role={role} email={user.email}>
      {role === "Super Admin" ? <StaffSettings /> : <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">User management is available to administrators only.</p>}
    </AppShell>
  );
}
