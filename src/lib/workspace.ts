import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspaceData } from "@/lib/operations.functions";

export const ROLES = ["Data Entry", "Recruiter", "Project Coordinator", "Mobilisation Executive", "Admin", "Super Admin"] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = ["Available", "Unavailable", "Blacklisted", "Assigned", "Shortlisted", "Interview", "Practical Test", "Passed", "Selected", "Rejected", "Medical", "Visa", "Mobilisation", "On Site", "R&R", "EOC"] as const;
export type Status = (typeof STATUSES)[number];

export const MOBILISATION_STAGES = ["Medical", "Visa", "Mobilisation"] as const;

export type Workspace = Awaited<ReturnType<typeof getWorkspaceData>>;
export type Candidate = Workspace["candidates"][number];
export type Project = Workspace["projects"][number];

export function useWorkspace() {
  const fetchWorkspace = useServerFn(getWorkspaceData);
  return useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace({}) });
}

export function useRefreshWorkspace() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["workspace"] });
  };
}

export function isAdminRole(role: Role) {
  return role === "Admin" || role === "Super Admin";
}

export function canSee(role: Role, area: "candidates" | "projects" | "reports" | "settings") {
  if (role === "Super Admin") return true;
  if (area === "candidates") return true;
  if (area === "projects") return role !== "Data Entry";
  return false;
}

export function homeFor(role: Role) {
  return canSee(role, "candidates") ? "/candidates" : "/projects";
}

export function statusChangedAt(candidate: Candidate, audit: Workspace["audit"]) {
  const event = audit.find((item) => item.candidate_id === candidate.id && item.new_status);
  return event?.created_at ?? candidate.created_at;
}

export function statusTone(status: string) {
  if (status === "Available") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (status === "Rejected" || status === "EOC") return "bg-destructive/10 text-destructive border-destructive/20";
  if (status === "Unavailable") return "bg-destructive/10 text-destructive border-destructive/20";
  if (status === "Blacklisted") return "bg-destructive/15 text-destructive border-destructive/30 font-semibold";
  if (status === "On Site") return "bg-primary/10 text-primary border-primary/20";
  if (status === "R&R") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return "bg-muted text-muted-foreground border-border";
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function monthsUntil(value: string, from: Date = new Date()) {
  const target = new Date(value);
  return (target.getFullYear() - from.getFullYear()) * 12 + (target.getMonth() - from.getMonth());
}

export function daysUntil(value: string, from: Date = new Date()) {
  return Math.ceil((new Date(value).getTime() - from.getTime()) / 86_400_000);
}
