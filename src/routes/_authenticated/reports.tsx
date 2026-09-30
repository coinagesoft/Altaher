import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deactivateDocumentType } from "@/lib/operations.functions";
import { STATUSES, daysUntil, formatDate, useRefreshWorkspace, useWorkspace, type Role } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports | Talent Operations" },
      { name: "description", content: "Pipeline funnel per project, on-site headcount, expiring documents and document type usage." },
      { property: "og:title", content: "Reports | Talent Operations" },
      { property: "og:description", content: "Pipeline funnel per project, on-site headcount, expiring documents and document type usage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { user, role } = Route.useRouteContext() as { user: { id: string; email?: string }; role: Role };
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const deactivate = useServerFn(deactivateDocumentType);

  if (role !== "Super Admin") {
    return (
      <AppShell role={role} email={user.email}>
        <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Reports are available to administrators only.</p>
      </AppShell>
    );
  }

  const data = workspace.data;
  const candidates = data?.candidates ?? [];
  const projects = data?.projects ?? [];
  const typeName = (id: string) => data?.documentTypes.find((type) => type.id === id)?.name ?? "Document";

  const expiring = (window: number) =>
    (data?.documents ?? []).filter((document) => document.expiry_date && daysUntil(document.expiry_date) >= 0 && daysUntil(document.expiry_date) <= window);

  return (
    <AppShell role={role} email={user.email}>
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="mt-1 text-sm text-muted-foreground">Pipeline, headcount, document expiries and document type usage across every project.</p>

      <section className="mt-6 space-y-4">
        <h2 className="text-sm font-semibold">Pipeline funnel per project</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((project) => {
            const rows = candidates.filter((candidate) => candidate.current_project_id === project.id);
            const onSite = rows.filter((candidate) => candidate.status === "On Site").length;
            return (
              <article key={project.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{project.name}</h3>
                    <p className="text-xs text-muted-foreground">{project.client} · {project.country}</p>
                  </div>
                  <Badge variant="outline">{onSite}/{project.required_headcount} on site</Badge>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {STATUSES.filter((status) => rows.some((candidate) => candidate.status === status)).map((status) => {
                    const count = rows.filter((candidate) => candidate.status === status).length;
                    return (
                      <li key={status} className="flex items-center gap-3 text-xs">
                        <span className="w-28 shrink-0 text-muted-foreground">{status}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${(count / Math.max(1, rows.length)) * 100}%` }} />
                        </span>
                        <span className="w-6 text-right font-medium">{count}</span>
                      </li>
                    );
                  })}
                  {!rows.length ? <li className="text-xs text-muted-foreground">No candidates assigned.</li> : null}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold">Documents expiring soon</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[30, 60, 90].map((window) => {
            const rows = expiring(window);
            return (
              <article key={window} className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Within {window} days</p>
                <p className="mt-1 text-2xl font-semibold">{rows.length}</p>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {rows.slice(0, 6).map((document) => (
                    <li key={document.id}>
                      {candidates.find((candidate) => candidate.id === document.candidate_id)?.name ?? "Candidate"} · {typeName(document.document_type_id)} · {formatDate(document.expiry_date)}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold">Document type usage</h2>
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {(data?.documentTypes ?? []).map((type) => (
            <div key={type.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1 font-medium">{type.name}</span>
              <Badge variant="secondary">{type.category}</Badge>
              <span className="text-xs text-muted-foreground">used in {type.usage_count} requirement(s)</span>
              {type.is_active ? (
                <Button size="sm" variant="outline" onClick={async () => { await deactivate({ data: { documentTypeId: type.id } }); refresh(); }}>Deactivate</Button>
              ) : (
                <Badge variant="outline">Inactive</Badge>
              )}
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
