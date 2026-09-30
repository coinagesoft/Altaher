import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { reason: undefined } });
    const { data: assignment } = await supabase.from("user_roles").select("role,is_active").eq("user_id", data.user.id).maybeSingle();
    if (!assignment || assignment.is_active === false) throw redirect({ to: "/auth", search: { reason: "no-role" } });
    return { user: data.user, role: assignment.role };
  },
  component: () => <Outlet />,
});
