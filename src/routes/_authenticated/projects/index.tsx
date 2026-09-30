import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProject } from "@/lib/operations.functions";
import { isAdminRole, formatDate, useRefreshWorkspace, useWorkspace, type Role } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects | Talent Operations" },
      { name: "description", content: "Every deployment project with headcount progress and the stage breakdown of its assigned candidates." },
      { property: "og:title", content: "Projects | Talent Operations" },
      { property: "og:description", content: "Every deployment project with headcount progress and the stage breakdown of its assigned candidates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { user, role } = Route.useRouteContext() as { user: { id: string; email?: string }; role: Role };
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const create = useServerFn(createProject);
  const canCreate = role === "Project Coordinator" || isAdminRole(role);

  const emptyProject = { name: "", client: "", country: "", startDate: "" };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyProject);
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () => create({ data: { name: form.name.trim(), client: form.client.trim(), country: form.country.trim(), startDate: form.startDate } }),
    onSuccess: () => { setOpen(false); setForm(emptyProject); refresh(); },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const candidates = workspace.data?.candidates ?? [];

  return (
    <AppShell role={role} email={user.email}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">Open a project to work through Interview &amp; Selection, Mobilisation and On Site.</p>
        </div>
        {canCreate ? <Button onClick={() => setOpen((value) => !value)}><Plus className="size-4" /> New project</Button> : null}
      </div>

      {open && canCreate ? (
        <div className="mt-5 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
          <div><Label className="text-xs text-muted-foreground">Project name</Label><Input className="mt-1.5" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
          <div><Label className="text-xs text-muted-foreground">Client name</Label><Input className="mt-1.5" value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} /></div>
          <div><Label className="text-xs text-muted-foreground">Country of employment</Label><Input className="mt-1.5" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></div>
          <div><Label className="text-xs text-muted-foreground">Start date</Label><Input className="mt-1.5" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></div>
          {error ? <p className="text-xs text-destructive md:col-span-4">{error}</p> : null}
          <div className="flex gap-2 md:col-span-4">
            <Button disabled={save.isPending || form.name.trim().length < 2 || form.client.trim().length < 2 || form.country.trim().length < 2 || !form.startDate} onClick={() => { setError(""); save.mutate(); }}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Create project
            </Button>
            <Button variant="outline" disabled={save.isPending} onClick={() => { setError(""); setForm(emptyProject); setOpen(false); }}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {workspace.isLoading ? <p className="mt-8 text-sm text-muted-foreground">Loading projects…</p> : null}
      {workspace.error ? <p className="mt-8 text-sm text-destructive">{(workspace.error as Error).message}</p> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {(workspace.data?.projects ?? []).map((project) => {
          const assigned = candidates.filter((candidate) => candidate.current_project_id === project.id);
          const onSite = assigned.filter((candidate) => candidate.status === "On Site").length;
          const tradeTotal = (workspace.data?.tradeRequirements ?? []).filter((item) => item.project_id === project.id).reduce((sum, item) => sum + item.required_count, 0);
          const required = tradeTotal || project.required_headcount;
          const breakdown = assigned.reduce<Record<string, number>>((accumulator, candidate) => {
            accumulator[candidate.status] = (accumulator[candidate.status] ?? 0) + 1;
            return accumulator;
          }, {});
          return (
            <Link key={project.id} to="/projects/$projectId" params={{ projectId: project.id }} className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{project.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{project.client} · {project.country} · starts {formatDate(project.start_date)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {project.cancelled_at ? <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">Cancelled</Badge> : null}
                  <Badge variant="outline">{required ? `${onSite}/${required} on site` : `${onSite} on site`}</Badge>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (onSite / Math.max(1, required)) * 100)}%` }} />
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {Object.entries(breakdown).map(([status, count]) => <Badge key={status} variant="secondary">{status} {count}</Badge>)}
                {!assigned.length ? <span className="text-xs text-muted-foreground">No candidates assigned yet.</span> : null}
              </div>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
