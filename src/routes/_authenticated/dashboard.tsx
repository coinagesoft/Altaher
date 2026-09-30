import { createFileRoute, redirect } from "@tanstack/react-router";
import { homeFor, type Role } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: ({ context }) => {
    const role = (context as { role?: Role }).role ?? "Data Entry";
    throw redirect({ to: homeFor(role) });
  },
});
