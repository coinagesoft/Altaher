import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import logoAsset from "@/assets/altaher-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { canSee, type Role } from "@/lib/workspace";

const items = [
  { label: "Candidate Database", to: "/candidates", area: "candidates" as const },
  { label: "Projects", to: "/projects", area: "projects" as const },
  { label: "Reports", to: "/reports", area: "reports" as const },
  { label: "Settings", to: "/settings", area: "settings" as const },
];

export function AppShell({ role, email, children }: { role: Role; email?: string | undefined; children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/auth", search: { reason: undefined }, replace: true });
  }

  const visible = items.filter((item) => canSee(role, item.area));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link to={visible[0]?.to ?? "/candidates"} className="flex items-center gap-3">
            <img src={logoAsset.url} alt="Company logo" className="h-10 w-auto max-w-[210px] object-contain" />
            <span className="text-sm font-semibold leading-tight">
              Talent Operations
              <span className="block text-xs font-normal text-muted-foreground">Recruitment &amp; mobilisation</span>
            </span>
          </Link>

          <nav className="order-3 flex w-full flex-wrap gap-1 sm:order-none sm:w-auto">
            {visible.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-accent data-[status=active]:font-medium data-[status=active]:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right text-xs leading-tight">
              <span className="block font-medium">{role}</span>
              <span className="block text-muted-foreground">{email}</span>
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
