import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, Download, FileText, Loader2, Plane, Plus, Trash2 } from "lucide-react";

import logoAsset from "@/assets/altaher-logo.png.asset.json";
import { AppShell } from "@/components/app-shell";
import { DocumentLink } from "@/components/document-link";
import { CandidateDetail } from "@/routes/_authenticated/candidates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { assertFileSize } from "@/lib/upload-limits";
import {
  cancelProject,
  changeCandidateStage,
  downloadCandidateDocumentsZip,
  downloadProjectDocumentsZip,
  recordCandidateDocument,
  removeProjectTradeRequirement,
  resolveDocumentType,
  setEmployeeNumber,
  startNewContract,
  setMobilisationClearance,
  setProjectTradeRequirement,
  setTravelDetails,
} from "@/lib/operations.functions";
import { isAdminRole, MOBILISATION_STAGES, daysUntil, formatDate, monthsUntil, statusTone, useRefreshWorkspace, useWorkspace as useWorkspaceBase, type Role } from "@/lib/workspace";
import { TradeCategorySelect, hasAllCategories, parseCategories } from "@/components/trade-picker";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project workspace | Talent Operations" },
      { name: "description", content: "Interview and selection, mobilisation checklists, travel batches and on site roster for a single project." },
      { property: "og:title", content: "Project workspace | Talent Operations" },
      { property: "og:description", content: "Interview and selection, mobilisation checklists, travel batches and on site roster for a single project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectDetailPage,
});

/** Workspace view where each candidate's employee_number is the one assigned for this project. */
function useWorkspace() {
  const base = useWorkspaceBase();
  const { projectId } = Route.useParams();
  const data = useMemo(() => {
    if (!base.data) return base.data;
    const numbers = new Map(((base.data as { employeeNumbers?: Array<{ project_id: string; candidate_id: string; employee_number: string }> }).employeeNumbers ?? []).filter((item) => item.project_id === projectId).map((item) => [item.candidate_id, item.employee_number]));
    return { ...base.data, candidates: base.data.candidates.map((candidate) => ({ ...candidate, employee_number: numbers.get(candidate.id) ?? null })) };
  }, [base.data, projectId]);
  return { ...base, data } as typeof base;
}

function EmployeeNumberField({ candidateId, current, canEdit }: { candidateId: string; current: string | null | undefined; canEdit: boolean }) {
  const { projectId } = Route.useParams();
  const refresh = useRefreshWorkspace();
  const save = useServerFn(setEmployeeNumber);
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setValue(current ?? ""); }, [current]);
  async function persist() {
    setBusy(true); setError(""); setSaved(false);
    try { await save({ data: { candidateId, projectId, employeeNumber: value } }); setSaved(true); refresh(); }
    catch (saveError) { setError((saveError as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col items-end gap-1" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Employee no</Label>
        <Input className="h-8 w-28 text-xs" placeholder="e.g. ABK001" value={value} disabled={!canEdit || Boolean(current?.trim())} onChange={(event) => { setValue(event.target.value); setSaved(false); }} />
        {canEdit && !current?.trim() ? (
          <Button size="sm" variant="outline" disabled={busy || !value.trim()} onClick={() => void persist()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : null} Save
          </Button>
        ) : null}
      </div>
      {error ? <p className="max-w-xs text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

type Tab = "Trade requirements" | "Interview & Selection" | "Mobilisation" | "On Site" | "All Employees" | "Document requirements";

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { user, role } = Route.useRouteContext() as { user: { id: string; email?: string }; role: Role };
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const changeStage = useServerFn(changeCandidateStage);

  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);
  const openCandidate = openCandidateId ? (workspace.data?.candidates ?? []).find((item) => item.id === openCandidateId) ?? null : null;

  const tabs: Tab[] = useMemo(() => {
    const list: Tab[] = ["Trade requirements"];
    if (role === "Project Coordinator" || role === "Recruiter" || isAdminRole(role)) list.push("Interview & Selection");
    if (role === "Mobilisation Executive" || role === "Project Coordinator" || isAdminRole(role)) list.push("Mobilisation");
    list.push("On Site");
    list.push("All Employees");
    if (role !== "Recruiter") list.push("Document requirements");
    return list;
  }, [role]);
  const [tab, setTab] = useState<Tab>(tabs[0] ?? "Document requirements");

  const project = workspace.data?.projects.find((item) => item.id === projectId);
  const candidates = (workspace.data?.candidates ?? []).filter((candidate) => candidate.current_project_id === projectId);
  const tradeTotal = (workspace.data?.tradeRequirements ?? []).filter((item) => item.project_id === projectId).reduce((sum, item) => sum + item.required_count, 0);
  const requiredTotal = tradeTotal || project?.required_headcount || 0;

  async function move(candidateId: string, nextStatus: string, okText: string, extra?: StageExtra) {
    setMessage(null);
    try {
      await changeStage({ data: { candidateId, nextStatus: nextStatus as never, ...extra } });
      setMessage({ tone: "ok", text: okText });
      refresh();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    }
  }

  return (
    <AppShell role={role} email={user.email}>
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All projects
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{project?.name ?? "Project"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project ? `${project.client} · ${project.country} · starts ${formatDate(project.start_date)}${requiredTotal ? ` · ${requiredTotal} required` : ""}` : "Loading project…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project?.cancelled_at ? <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">Cancelled</Badge> : null}
          <Badge variant="outline">{candidates.length} candidates in this project</Badge>
          {(role === "Project Coordinator" || isAdminRole(role)) && project && !project.cancelled_at ? <CancelProjectButton projectId={projectId} onDone={(text) => setMessage({ tone: "ok", text })} /> : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`rounded-t-md px-4 py-2 text-sm transition-colors ${tab === item ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {item}
          </button>
        ))}
      </div>

      {message ? <p className={`mt-4 text-xs ${message.tone === "ok" ? "text-emerald-600" : "text-destructive"}`}>{message.text}</p> : null}

      <div className="mt-6">
        {tab === "Trade requirements" ? <TradeRequirementsTab projectId={projectId} role={role} candidates={candidates} /> : null}
        {tab === "Interview & Selection" ? <SelectionBoard projectId={projectId} candidates={candidates} onMove={move} onOpen={setOpenCandidateId} /> : null}
        {tab === "Mobilisation" ? <MobilisationTab projectId={projectId} role={role} candidates={candidates} onMove={move} onOpen={setOpenCandidateId} /> : null}
        {tab === "On Site" ? <OnSiteTab projectId={projectId} role={role} candidates={candidates} required={requiredTotal} onMove={move} onOpen={setOpenCandidateId} /> : null}
        {tab === "All Employees" ? <AllEmployeesTab projectId={projectId} role={role} onOpen={setOpenCandidateId} /> : null}
        {tab === "Document requirements" ? <RequirementsTab projectId={projectId} /> : null}
      </div>

      {openCandidate ? <CandidateDetail candidate={openCandidate} role={role} onClose={() => setOpenCandidateId(null)} /> : null}
    </AppShell>
  );
}

type CandidateRow = ReturnType<typeof useWorkspace>["data"] extends infer Data ? Data extends { candidates: Array<infer Row> } ? Row : never : never;

type StageExtra = { rrStartDate?: string; rrDays?: number; reason?: string; interviewRating?: number; practicalRating?: number; eocDate?: string };

const REJECTION_REASONS = ["Did not attend", "Not suitable for the trade", "Failed the interview", "Salary expectations", "Backed out", "Client rejected"] as const;
const CANCEL_REASONS = ["Backed Out", "Client Rejected", "Medically Unfit", "Police Clearance not obtained", "Visa rejected"] as const;

function ReasonPicker({ options, value, onChange }: { options: readonly string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="mt-2 space-y-2">
      <Label className="text-xs text-muted-foreground">Reason</Label>
      <Select value={options.includes(value) ? value : ""} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
        <SelectContent>{options.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
      </Select>
      <Input className="h-9" placeholder="Or type a reason" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectionBoard({ projectId, candidates, onMove, onOpen }: { projectId: string; candidates: CandidateRow[]; onMove: (id: string, next: string, ok: string, extra?: StageExtra) => void; onOpen: (id: string) => void }) {
  const legacy = candidates.filter((candidate) => (candidate as { status: string }).status === "Shortlisted");
  const columns = ["Assigned", "Interview", "Practical Test", "Passed", "Selected"] as const;
  const columnTitles: Record<string, string> = { Passed: "Passed", Selected: "Forwarded to Mobilisation" };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {columns.map((status) => {
        let rows = candidates.filter((candidate) => (candidate as { status: string }).status === status);
        if (status === "Interview") rows = [...rows, ...legacy];
        if (status === "Passed" || status === "Selected") {
          rows = [...rows].sort((a, b) => {
            const left = a as { practical_rating: number | null; interview_rating: number | null };
            const right = b as { practical_rating: number | null; interview_rating: number | null };
            return (Number(right.practical_rating ?? -1) - Number(left.practical_rating ?? -1)) || (Number(right.interview_rating ?? -1) - Number(left.interview_rating ?? -1));
          });
        }
        return (
          <section key={status} className="rounded-lg border border-border bg-card p-4">
            <header className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{columnTitles[status] ?? status}</h2>
              <Badge variant="secondary">{rows.length}</Badge>
            </header>
            <div className="mt-3 space-y-3">
              {rows.map((candidate) => (
                <SelectionCard key={(candidate as { id: string }).id} projectId={projectId} stage={status} candidate={candidate} onMove={onMove} onOpen={onOpen} />
              ))}
              {!rows.length ? <p className="text-xs text-muted-foreground">Nobody at this stage.</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SelectionCard({ projectId, stage, candidate, onMove, onOpen }: { projectId: string; stage: string; candidate: CandidateRow; onMove: (id: string, next: string, ok: string, extra?: StageExtra) => void; onOpen: (id: string) => void }) {
  const refresh = useRefreshWorkspace();
  const resolveType = useServerFn(resolveDocumentType);
  const recordDocument = useServerFn(recordCandidateDocument);
  const row = candidate as { id: string; name: string; surname?: string | null; candidate_number: string; trade: string | null; interview_rating: number | null; practical_rating: number | null };

  const [mode, setMode] = useState<"" | "reject">("");
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState("");
  const [practical, setPractical] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fullName = [row.surname, row.name].filter(Boolean).join(" ");

  async function uploadReport(file: File) {
    setBusy(true);
    setError("");
    try {
      assertFileSize("Practical Test Report", file);
      const path = `${row.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const uploaded = await supabase.storage.from("candidate-documents").upload(path, file);
      if (uploaded.error) throw new Error(uploaded.error.message);
      const type = await resolveType({ data: { name: "Practical Test Report", category: "candidate" } });
      await recordDocument({ data: { candidateId: row.id, documentTypeId: type.id, fileName: file.name, storagePath: path, projectId } });
      refresh();
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-md border border-border p-3">
      <button type="button" onClick={() => onOpen(row.id)} className="text-sm font-medium underline-offset-2 hover:underline">{fullName}</button>
      <p className="text-xs text-muted-foreground">{row.candidate_number} · {row.trade || "No trade listed"}</p>
      {row.interview_rating !== null || row.practical_rating !== null ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {row.interview_rating !== null ? `Interview ${Number(row.interview_rating).toFixed(1)}` : ""}
          {row.interview_rating !== null && row.practical_rating !== null ? " · " : ""}
          {row.practical_rating !== null ? `Practical test ${Number(row.practical_rating).toFixed(1)}` : ""}
        </p>
      ) : null}

      {mode === "" ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {stage === "Assigned" ? <Button size="sm" onClick={() => onMove(row.id, "Interview", `${fullName} moved to Interview.`)}>Move to Interview <ArrowRight className="size-3.5" /></Button> : null}
            {stage === "Passed" ? (
              <Button size="sm" onClick={() => onMove(row.id, "Selected", `${fullName} was forwarded to Mobilisation.`)}>Forward to Mobilisation <ArrowRight className="size-3.5" /></Button>
            ) : null}
            {stage === "Selected" ? <Badge variant="outline">With Mobilisation</Badge> : null}
            {stage !== "Selected" ? (
              <Button size="sm" variant="outline" onClick={() => { setReason(""); setMode("reject"); }}>{stage === "Practical Test" ? "Fail" : "Reject"}</Button>
            ) : null}
          </div>
          {stage === "Interview" ? (
            <div className="rounded-md border border-dashed border-border p-2">
              <Label className="text-xs text-muted-foreground">Interview rating (0-10, optional)</Label>
              <Input className="mt-1 h-9" type="number" min="0" max="10" step="0.1" value={rating} onChange={(event) => setRating(event.target.value)} />
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={!validRating(rating)} onClick={() => { const extra: StageExtra = rating !== "" ? { interviewRating: Number(rating) } : {}; onMove(row.id, "Practical Test", `${fullName} moved to Practical Test.`, extra); setRating(""); }}>
                  Move to Practical Test <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
          {stage === "Practical Test" ? (
            <div className="rounded-md border border-dashed border-border p-2">
              <Label className="text-xs text-muted-foreground">Practical test rating (0-10, optional)</Label>
              <Input className="mt-1 h-9" type="number" min="0" max="10" step="0.1" value={practical} onChange={(event) => setPractical(event.target.value)} />
              <div className="mt-2">
                <Label className="text-xs text-muted-foreground">Test report (optional)</Label>
                <Input className="mt-1 h-9 text-xs" type="file" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadReport(file); event.target.value = ""; }} />
              </div>
              {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={busy || !validRating(practical)} onClick={() => { const extra: StageExtra = practical !== "" ? { practicalRating: Number(practical) } : {}; onMove(row.id, "Passed", `${fullName} passed the practical test.`, extra); setPractical(""); }}>
                  Mark as passed <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "reject" ? (
        <div className="mt-2 rounded-md border border-dashed border-border p-2">
          <ReasonPicker options={REJECTION_REASONS} value={reason} onChange={setReason} />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={reason.trim().length < 3}
              onClick={() => { onMove(row.id, "Available", `${fullName} was ${stage === "Practical Test" ? "failed" : "rejected"} (${reason.trim()}) and is back in the Candidate Database.`, { reason: reason.trim() }); setMode(""); }}
            >
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("")}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function validRating(value: string) {
  if (value === "" || value === undefined) return true;
  const n = Number(value);
  return !Number.isNaN(n) && n >= 0 && n <= 10;
}

type MoveFn = (id: string, next: string, ok: string, extra?: StageExtra) => void;

function rrWindow(start?: string | null, days?: number | null) {
  if (!start || !days) return null;
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return null;
  const till = new Date(from);
  till.setDate(till.getDate() + days);
  return { from: formatDate(start), till: formatDate(till.toISOString()) };
}

function OnSiteTab({ projectId, role, candidates, required, onMove, onOpen }: { projectId: string; role: Role; candidates: CandidateRow[]; required: number; onMove: MoveFn; onOpen: (id: string) => void }) {
  const workspace = useWorkspace();
  const project = workspace.data?.projects.find((item) => item.id === projectId);
  const travel = workspace.data?.travel ?? [];
  const rows = candidates
    .filter((candidate) => ["On Site", "R&R"].includes((candidate as { status: string }).status))
    .slice()
    .sort((a, b) => compareEmployeeNumber(a, b));
  const counted = rows.filter((candidate) => (candidate as { status: string }).status === "On Site" && !isFutureTravel(travel.find((item) => item.candidate_id === candidate.id)?.flight_date)).length;

  async function downloadOnSiteExcel() {
    const XLSX = await import("xlsx");
    const header = [
      "Employee number",
      "Surname",
      "Name",
      "Trade",
      "Address",
      "Date of Birth",
      "Passport Number",
      "Issue Date",
      "Expiry Date",
      "Travel Date",
      "Account Holder",
      "Account Number",
      "Bank Name",
      "Branch Name",
      "IFSC Code",
      "SWIFT Code",
    ];
    const title = `${project?.name ?? "Project"} - ${project?.client ?? ""} - ${project?.country ?? ""}`;
    const sheetRows: (string | number)[][] = [[title], [], header];
    for (const candidate of rows) {
      const row = candidate as unknown as Record<string, string | null>;
      const trip = travel.find((item) => item.candidate_id === row["id"]);
      const asDate = (value?: string | null) => (value ? formatDate(value) : "");
      sheetRows.push([
        row["employee_number"] ?? "",
        row["surname"] ?? "",
        row["name"] ?? "",
        row["trade"] ?? "",
        row["address"] ?? "",
        asDate(row["date_of_birth"]),
        row["passport_number"] ?? "",
        asDate(row["passport_issue_date"]),
        asDate(row["passport_expiry"]),
        asDate(trip?.flight_date),
        row["bank_account_holder"] ?? "",
        row["bank_account_number"] ?? "",
        row["bank_name"] ?? "",
        row["bank_branch"] ?? "",
        row["bank_ifsc"] ?? "",
        row["bank_swift"] ?? "",
      ]);
    }
    const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
    sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "On Site");
    XLSX.writeFile(book, `${slug(project?.name ?? "project")}-on-site.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-4 text-sm">
        <span><span className="font-medium">{counted}</span> of {required} counted on site. Candidates on R&amp;R stay linked to the project but are excluded from this count.</span>
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => void downloadOnSiteExcel()}>
          <Download className="size-4" /> Download Excel
        </Button>
      </div>
      <div className="space-y-3">
        {rows.map((candidate) => (
          <OnSiteRow key={(candidate as { id: string }).id} projectId={projectId} role={role} candidate={candidate} onMove={onMove} onOpen={onOpen} />
        ))}
        {!rows.length ? <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">No candidates are on site for this project yet.</p> : null}
      </div>
    </div>
  );
}

function OnSiteRow({ projectId, role, candidate, onMove, onOpen }: { projectId: string; role: Role; candidate: CandidateRow; onMove: MoveFn; onOpen: (id: string) => void }) {
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const resolveType = useServerFn(resolveDocumentType);
  const recordDocument = useServerFn(recordCandidateDocument);

  const row = candidate as { id: string; name: string; surname?: string | null; candidate_number: string; employee_number?: string | null; status: string; rr_start_date?: string | null; rr_days?: number | null; trade?: string | null; passport_number?: string | null };
  const onRR = row.status === "R&R";
  const canUpload = role === "Project Coordinator" || isAdminRole(role);
  const documents = (workspace.data?.documents ?? []).filter((document) => document.candidate_id === row.id);
  const typeName = (id: string) => workspace.data?.documentTypes.find((type) => type.id === id)?.name ?? "Document";
  const window = rrWindow(row.rr_start_date, row.rr_days);
  const travel = (workspace.data?.travel ?? []).find((item) => item.candidate_id === row.id);
  const saveTravel = useServerFn(setTravelDetails);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rrOpen, setRrOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [rrStart, setRrStart] = useState(new Date().toISOString().slice(0, 10));
  const [rrDays, setRrDays] = useState("14");
  const [eocOpen, setEocOpen] = useState(false);
  const [eocDate, setEocDate] = useState(new Date().toISOString().slice(0, 10));

  const saveClearance = useServerFn(setMobilisationClearance);
  const canEditClearances = role === "Mobilisation Executive" || role === "Project Coordinator" || isAdminRole(role);
  const clearance = (workspace.data?.clearances ?? []).find((item) => item.candidate_id === row.id && item.project_id === projectId);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState("");
  const [clearSaved, setClearSaved] = useState(false);
  const [clearForm, setClearForm] = useState({
    medicalCleared: clearance?.medical_cleared ?? false,
    medicalDate: clearance?.medical_date ?? "",
    visaCleared: clearance?.visa_cleared ?? false,
    visaIssueDate: clearance?.visa_issue_date ?? "",
    visaExpiryDate: clearance?.visa_expiry_date ?? "",
    policeCleared: clearance?.police_cleared ?? false,
    policeDate: (clearance as { police_date?: string | null } | undefined)?.police_date ?? "",
  });

  async function uploadClearanceDocument(documentName: string, file: File, expiryDate?: string) {
    setClearBusy(documentName);
    setError("");
    try {
      assertFileSize(documentName, file);
      const path = `${row.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const uploaded = await supabase.storage.from("candidate-documents").upload(path, file);
      if (uploaded.error) throw new Error(uploaded.error.message);
      const type = await resolveType({ data: { name: documentName, category: "candidate" } });
      await recordDocument({ data: { candidateId: row.id, documentTypeId: type.id, fileName: file.name, storagePath: path, projectId, ...(expiryDate ? { expiryDate } : {}) } });
      refresh();
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setClearBusy("");
    }
  }

  async function persistClearances() {
    setClearBusy("save");
    setError("");
    setClearSaved(false);
    try {
      await saveClearance({ data: { candidateId: row.id, projectId, medicalCleared: clearForm.medicalCleared, medicalDate: clearForm.medicalDate || undefined, visaCleared: clearForm.visaCleared, visaIssueDate: clearForm.visaIssueDate || undefined, visaExpiryDate: clearForm.visaExpiryDate || undefined, policeCleared: clearForm.policeCleared, policeDate: clearForm.policeDate || undefined } });
      setClearSaved(true);
      refresh();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setClearBusy("");
    }
  }

  async function uploadContract(file: File) {
    setBusy(true);
    setError("");
    try {
      assertFileSize("Contract", file);
      const path = `${row.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const uploaded = await supabase.storage.from("candidate-documents").upload(path, file);
      if (uploaded.error) throw new Error(uploaded.error.message);
      const type = await resolveType({ data: { name: "Contract", category: "candidate" } });
      await recordDocument({ data: { candidateId: row.id, documentTypeId: type.id, fileName: file.name, storagePath: path, projectId } });
      refresh();
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen(row.id)} className="text-sm font-medium underline-offset-2 hover:underline">{[row.surname, row.name].filter(Boolean).join(" ")}</button>
          <p className="text-xs text-muted-foreground">{row.candidate_number} · {row.trade || "—"} · Passport {row.passport_number || "—"}</p>
          <p className="text-xs text-muted-foreground">{documents.length} documents on file</p>
        </div>
        <EmployeeNumberField candidateId={row.id} current={row.employee_number} canEdit={canUpload} />
        <Badge variant="outline" className={statusTone(row.status)}>
          {onRR
            ? (window ? `On R&R from ${window.from} till ${window.till}` : "On R&R")
            : travel?.flight_date && isFutureTravel(travel.flight_date)
              ? `Will travel on ${formatDate(travel.flight_date)}`
              : travel?.flight_date
              ? `On site since ${formatDate(travel.flight_date)}`
              : row.status}
        </Badge>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
          <FileText className="size-3.5" /> {open ? "Hide documents" : "Documents"}
        </Button>
        <Button size="sm" variant="ghost" aria-expanded={clearOpen} onClick={() => setClearOpen(!clearOpen)}>
          Clearances <ChevronDown className={`size-3.5 transition-transform ${clearOpen ? "rotate-180" : ""}`} />
        </Button>
        {onRR ? (
          <Button size="sm" variant="outline" onClick={() => setReturnOpen(!returnOpen)}>{returnOpen ? "Cancel return" : "End R&R"}</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setRrOpen(!rrOpen)}>{rrOpen ? "Cancel R&R" : "Start R&R"}</Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setEocOpen(!eocOpen)}>{eocOpen ? "Cancel EOC" : "Mark EOC"}</Button>
      </div>

      {clearOpen ? (
        <div className="border-t border-border px-4 py-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="size-4 accent-primary" disabled={!canEditClearances} checked={clearForm.medicalCleared} onChange={(event) => setClearForm({ ...clearForm, medicalCleared: event.target.checked })} />
                Medical
              </label>
              <div className="mt-2">
                <Label className="text-xs text-muted-foreground">Medical date</Label>
                <Input className="mt-1 h-8 text-xs" type="date" disabled={!canEditClearances} value={clearForm.medicalDate} onChange={(event) => setClearForm({ ...clearForm, medicalDate: event.target.value })} />
              </div>
              {canEditClearances ? (
                <Input className="mt-1.5 h-8 text-xs" type="file" disabled={clearBusy === "Medical Certificate"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadClearanceDocument("Medical Certificate", file, clearForm.medicalDate || undefined); event.target.value = ""; }} />
              ) : null}
            </div>

            <div className="rounded-md border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="size-4 accent-primary" disabled={!canEditClearances} checked={clearForm.visaCleared} onChange={(event) => setClearForm({ ...clearForm, visaCleared: event.target.checked })} />
                Visa
              </label>
              <div className="mt-2 grid gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Issue date</Label>
                  <Input className="mt-1 h-8 text-xs" type="date" disabled={!canEditClearances} value={clearForm.visaIssueDate} onChange={(event) => setClearForm({ ...clearForm, visaIssueDate: event.target.value })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Expiry date</Label>
                  <Input className="mt-1 h-8 text-xs" type="date" disabled={!canEditClearances} value={clearForm.visaExpiryDate} onChange={(event) => setClearForm({ ...clearForm, visaExpiryDate: event.target.value })} />
                </div>
              </div>
              {canEditClearances ? (
                <Input className="mt-1.5 h-8 text-xs" type="file" disabled={clearBusy === "Visa"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadClearanceDocument("Visa", file, clearForm.visaExpiryDate || undefined); event.target.value = ""; }} />
              ) : null}
            </div>

            <div className="rounded-md border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="size-4 accent-primary" disabled={!canEditClearances} checked={clearForm.policeCleared} onChange={(event) => setClearForm({ ...clearForm, policeCleared: event.target.checked })} />
                Police clearance
              </label>
              <div className="mt-2">
                <Label className="text-xs text-muted-foreground">PCC date</Label>
                <Input className="mt-1 h-8 text-xs" type="date" disabled={!canEditClearances} value={clearForm.policeDate} onChange={(event) => setClearForm({ ...clearForm, policeDate: event.target.value })} />
              </div>
              {canEditClearances ? (
                <Input className="mt-1.5 h-8 text-xs" type="file" disabled={clearBusy === "Police Clearance Certificate"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadClearanceDocument("Police Clearance Certificate", file, clearForm.policeDate || undefined); event.target.value = ""; }} />
              ) : null}
            </div>
          </div>
          {canEditClearances ? (
            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" variant="outline" disabled={clearBusy === "save"} onClick={() => void persistClearances()}>Save clearances</Button>
              {clearSaved ? <span className="text-xs text-emerald-600">Saved</span> : null}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Only Mobilisation Executives and Admins can edit clearances.</p>
          )}
        </div>
      ) : null}

      {rrOpen && !onRR ? (
        <div className="grid gap-3 border-t border-border px-4 py-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">R&amp;R start date</Label>
            <Input className="mt-1.5 h-9" type="date" value={rrStart} onChange={(event) => setRrStart(event.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Number of days</Label>
            <Input className="mt-1.5 h-9" type="number" min="1" max="365" value={rrDays} onChange={(event) => setRrDays(event.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button
              size="sm"
              disabled={!rrStart || !Number(rrDays)}
              onClick={() => {
                const back = rrWindow(rrStart, Number(rrDays));
                onMove(row.id, "R&R", `${row.name} is on R&R from ${back?.from} till ${back?.till}.`, { rrStartDate: rrStart, rrDays: Number(rrDays) });
                setRrOpen(false);
              }}
            >
              Confirm R&amp;R
            </Button>
            <span className="pb-2 text-xs text-muted-foreground">Back on {rrWindow(rrStart, Number(rrDays))?.till ?? "—"}</span>
          </div>
        </div>
      ) : null}

      {eocOpen ? (
        <div className="grid gap-3 border-t border-border px-4 py-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">EOC date</Label>
            <Input className="mt-1.5 h-9" type="date" value={eocDate} onChange={(event) => setEocDate(event.target.value)} />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button
              size="sm"
              disabled={!eocDate}
              onClick={() => {
                onMove(row.id, "Available", `${row.name} completed their contract on ${formatDate(eocDate)} and is back in the Candidate Database.`, { eocDate });
                setEocOpen(false);
              }}
            >
              Confirm EOC
            </Button>
            <span className="pb-2 text-xs text-muted-foreground">They return to the Candidate Database as Available.</span>
          </div>
        </div>
      ) : null}

      {returnOpen && onRR ? (
        <div className="border-t border-border px-4 pb-4">
          <p className="pt-3 text-xs text-muted-foreground">Enter the return flight details. Saving them brings {row.name} back on site from the arrival date.</p>
          <TravelForm
            candidateId={row.id}
            existing={travel}
            onSave={async (values) => {
              setError("");
              try {
                await saveTravel({ data: { candidateId: row.id, ...values } });
                onMove(row.id, "On Site", `${row.name} is back on site since ${formatDate(values.flightDate)}.`);
                setReturnOpen(false);
              } catch (saveError) {
                setError((saveError as Error).message);
              }
            }}
          />
        </div>
      ) : null}

      {open ? (
        <div className="border-t border-border px-4 py-3">
          <ul className="space-y-2">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{typeName(document.document_type_id)}</span>
                  <span className="block text-xs text-muted-foreground">{document.file_name} · uploaded {formatDate(document.created_at)}{document.expiry_date ? ` · expires ${formatDate(document.expiry_date)}` : ""}</span>
                </span>
                <DocumentLink documentId={document.id} />
              </li>
            ))}
            {!documents.length ? <li className="text-xs text-muted-foreground">No documents on file.</li> : null}
          </ul>
          {canUpload ? (
            <div className="mt-3 rounded-md border border-dashed border-border p-3">
              <Label className="text-xs text-muted-foreground">Upload employment contract</Label>
              <Input className="mt-1.5 h-9" type="file" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadContract(file); event.target.value = ""; }} />
            </div>
          ) : null}
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function MobilisationTab({ projectId, role, candidates, onMove, onOpen }: { projectId: string; role: Role; candidates: CandidateRow[]; onMove: MoveFn; onOpen: (id: string) => void }) {
  const workspace = useWorkspace();
  const [view, setView] = useState<"Checklists" | "Travel Batches">("Checklists");

  const project = workspace.data?.projects.find((item) => item.id === projectId);
  const rows = candidates.filter((candidate) => ["Selected", ...MOBILISATION_STAGES].includes((candidate as { status: string }).status));

  if (view === "Travel Batches") {
    return (
      <div className="space-y-4">
        <ViewToggle view={view} setView={setView} />
        <TravelBatches projectId={projectId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ViewToggle view={view} setView={setView} />
      {!rows.length ? <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">No Selected candidates in this project yet.</p> : null}
      {rows.length ? (
        <div className="hidden items-center gap-3 px-4 sm:flex" aria-hidden="true">
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Name</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Candidate no</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Trade</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Passport no</p>
          </div>
          <div className="w-24 shrink-0" />
          <div className="size-9 shrink-0" />
        </div>
      ) : null}
      {rows.map((candidate) => (
        <MobilisationCard key={(candidate as { id: string }).id} projectId={projectId} projectStart={project?.start_date ?? null} role={role} candidate={candidate} onMove={onMove} onOpen={onOpen} />
      ))}
    </div>
  );
}

function MobilisationCard({ projectId, projectStart, role, candidate, onMove, onOpen }: { projectId: string; projectStart: string | null; role: Role; candidate: CandidateRow; onMove: MoveFn; onOpen: (id: string) => void }) {
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const resolveType = useServerFn(resolveDocumentType);
  const recordDocument = useServerFn(recordCandidateDocument);
  const saveTravel = useServerFn(setTravelDetails);
  const saveClearance = useServerFn(setMobilisationClearance);

  const row = candidate as { id: string; name: string; surname?: string | null; candidate_number: string; status: string; passport_expiry: string | null; passport_number?: string | null; trade?: string | null; category?: string | null };
  const canEdit = role === "Mobilisation Executive" || role === "Project Coordinator" || isAdminRole(role);
  const clearance = (workspace.data?.clearances ?? []).find((item) => item.candidate_id === row.id && item.project_id === projectId);
  const documents = (workspace.data?.documents ?? []).filter((document) => document.candidate_id === row.id);
  const typeName = (id: string) => workspace.data?.documentTypes.find((type) => type.id === id)?.name ?? "Document";
  const candidateTravel = (workspace.data?.travel ?? []).find((item) => item.candidate_id === row.id);
  const hasDocument = (name: string) => documents.some((document) => typeName(document.document_type_id).toLowerCase() === name.toLowerCase());

  const [form, setForm] = useState({
    medicalCleared: clearance?.medical_cleared ?? false,
    medicalDate: clearance?.medical_date ?? "",
    visaCleared: clearance?.visa_cleared ?? false,
    visaIssueDate: clearance?.visa_issue_date ?? "",
    visaExpiryDate: clearance?.visa_expiry_date ?? "",
    policeCleared: clearance?.police_cleared ?? false,
    policeDate: (clearance as { police_date?: string | null } | undefined)?.police_date ?? "",
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  async function upload(documentName: string, file: File, expiryDate?: string) {
    setBusy(documentName);
    setError("");
    try {
      assertFileSize(documentName, file);
      const path = `${row.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const uploaded = await supabase.storage.from("candidate-documents").upload(path, file);
      if (uploaded.error) throw new Error(uploaded.error.message);
      const type = await resolveType({ data: { name: documentName, category: "candidate" } });
      await recordDocument({ data: { candidateId: row.id, documentTypeId: type.id, fileName: file.name, storagePath: path, ...(expiryDate ? { expiryDate } : {}) } });
      refresh();
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function persist() {
    setBusy("save");
    setError("");
    setSaved(false);
    try {
      await saveClearance({ data: { candidateId: row.id, projectId, medicalCleared: form.medicalCleared, medicalDate: form.medicalDate || undefined, visaCleared: form.visaCleared, visaIssueDate: form.visaIssueDate || undefined, visaExpiryDate: form.visaExpiryDate || undefined, policeCleared: form.policeCleared, policeDate: form.policeDate || undefined } });
      setSaved(true);
      refresh();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setBusy("");
    }
  }

  const medicalDocument = hasDocument("Medical Certificate");
  const visaDocument = hasDocument("Visa");
  const policeDocument = hasDocument("Police Clearance Certificate");
  const savedClearances = Boolean(clearance?.medical_cleared && clearance?.visa_cleared && clearance?.police_cleared);
  const travelReady = Boolean(candidateTravel?.flight_date && candidateTravel?.flight_number);
  const readyForSite = savedClearances && travelReady;

  const start = projectStart ? new Date(projectStart) : null;
  const warnings = [
    ...(row.passport_expiry && start && monthsUntil(row.passport_expiry, start) < 6 ? [`Passport expires ${formatDate(row.passport_expiry)}`] : []),
    ...(clearance?.visa_expiry_date && start && monthsUntil(clearance.visa_expiry_date, start) < 6 ? [`Visa expires ${formatDate(clearance.visa_expiry_date)}`] : []),
    ...documents.filter((document) => document.expiry_date && start && monthsUntil(document.expiry_date, start) < 6).map((document) => `${typeName(document.document_type_id)} expires ${formatDate(document.expiry_date)}`),
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-3 px-4 py-3">
        <div className="grid min-w-0 flex-1 items-center gap-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
          <button type="button" onClick={() => onOpen(row.id)} className="truncate text-left text-sm font-semibold underline-offset-2 hover:underline">{[row.surname, row.name].filter(Boolean).join(" ")}</button>
          <p className="truncate text-sm text-muted-foreground">{row.candidate_number}</p>
          <p className="truncate text-sm text-muted-foreground">{row.trade || "—"}</p>
          <p className="truncate text-sm text-muted-foreground">{row.passport_number || "—"}</p>
        </div>
        <Badge variant="outline" className={`w-24 shrink-0 justify-center ${statusTone(row.status)}`}>{row.status}</Badge>
        <Button size="icon" variant="ghost" aria-label={open ? "Collapse" : "Expand"} aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </header>

      {open ? (
        <div className="border-t border-border px-4 pb-4">
          <div className="mt-3 flex justify-start">
            <EmployeeNumberField candidateId={row.id} current={(row as { employee_number?: string | null }).employee_number} canEdit={canEdit} />
          </div>
          {canEdit ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { setCancelReason(""); setCancelOpen(!cancelOpen); }}>{cancelOpen ? "Keep candidate" : "Cancel mobilisation"}</Button>
              <Button size="sm" disabled={!readyForSite} onClick={() => onMove(row.id, "On Site", `${row.name} moved on site.`)}>
                Send On Site <ArrowRight className="size-3.5" />
              </Button>
            </div>
          ) : null}


      {cancelOpen && canEdit ? (
        <div className="mt-3 rounded-md border border-dashed border-border p-3">
          <p className="text-xs text-muted-foreground">Cancelling sends {row.name} back to the Candidate Database as Available.</p>
          <div className="max-w-sm">
            <ReasonPicker options={CANCEL_REASONS} value={cancelReason} onChange={setCancelReason} />
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="destructive" disabled={cancelReason.trim().length < 3} onClick={() => { onMove(row.id, "Available", `${row.name}'s mobilisation was cancelled (${cancelReason.trim()}).`, { reason: cancelReason.trim() }); setCancelOpen(false); }}>
              Confirm cancellation
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCancelOpen(false)}>Back</Button>
          </div>
        </div>
      ) : null}

      {warnings.length ? (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {warnings.join(" · ")} — within 6 months of the project start date.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-4 accent-primary" disabled={!canEdit} checked={form.medicalCleared} onChange={(event) => setForm({ ...form, medicalCleared: event.target.checked })} />
            Medical
          </label>
          <div className="mt-2">
            <Label className="text-xs text-muted-foreground">Medical date</Label>
            <Input className="mt-1 h-8 text-xs" type="date" disabled={!canEdit} value={form.medicalDate} onChange={(event) => setForm({ ...form, medicalDate: event.target.value })} />
          </div>
          <p className={`mt-2 flex items-center gap-1.5 text-xs ${medicalDocument ? "text-emerald-600" : "text-muted-foreground"}`}>
            {medicalDocument ? <Check className="size-3.5" /> : <span className="size-3.5 rounded-full border border-current" />} Medical certificate
          </p>
          {canEdit ? (
            <Input className="mt-1.5 h-8 text-xs" type="file" disabled={busy === "Medical Certificate"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload("Medical Certificate", file, form.medicalDate || undefined); event.target.value = ""; }} />
          ) : null}
        </div>

        <div className="rounded-md border border-border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-4 accent-primary" disabled={!canEdit} checked={form.visaCleared} onChange={(event) => setForm({ ...form, visaCleared: event.target.checked })} />
            Visa
          </label>
          <div className="mt-2 grid gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Issue date</Label>
              <Input className="mt-1 h-8 text-xs" type="date" disabled={!canEdit} value={form.visaIssueDate} onChange={(event) => setForm({ ...form, visaIssueDate: event.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Expiry date</Label>
              <Input className="mt-1 h-8 text-xs" type="date" disabled={!canEdit} value={form.visaExpiryDate} onChange={(event) => setForm({ ...form, visaExpiryDate: event.target.value })} />
            </div>
          </div>
          <p className={`mt-2 flex items-center gap-1.5 text-xs ${visaDocument ? "text-emerald-600" : "text-muted-foreground"}`}>
            {visaDocument ? <Check className="size-3.5" /> : <span className="size-3.5 rounded-full border border-current" />} Visa copy
          </p>
          {canEdit ? (
            <Input className="mt-1.5 h-8 text-xs" type="file" disabled={busy === "Visa"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload("Visa", file, form.visaExpiryDate || undefined); event.target.value = ""; }} />
          ) : null}
        </div>

        <div className="rounded-md border border-border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-4 accent-primary" disabled={!canEdit} checked={form.policeCleared} onChange={(event) => setForm({ ...form, policeCleared: event.target.checked })} />
            Police clearance
          </label>
          <div className="mt-2">
            <Label className="text-xs text-muted-foreground">PCC date</Label>
            <Input className="mt-1 h-8 text-xs" type="date" disabled={!canEdit} value={form.policeDate} onChange={(event) => setForm({ ...form, policeDate: event.target.value })} />
          </div>
          <p className={`mt-2 flex items-center gap-1.5 text-xs ${policeDocument ? "text-emerald-600" : "text-muted-foreground"}`}>
            {policeDocument ? <Check className="size-3.5" /> : <span className="size-3.5 rounded-full border border-current" />} Police clearance certificate
          </p>
          {canEdit ? (
            <Input className="mt-1.5 h-8 text-xs" type="file" disabled={busy === "Police Clearance Certificate"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload("Police Clearance Certificate", file, form.policeDate || undefined); event.target.value = ""; }} />
          ) : null}
        </div>
      </div>

      {canEdit ? (
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" variant="outline" disabled={busy === "save"} onClick={() => void persist()}>Save clearances</Button>
          {saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
          {!readyForSite ? <span className="text-xs text-muted-foreground">All three ticks and flight details are needed before sending on site. Uploads are optional.</span> : null}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      {canEdit ? (
        <TravelForm candidateId={row.id} existing={candidateTravel} onSave={async (values) => { await saveTravel({ data: { candidateId: row.id, ...values } }); refresh(); }} />
      ) : candidateTravel ? (
        <p className="mt-4 text-xs text-muted-foreground">Flight {candidateTravel.flight_number} on {formatDate(candidateTravel.flight_date)}</p>
      ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ViewToggle({ view, setView }: { view: string; setView: (value: "Checklists" | "Travel Batches") => void }) {
  return (
    <div className="flex gap-2">
      {(["Checklists", "Travel Batches"] as const).map((item) => (
        <Button key={item} size="sm" variant={view === item ? "default" : "outline"} onClick={() => setView(item)}>{item}</Button>
      ))}
    </div>
  );
}

type FlightLeg = { flightNumber: string; from: string; to: string; departureDate?: string; departureTime?: string; arrivalDate?: string; arrivalTime?: string };

function parseLegs(value: unknown): FlightLeg[] {
  return Array.isArray(value) ? (value as FlightLeg[]).filter((leg) => leg && typeof leg.flightNumber === "string") : [];
}

function TravelForm({ candidateId, existing, onSave }: { candidateId: string; existing?: undefined | { flight_date: string; flight_number: string; departure_airport: string; departure_time: string | null; arrival_airport: string; arrival_time: string | null; arrival_date?: string | null; connections?: unknown; ticket_number?: string | null }; onSave: (values: { flightDate: string; flightNumber: string; departureAirport: string; departureTime?: string; arrivalAirport: string; arrivalTime?: string; arrivalDate?: string; ticketNumber?: string; connections?: FlightLeg[] }) => Promise<void> }) {
  const [legs, setLegs] = useState<FlightLeg[]>(parseLegs(existing?.connections));
  const [form, setForm] = useState({
    flightDate: existing?.flight_date ?? "",
    flightNumber: existing?.flight_number ?? "",
    departureAirport: existing?.departure_airport ?? "",
    departureTime: existing?.departure_time ?? "",
    arrivalAirport: existing?.arrival_airport ?? "",
    arrivalTime: existing?.arrival_time ?? "",
    arrivalDate: existing?.arrival_date ?? "",
    ticketNumber: existing?.ticket_number ?? "",
  });
  const [saving, setSaving] = useState(false);

  return (
    <div className="mt-4 rounded-md border border-dashed border-border p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Plane className="size-3.5" /> Flight details</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div><Label className="text-xs text-muted-foreground">Flight date</Label><Input className="mt-1 h-9" type="date" value={form.flightDate} onChange={(event) => setForm({ ...form, flightDate: event.target.value })} /></div>
        <div><Label className="text-xs text-muted-foreground">Flight number</Label><Input className="mt-1 h-9" value={form.flightNumber} onChange={(event) => setForm({ ...form, flightNumber: event.target.value })} /></div>
        <div><Label className="text-xs text-muted-foreground">Ticket number</Label><Input className="mt-1 h-9" value={form.ticketNumber} onChange={(event) => setForm({ ...form, ticketNumber: event.target.value })} placeholder="e.g. 098-2345678901" /></div>
        <div><Label className="text-xs text-muted-foreground">Departure airport</Label><Input className="mt-1 h-9" value={form.departureAirport} onChange={(event) => setForm({ ...form, departureAirport: event.target.value })} /></div>
        <div><Label className="text-xs text-muted-foreground">Departure time</Label><Input className="mt-1 h-9" type="time" value={form.departureTime} onChange={(event) => setForm({ ...form, departureTime: event.target.value })} /></div>
        <div />
        <div><Label className="text-xs text-muted-foreground">Arrival airport</Label><Input className="mt-1 h-9" value={form.arrivalAirport} onChange={(event) => setForm({ ...form, arrivalAirport: event.target.value })} /></div>
        <div><Label className="text-xs text-muted-foreground">Arrival date</Label><Input className="mt-1 h-9" type="date" value={form.arrivalDate} onChange={(event) => setForm({ ...form, arrivalDate: event.target.value })} /></div>
        <div><Label className="text-xs text-muted-foreground">Arrival time</Label><Input className="mt-1 h-9" type="time" value={form.arrivalTime} onChange={(event) => setForm({ ...form, arrivalTime: event.target.value })} /></div>
        <div className="flex items-end"><Button size="sm" disabled={saving || legs.some((leg) => leg.flightNumber.trim().length < 2 || leg.from.trim().length < 3 || leg.to.trim().length < 3) || !form.flightDate || form.flightNumber.trim().length < 2 || form.departureAirport.trim().length < 3 || form.arrivalAirport.trim().length < 3} onClick={async () => { setSaving(true); await onSave({ flightDate: form.flightDate, flightNumber: form.flightNumber, departureAirport: form.departureAirport, departureTime: form.departureTime, arrivalAirport: form.arrivalAirport, arrivalTime: form.arrivalTime, arrivalDate: form.arrivalDate, ticketNumber: form.ticketNumber, connections: legs }); setSaving(false); }}>Save flight</Button></div>
      </div>
      {legs.map((leg, index) => {
        const update = (patch: Partial<FlightLeg>) => setLegs(legs.map((item, i) => (i === index ? { ...item, ...patch } : item)));
        return (
          <div key={index} className="mt-3 rounded-md border border-border bg-muted/30 p-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">Connecting flight {index + 1}</p>
              <Button size="sm" variant="ghost" onClick={() => setLegs(legs.filter((_, i) => i !== index))}>Remove</Button>
            </div>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              <div><Label className="text-xs text-muted-foreground">Flight number</Label><Input className="mt-1 h-9" value={leg.flightNumber} onChange={(event) => update({ flightNumber: event.target.value })} /></div>
              <div><Label className="text-xs text-muted-foreground">From</Label><Input className="mt-1 h-9" value={leg.from} onChange={(event) => update({ from: event.target.value })} /></div>
              <div><Label className="text-xs text-muted-foreground">To</Label><Input className="mt-1 h-9" value={leg.to} onChange={(event) => update({ to: event.target.value })} /></div>
              <div><Label className="text-xs text-muted-foreground">Departure date</Label><Input className="mt-1 h-9" type="date" value={leg.departureDate ?? ""} onChange={(event) => update({ departureDate: event.target.value })} /></div>
              <div><Label className="text-xs text-muted-foreground">Departure time</Label><Input className="mt-1 h-9" type="time" value={leg.departureTime ?? ""} onChange={(event) => update({ departureTime: event.target.value })} /></div>
              <div />
              <div><Label className="text-xs text-muted-foreground">Arrival date</Label><Input className="mt-1 h-9" type="date" value={leg.arrivalDate ?? ""} onChange={(event) => update({ arrivalDate: event.target.value })} /></div>
              <div><Label className="text-xs text-muted-foreground">Arrival time</Label><Input className="mt-1 h-9" type="time" value={leg.arrivalTime ?? ""} onChange={(event) => update({ arrivalTime: event.target.value })} /></div>
            </div>
          </div>
        );
      })}
      <Button className="mt-2" size="sm" variant="outline" disabled={legs.length >= 5} onClick={() => { const last = legs[legs.length - 1]; setLegs([...legs, { flightNumber: "", from: (last?.to ?? form.arrivalAirport) || "", to: "", departureDate: "", departureTime: "", arrivalDate: "", arrivalTime: "" }]); }}>+ Add connecting flight (layover)</Button>
      <input type="hidden" value={candidateId} />
    </div>
  );
}

type BatchTraveller = {
  id: string;
  employeeNumber: string;
  surname: string;
  name: string;
  trade: string;
  passport: string;
  visa: string;
  medical: string;
  police: string;
  arrival: string;
  ticketNumber: string;
};

type Batch = {
  label: string;
  flightDate: string;
  flightNumber: string;
  route: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  legs: FlightLeg[];
  travellers: BatchTraveller[];
};

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function slug(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "batch";
}

function isFutureTravel(date?: string | null) {
  if (!date) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return date > today;
}

function AddToBatchButton({ batch, candidates }: { batch: Batch; candidates: CandidateRow[] }) {
  const refresh = useRefreshWorkspace();
  const saveTravel = useServerFn(setTravelDetails);
  const moveStage = useServerFn(changeCandidateStage);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inBatch = new Set(batch.travellers.map((t) => t.id));
  const pool = candidates.filter((c) => (["Selected", ...MOBILISATION_STAGES] as string[]).includes((c as { status: string }).status) && !inBatch.has(c.id));

  async function add() {
    setBusy(true); setError("");
    try {
      for (const id of picked) {
        await saveTravel({ data: {
          candidateId: id, flightDate: batch.flightDate, flightNumber: batch.flightNumber,
          departureAirport: batch.departureAirport, departureTime: batch.departureTime || undefined,
          arrivalAirport: batch.arrivalAirport, arrivalTime: batch.arrivalTime || undefined,
          arrivalDate: batch.arrivalDate || undefined, connections: batch.legs,
        } });
        await moveStage({ data: { candidateId: id, nextStatus: "On Site", fromTravelBatch: true } });
      }
      refresh(); setPicked([]); setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add candidates"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="size-4" /> Add more candidates</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Add candidates to {batch.label}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <th className="w-10 px-3 py-2" /><th className="px-3 py-2 font-medium">Name Surname</th><th className="px-3 py-2 font-medium">Trade</th><th className="px-3 py-2 font-medium">Passport number</th>
            </tr></thead>
            <tbody>
              {pool.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2"><Checkbox checked={picked.includes(c.id)} onCheckedChange={(v) => setPicked((list) => v ? [...list, c.id] : list.filter((x) => x !== c.id))} /></td>
                  <td className="px-3 py-2">{[c.name, c.surname].filter(Boolean).join(" ")}</td>
                  <td className="px-3 py-2">{c.trade || "—"}</td>
                  <td className="px-3 py-2">{c.passport_number || "—"}</td>
                </tr>
              ))}
              {!pool.length ? <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No candidates in mobilisation to add.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!picked.length || busy} onClick={() => void add()}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Add {picked.length || ""} to batch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TravelBatches({ projectId }: { projectId: string }) {
  const workspace = useWorkspace();
  const project = workspace.data?.projects.find((item) => item.id === projectId);
  const candidates = (workspace.data?.candidates ?? []).filter((candidate) => candidate.current_project_id === projectId);
  const travel = workspace.data?.travel ?? [];
  const clearances = workspace.data?.clearances ?? [];
  const siteName = project ? `${project.name ?? project.client} - ${project.country}`.toUpperCase() : "";

  const batches = useMemo<Batch[]>(() => {
    const map = new Map<string, Batch>();
    candidates.forEach((candidate) => {
      const detail = travel.find((item) => item.candidate_id === candidate.id) as
        | (typeof travel)[number] & { arrival_date?: string | null }
        | undefined;
      if (!detail?.flight_date) return;
      const clearance = clearances.find((item) => item.candidate_id === candidate.id && item.project_id === projectId);
      const legs = parseLegs((detail as { connections?: unknown }).connections);
      const lastLeg = legs[legs.length - 1];
      const key = `${detail.flight_date}|${detail.flight_number}|${legs.map((leg) => leg.flightNumber).join("|")}`;
      const entry =
        map.get(key) ??
        ({
          label: "",
          flightDate: detail.flight_date,
          flightNumber: detail.flight_number,
          route: [detail.departure_airport, detail.arrival_airport, ...legs.map((leg) => leg.to)].join(" → "),
          departureAirport: detail.departure_airport,
          arrivalAirport: detail.arrival_airport,
          departureTime: detail.departure_time ?? "",
          arrivalDate: detail.arrival_date ?? detail.flight_date,
          arrivalTime: detail.arrival_time ?? "",
          legs,
          travellers: [],
        } satisfies Batch);
      entry.travellers.push({
        id: candidate.id,
        employeeNumber: (candidate as { employee_number?: string | null }).employee_number ?? "",
        surname: candidate.surname ?? "",
        name: candidate.name,
        trade: candidate.trade ?? "",
        passport: candidate.passport_number ?? "",
        visa: clearance?.visa_cleared ? "YES" : "NO",
        medical: clearance?.medical_cleared ? "YES" : "NO",
        police: clearance?.police_cleared ? "YES" : "NO",
        arrival: lastLeg ? [lastLeg.arrivalDate ? formatDate(lastLeg.arrivalDate) : "", lastLeg.arrivalTime ?? ""].filter(Boolean).join(" ") : [entry.arrivalDate ? formatDate(entry.arrivalDate) : "", entry.arrivalTime].filter(Boolean).join(" "),
        ticketNumber: (detail as { ticket_number?: string | null }).ticket_number ?? "",
      });
      map.set(key, entry);
    });
    return Array.from(map.values())
      .sort((a, b) => a.flightDate.localeCompare(b.flightDate) || a.flightNumber.localeCompare(b.flightNumber))
      .map((batch, index) => ({ ...batch, label: `Batch ${index + 1}` }));
  }, [candidates, travel, clearances, projectId]);

  function sheetRows(batch: Batch) {
    const rows: Array<Array<string>> = [
      [siteName],
      [`${batch.label} · TRAVELLING ON ${formatDate(batch.flightDate)} · ${[batch.flightNumber, ...batch.legs.map((leg) => leg.flightNumber)].join(" / ")} · ${batch.route.replace(/ → /g, " - ")}`],
      ["EMP NO", "NAME", "PASSPORT", "TICKET NO", "TRADE", "VISA", "MED", "SHOES", "TEST", "ARRIVAL DATE & TIME"],
      [],
    ];
    batch.travellers.forEach((traveller) => {
      rows.push([
        traveller.employeeNumber,
        [traveller.surname, traveller.name].filter(Boolean).join(" ").toUpperCase(),
        traveller.passport,
        traveller.ticketNumber,
        traveller.trade.toUpperCase(),
        traveller.visa,
        traveller.medical,
        traveller.police,
        "",
        traveller.arrival,
      ]);
    });
    return rows;
  }

  async function downloadExcel(selection: Batch[], fileName: string) {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    selection.forEach((batch) => {
      const sheet = XLSX.utils.aoa_to_sheet(sheetRows(batch));
      sheet["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 6 }, { wch: 6 }, { wch: 7 }, { wch: 6 }, { wch: 24 }];
      XLSX.utils.book_append_sheet(book, sheet, batch.label.slice(0, 31));
    });
    XLSX.writeFile(book, fileName);
  }

  async function downloadWord(batch: Batch) {
    const {
      Document,
      Packer,
      Paragraph,
      TextRun,
      Table,
      TableRow,
      TableCell,
      WidthType,
      AlignmentType,
      BorderStyle,
      ShadingType,
      ImageRun,
    } = await import("docx");

    const slashDate = (value?: string) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    };

    const logoResponse = await fetch(logoAsset.url);
    if (!logoResponse.ok) throw new Error("The company logo could not be loaded.");
    const logoData = await logoResponse.arrayBuffer();

    const border = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
    const borders = { top: border, bottom: border, left: border, right: border };
    const cell = (text: string, opts?: { bold?: boolean; width?: number; shaded?: boolean }) =>
      new TableCell({
        borders,
        width: { size: opts?.width ?? 2000, type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        ...(opts?.shaded ? { shading: { fill: "EFEFEF", type: ShadingType.CLEAR } } : {}),
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: opts?.bold ?? false })] })],
      });

    const header = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [1800, 3480, 1800, 2280],
      rows: [
        new TableRow({ children: [cell("SITE", { bold: true, width: 1800, shaded: true }), cell(siteName, { bold: true, width: 3480 }), cell("BATCH", { bold: true, width: 1800, shaded: true }), cell(batch.label.toUpperCase(), { bold: true, width: 2280 })] }),
        new TableRow({ children: [cell("DATE", { bold: true, width: 1800, shaded: true }), cell(slashDate(new Date().toISOString().slice(0, 10)), { width: 3480 }), cell("DATE OF TRAVEL", { bold: true, width: 1800, shaded: true }), cell(slashDate(batch.flightDate), { bold: true, width: 2280 })] }),
      ],
    });

    const travelDetails = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [1336, 1336, 1336, 1338, 1338, 1338, 1338],
      rows: [
        new TableRow({ children: ["AIRLINE", "FROM", "TO", "DATE OF DEPARTURE", "TIME OF DEPARTURE", "DATE OF ARRIVAL", "TIME OF ARRIVAL"].map((text, index) => cell(text, { bold: true, shaded: true, width: index < 3 ? 1336 : 1338 })) }),
        new TableRow({
          children: [
            cell(batch.flightNumber, { bold: true, width: 1336 }),
            cell(batch.departureAirport.toUpperCase(), { bold: true, width: 1336 }),
            cell(batch.arrivalAirport.toUpperCase(), { bold: true, width: 1336 }),
            cell(slashDate(batch.flightDate), { bold: true, width: 1338 }),
            cell(batch.departureTime, { bold: true, width: 1338 }),
            cell(slashDate(batch.arrivalDate), { bold: true, width: 1338 }),
            cell(batch.arrivalTime, { bold: true, width: 1338 }),
          ],
        }),
        ...batch.legs.map((leg) =>
          new TableRow({
            children: [
              cell(leg.flightNumber.toUpperCase(), { bold: true, width: 1336 }),
              cell(leg.from.toUpperCase(), { bold: true, width: 1336 }),
              cell(leg.to.toUpperCase(), { bold: true, width: 1336 }),
              cell(slashDate(leg.departureDate), { bold: true, width: 1338 }),
              cell(leg.departureTime ?? "", { bold: true, width: 1338 }),
              cell(slashDate(leg.arrivalDate), { bold: true, width: 1338 }),
              cell(leg.arrivalTime ?? "", { bold: true, width: 1338 }),
            ],
          }),
        ),
      ],
    });

    const manifest = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [500, 1500, 3260, 2100, 2000],
      rows: [
        new TableRow({ children: [cell("#", { bold: true, width: 500, shaded: true }), cell("EMP NO", { bold: true, width: 1500, shaded: true }), cell("NAME", { bold: true, width: 3260, shaded: true }), cell("PASSPORT NO.", { bold: true, width: 2100, shaded: true }), cell("DISCIPLINE", { bold: true, width: 2000, shaded: true })] }),
        ...batch.travellers.map((traveller, index) =>
          new TableRow({
            children: [
              cell(String(index + 1), { width: 500 }),
              cell(traveller.employeeNumber, { width: 1500 }),
              cell([traveller.name, traveller.surname].filter(Boolean).join(" ").toUpperCase(), { width: 3260 }),
              cell(traveller.passport, { width: 2100 }),
              cell(traveller.trade.toUpperCase(), { width: 2000 }),
            ],
          }),
        ),
      ],
    });

    const doc = new Document({
      styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
      sections: [
        {
          properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 180 },
              children: [
                new ImageRun({
                  type: "png",
                  data: logoData,
                  transformation: { width: 280, height: 73 },
                  altText: { title: "Al Taher Liaison", description: "Al Taher Liaison company logo", name: "Company logo" },
                }),
              ],
            }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: "TRAVEL MANIFEST", bold: true, size: 32 })] }),
            header,
            new Paragraph({ spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "TRAVEL DETAILS", bold: true })] }),
            travelDetails,
            new Paragraph({ spacing: { before: 240 }, children: [new TextRun("")] }),
            manifest,
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveBlob(blob, `travel-manifest-${slug(batch.label)}-${batch.flightDate}.docx`);
  }

  const upcoming = batches.filter((batch) => daysUntil(batch.flightDate) >= 0 && daysUntil(batch.flightDate) <= 30);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Batches are numbered by travel date — the earliest flight is Batch 1.</p>
        <Button size="sm" variant="outline" disabled={!upcoming.length} onClick={() => void downloadExcel(upcoming, `travel-batches-next-30-days.xlsx`)}>
          <Download className="size-4" /> Download all upcoming batches
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {batches.map((batch) => (
          <article key={`${batch.flightDate}-${batch.flightNumber}-${batch.legs.map((leg) => leg.flightNumber).join("-")}`} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{batch.label} · {[batch.flightNumber, ...batch.legs.map((leg) => leg.flightNumber)].join(" / ")}</p>
                <p className="text-xs text-muted-foreground">{formatDate(batch.flightDate)} · {batch.route}</p>
              </div>
              <Badge variant="secondary">{batch.travellers.length} travelling</Badge>
            </div>
            {(() => {
              const lastLeg = batch.legs[batch.legs.length - 1];
              const finalArrivalDate = lastLeg?.arrivalDate || batch.arrivalDate;
              const finalArrivalTime = lastLeg?.arrivalTime || batch.arrivalTime;
              return (
                <div className="mt-3 grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs sm:grid-cols-2">
                  <div>
                    <p className="font-medium uppercase tracking-wide text-muted-foreground">Departure (first flight)</p>
                    <p className="mt-0.5 font-medium">{[formatDate(batch.flightDate), batch.departureTime].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <div>
                    <p className="font-medium uppercase tracking-wide text-muted-foreground">Arrival (last flight)</p>
                    <p className="mt-0.5 font-medium">{[finalArrivalDate ? formatDate(finalArrivalDate) : "", finalArrivalTime].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                </div>
              );
            })()}
            <div className="mt-3 overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium">Employee no</th>
                    <th className="px-2 py-1.5 font-medium">Name</th>
                    <th className="px-2 py-1.5 font-medium">Trade</th>
                    <th className="px-2 py-1.5 font-medium">Passport</th>
                    <th className="px-2 py-1.5 font-medium">Ticket no</th>
                    <th className="px-2 py-1.5 font-medium">Arrival</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.travellers.map((traveller, index) => (
                    <tr key={index} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5 font-medium">{traveller.employeeNumber || "—"}</td>
                      <td className="px-2 py-1.5">{[traveller.surname, traveller.name].filter(Boolean).join(" ")}</td>
                      <td className="px-2 py-1.5">{traveller.trade || "—"}</td>
                      <td className="px-2 py-1.5">{traveller.passport || "—"}</td>
                      <td className="px-2 py-1.5">{traveller.ticketNumber || "—"}</td>
                      <td className="px-2 py-1.5">{traveller.arrival || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void downloadExcel([batch], `${slug(batch.label)}-${batch.flightDate}.xlsx`)}>
                <Download className="size-4" /> Download Excel
              </Button>
              <Button size="sm" variant="outline" onClick={() => void downloadWord(batch)}>
                <FileText className="size-4" /> Download Word
              </Button>
              <ViewManifestButton batch={batch} siteName={siteName} />
              <AddToBatchButton batch={batch} candidates={candidates} />
            </div>
          </article>
        ))}
        {!batches.length ? <p className="text-sm text-muted-foreground">No flights have been entered for this project yet.</p> : null}
      </div>
    </div>
  );
}

function ViewManifestButton({ batch, siteName }: { batch: Batch; siteName: string }) {
  const [busy, setBusy] = useState(false);

  async function openManifestPdf() {
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const slashDate = (value?: string) => {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
      };

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Logo, centered at top
      try {
        const response = await fetch(logoAsset.url);
        if (response.ok) {
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("logo read failed"));
            reader.readAsDataURL(blob);
          });
          const logoWidth = 140;
          const logoHeight = 140 * (73 / 280);
          doc.addImage(dataUrl, "PNG", (pageWidth - logoWidth) / 2, 24, logoWidth, logoHeight);
        }
      } catch {
        // Logo is decorative; continue without it.
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("TRAVEL MANIFEST", pageWidth / 2, 84, { align: "center" });

      autoTable(doc, {
        startY: 96,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 9, halign: "center", cellPadding: 4 },
        body: [
          [
            { content: "SITE", styles: { fontStyle: "bold", fillColor: [239, 239, 239] } },
            { content: siteName, styles: { fontStyle: "bold" } },
            { content: "BATCH", styles: { fontStyle: "bold", fillColor: [239, 239, 239] } },
            { content: batch.label.toUpperCase(), styles: { fontStyle: "bold" } },
          ],
          [
            { content: "DATE", styles: { fontStyle: "bold", fillColor: [239, 239, 239] } },
            { content: slashDate(new Date().toISOString().slice(0, 10)) },
            { content: "DATE OF TRAVEL", styles: { fontStyle: "bold", fillColor: [239, 239, 239] } },
            { content: slashDate(batch.flightDate), styles: { fontStyle: "bold" } },
          ],
        ],
      });

      const afterHeader = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      doc.setFontSize(10);
      doc.text("TRAVEL DETAILS", pageWidth / 2, afterHeader + 18, { align: "center" });

      autoTable(doc, {
        startY: afterHeader + 26,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 8, halign: "center", cellPadding: 3 },
        headStyles: { fontStyle: "bold", fillColor: [239, 239, 239], textColor: [0, 0, 0] },
        bodyStyles: { fontStyle: "bold" },
        head: [["AIRLINE", "FROM", "TO", "DATE OF DEPARTURE", "TIME OF DEPARTURE", "DATE OF ARRIVAL", "TIME OF ARRIVAL"]],
        body: [
          [batch.flightNumber.toUpperCase(), batch.departureAirport.toUpperCase(), batch.arrivalAirport.toUpperCase(), slashDate(batch.flightDate), batch.departureTime, slashDate(batch.arrivalDate), batch.arrivalTime],
          ...batch.legs.map((leg) => [
            leg.flightNumber.toUpperCase(),
            leg.from.toUpperCase(),
            leg.to.toUpperCase(),
            slashDate(leg.departureDate),
            leg.departureTime ?? "",
            slashDate(leg.arrivalDate),
            leg.arrivalTime ?? "",
          ]),
        ],
      });

      const afterTravel = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      autoTable(doc, {
        startY: afterTravel + 16,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 9, halign: "center", cellPadding: 4 },
        headStyles: { fontStyle: "bold", fillColor: [239, 239, 239], textColor: [0, 0, 0] },
        head: [["#", "EMP NO", "NAME", "PASSPORT NO.", "DISCIPLINE"]],
        body: batch.travellers.map((traveller, index) => [
          String(index + 1),
          traveller.employeeNumber,
          [traveller.name, traveller.surname].filter(Boolean).join(" ").toUpperCase(),
          traveller.passport,
          traveller.trade.toUpperCase(),
        ]),
      });

      const url = URL.createObjectURL(doc.output("blob"));
      window.open(url, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void openManifestPdf()}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} View travel manifest
    </Button>
  );
}

function RequirementsTab({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-4">
      <ProjectDocuments projectId={projectId} />
    </div>
  );
}

function ProjectDocuments({ projectId }: { projectId: string }) {
  const workspace = useWorkspace();
  const downloadZip = useServerFn(downloadProjectDocumentsZip);
  const people = useProjectPeople(projectId);
  const candidates = people.map((entry) => entry.candidate);
  const allDocuments = workspace.data?.documents ?? [];

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function downloadAll() {
    setBusy(true);
    setError("");
    try {
      const { base64, fileName } = await downloadZip({ data: { projectId } });
      const link = document.createElement("a");
      link.href = `data:application/zip;base64,${base64}`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (downloadError) {
      setError((downloadError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Documents by candidate</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Every document on file for each person in this project, including ones uploaded in the Candidate Database and On Site.</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy || !candidates.length} onClick={() => void downloadAll()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download All
        </Button>
      </header>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      <div className="mt-3 space-y-2">
        {people.length ? (
          <div className="hidden items-center gap-3 px-3 py-1 sm:flex" aria-hidden="true">
            <div className="grid min-w-0 flex-1 gap-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
              <span>Name</span>
              <span>Employee no</span>
              <span>Trade</span>
              <span>Passport no</span>
              <span>Stage</span>
            </div>
            <div className="w-24 shrink-0" />
            <div className="w-[124px] shrink-0" />
            <div className="size-4 shrink-0" />
          </div>
        ) : null}
        {people.map((entry) => (
          <CandidateDocumentsRow
            key={entry.candidate.id}
            projectId={projectId}
            candidate={entry.candidate}
            stage={entry.stage}
            documents={allDocuments.filter((document) => document.candidate_id === entry.candidate.id)}
          />
        ))}
        {!people.length ? <p className="text-xs text-muted-foreground">Nobody is in this project yet.</p> : null}
      </div>
    </section>
  );
}

function CandidateDocumentsRow({ projectId, candidate, stage, documents }: { projectId: string; candidate: CandidateRow; stage: string; documents: Array<{ id: string; document_type_id: string; file_name: string; created_at: string; expiry_date: string | null }> }) {
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const resolveType = useServerFn(resolveDocumentType);
  const recordDocument = useServerFn(recordCandidateDocument);
  const downloadCandidateZip = useServerFn(downloadCandidateDocumentsZip);
  const row = candidate as { id: string; name: string; surname?: string | null; candidate_number: string; employee_number?: string | null; trade: string | null; passport_number: string | null };

  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const types = (workspace.data?.documentTypes ?? []).filter((type) => type.is_active);
  const typeName = (id: string) => workspace.data?.documentTypes.find((type) => type.id === id)?.name ?? "Document";
  const documentName = choice === "__new" ? newName.trim() : choice;

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      assertFileSize(documentName, file);
      const path = `${row.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const uploaded = await supabase.storage.from("candidate-documents").upload(path, file);
      if (uploaded.error) throw new Error(uploaded.error.message);
      const type = await resolveType({ data: { name: documentName, category: "candidate" } });
      await recordDocument({ data: { candidateId: row.id, documentTypeId: type.id, fileName: file.name, storagePath: path, projectId } });
      setChoice("");
      setNewName("");
      refresh();
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip() {
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const { base64, fileName } = await downloadCandidateZip({ data: { candidateId: row.id } });
      const link = document.createElement("a");
      link.href = `data:application/zip;base64,${base64}`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (zipError) {
      setDownloadError((zipError as Error).message);
    } finally {
      setDownloadBusy(false);
    }
  }

  return (
    <article className="rounded-md border border-border">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-3 py-2 text-left">
        <span className="grid flex-1 gap-0.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] sm:items-center sm:gap-3">
          <span className="text-sm font-medium">{[row.surname, row.name].filter(Boolean).join(" ")}</span>
          <span className="text-sm text-muted-foreground">{row.employee_number || "—"}</span>
          <span className="text-sm text-muted-foreground">{row.trade || "—"}</span>
          <span className="text-sm text-muted-foreground">{row.passport_number || "—"}</span>
          <span className="text-sm text-muted-foreground">{stage}</span>
        </span>
        <Badge variant="secondary" className="w-24 shrink-0 justify-center">{documents.length} docs</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-[124px] shrink-0 justify-center px-2 text-xs"
          disabled={downloadBusy || !documents.length}
          onClick={(event) => { event.stopPropagation(); void downloadZip(); }}
        >
          {downloadBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Zip
        </Button>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {downloadError ? <p className="px-3 py-1 text-xs text-destructive">{downloadError}</p> : null}
      {open ? (
        <div className="border-t border-border p-3">
          <ul className="space-y-2">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{typeName(document.document_type_id)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {document.file_name} · uploaded {formatDate(document.created_at)}
                    {document.expiry_date ? ` · expires ${formatDate(document.expiry_date)}` : ""}
                  </span>
                </span>
                <DocumentLink documentId={document.id} onDeleted={refresh} />
              </li>
            ))}
            {!documents.length ? <li className="text-xs text-muted-foreground">No documents uploaded yet.</li> : null}
          </ul>

          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-2">
            <div className="min-w-[180px] flex-1">
              <Label className="text-xs text-muted-foreground">Document type</Label>
              <Select value={choice} onValueChange={setChoice}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Choose a document" /></SelectTrigger>
                <SelectContent>
                  {types.map((type) => <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>)}
                  <SelectItem value="__new">+ Add new document type</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {choice === "__new" ? (
              <div className="min-w-[160px] flex-1">
                <Label className="text-xs text-muted-foreground">New document name</Label>
                <Input className="mt-1 h-9" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Trade certificate" />
              </div>
            ) : null}
            <div className="min-w-[180px] flex-1">
              <Label className="text-xs text-muted-foreground">File</Label>
              <Input
                className="mt-1 h-9 text-xs"
                type="file"
                disabled={busy || documentName.length < 2}
                onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }}
              />
            </div>
          </div>
          {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

function TradeRequirementsTab({ projectId, role, candidates }: { projectId: string; role: Role; candidates: CandidateRow[] }) {
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const saveRequirement = useServerFn(setProjectTradeRequirement);
  const removeRequirement = useServerFn(removeProjectTradeRequirement);
  const canEdit = role === "Project Coordinator" || isAdminRole(role);

  const [trade, setTrade] = useState("");
  const [category, setCategory] = useState("");
  const [count, setCount] = useState("1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = (workspace.data?.tradeRequirements ?? []).filter((item) => item.project_id === projectId);

  const FORWARDED = ["Selected", ...MOBILISATION_STAGES] as string[];
  const ON_SITE = ["On Site", "R&R"];
  const travelList = workspace.data?.travel ?? [];
  const travelling = (candidate: CandidateRow) => (candidate as { status: string }).status === "On Site" && isFutureTravel(travelList.find((item) => item.candidate_id === candidate.id)?.flight_date);
  const forwarded = candidates.filter((candidate) => FORWARDED.includes((candidate as { status: string }).status) || travelling(candidate));
  const onSite = candidates.filter((candidate) => ON_SITE.includes((candidate as { status: string }).status) && !travelling(candidate));
  const matches = (candidate: CandidateRow, value: string, cat: string) =>
    (candidate.trade ?? "").toLowerCase() === value.toLowerCase() && (!cat || hasAllCategories(candidate.category, parseCategories(cat)));
  const filledFor = (value: string, cat: string) => forwarded.filter((candidate) => matches(candidate, value, cat)).length;
  const onSiteFor = (value: string, cat: string) => onSite.filter((candidate) => matches(candidate, value, cat)).length;
  const totalRequired = rows.reduce((sum, row) => sum + row.required_count, 0);

  async function add() {
    setError("");
    const value = trade.trim();
    const number = Number(count);
    if (value.length < 2 || !Number.isFinite(number) || number < 1) {
      setError("Enter a trade and how many people are needed.");
      return;
    }
    setBusy(true);
    try {
      await saveRequirement({ data: { projectId, trade: value, category: category.trim(), requiredCount: Math.round(number) } });
      setTrade("");
      setCategory("");
      setCount("1");
      refresh();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Break this project&apos;s headcount down by trade. Add as many trades as the project needs.</p>

      {canEdit ? (
        <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Trade and category</Label>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              <TradeCategorySelect trade={trade} category={category} onChange={(next) => { setTrade(next.trade); setCategory(next.category); }} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Number required</Label>
            <Input className="mt-1.5" type="number" min={1} value={count} onChange={(event) => setCount(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void add()} disabled={busy}><Plus className="size-4" /> Add trade</Button>
          </div>
          {error ? <p className="text-xs text-destructive md:col-span-3">{error}</p> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Trade</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Required</th>
              <th className="px-4 py-2.5">Forwarded to mobilisation</th>
              <th className="px-4 py-2.5">On site</th>
              <th className="px-4 py-2.5">Still needed</th>
              {canEdit ? <th className="px-4 py-2.5" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowCategory = (row as { category?: string | null }).category ?? "";
              const filled = filledFor(row.trade, rowCategory);
              const onsite = onSiteFor(row.trade, rowCategory);
              const gap = Math.max(row.required_count - filled - onsite, 0);
              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium">{row.trade}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{rowCategory || "—"}</td>
                  <td className="px-4 py-2.5">{row.required_count}</td>
                  <td className="px-4 py-2.5">{filled}</td>
                  <td className="px-4 py-2.5">{onsite}</td>
                  <td className="px-4 py-2.5">
                    {gap === 0 ? <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600">Complete</Badge> : <span>{gap}</span>}
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-2.5 text-right">
                      <Button size="icon" variant="ghost" aria-label="Remove trade" onClick={async () => { await removeRequirement({ data: { requirementId: row.id } }); refresh(); }}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!rows.length ? (
              <tr><td colSpan={canEdit ? 7 : 6} className="px-4 py-6 text-center text-sm text-muted-foreground">No trades added yet.</td></tr>
            ) : null}
          </tbody>
          {rows.length ? (
            <tfoot className="border-t border-border bg-muted/30 text-xs">
              <tr>
                <td className="px-4 py-2.5 font-medium">Total</td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 font-medium">{totalRequired}</td>
                <td className="px-4 py-2.5 font-medium">{forwarded.length}</td>
                <td className="px-4 py-2.5 font-medium">{onSite.length}</td>
                <td className="px-4 py-2.5" colSpan={canEdit ? 2 : 1}>{candidates.length} people in this project</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

type ProjectPerson = { candidate: CandidateRow; stage: string };

function useProjectPeople(projectId: string): ProjectPerson[] {
  const workspace = useWorkspace();
  const all = workspace.data?.candidates ?? [];
  const assignments = workspace.data?.assignments ?? [];
  const current = all.filter((candidate) => candidate.current_project_id === projectId);
  const currentIds = new Set(current.map((candidate) => candidate.id));
  const pastIds = new Set(
    assignments.filter((row) => row.project_id === projectId && !currentIds.has(row.candidate_id)).map((row) => row.candidate_id),
  );
  const past = all.filter((candidate) => pastIds.has(candidate.id));
  return [
    ...current.map((candidate) => ({ candidate: candidate as CandidateRow, stage: (candidate as { status: string }).status })),
    ...past.map((candidate) => ({ candidate: candidate as CandidateRow, stage: "EOC" })),
  ].sort((a, b) => compareEmployeeNumber(a.candidate, b.candidate));
}

function employeeNumberOf(candidate: CandidateRow): string {
  return ((candidate as { employee_number?: string | null }).employee_number ?? "").trim();
}

function compareEmployeeNumber(a: CandidateRow, b: CandidateRow): number {
  const left = employeeNumberOf(a);
  const right = employeeNumberOf(b);
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function CancelProjectButton({ projectId, onDone }: { projectId: string; onDone: (text: string) => void }) {
  const cancel = useServerFn(cancelProject);
  const refresh = useRefreshWorkspace();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await cancel({ data: { projectId, reason } });
      setOpen(false);
      setReason("");
      refresh();
      onDone("Project cancelled. Everyone assigned to it is back in the Candidate Database as Available.");
    } catch (cancelError) {
      setError((cancelError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
        Cancel project
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-sm font-medium text-destructive">Cancel this project?</p>
      <p className="mt-1 text-xs text-muted-foreground">Everyone assigned to it goes back to Available. Their project history is kept.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Label className="text-xs text-muted-foreground">Reason</Label>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is it cancelled?" className="h-9" />
        </div>
        <Button size="sm" variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => void submit()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Confirm cancellation"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>Keep project</Button>
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

const ALL_EMPLOYEE_STAGES = ["Selected", ...MOBILISATION_STAGES, "On Site", "R&R", "EOC"];

function AllEmployeesTab({ projectId, role, onOpen }: { projectId: string; role: Role; onOpen: (id: string) => void }) {
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const newContract = useServerFn(startNewContract);
  const canRehire = role === "Project Coordinator" || role === "Mobilisation Executive" || isAdminRole(role);
  const [rehireBusy, setRehireBusy] = useState("");
  const [rehireError, setRehireError] = useState("");
  async function rehire(id: string) {
    setRehireBusy(id); setRehireError("");
    try { await newContract({ data: { candidateId: id, projectId } }); refresh(); }
    catch (error) { setRehireError((error as Error).message); }
    finally { setRehireBusy(""); }
  }
  const project = workspace.data?.projects.find((item) => item.id === projectId);
  const clearances = workspace.data?.clearances ?? [];
  const travel = workspace.data?.travel ?? [];
  const people = useProjectPeople(projectId).filter((entry) => ALL_EMPLOYEE_STAGES.includes(entry.stage));

  function rowFor(entry: ProjectPerson) {
    const candidate = entry.candidate as unknown as Record<string, string | null>;
    const clearance = clearances.find((item) => item.candidate_id === candidate["id"] && item.project_id === projectId);
    const trip = travel.find((item) => item.candidate_id === candidate["id"]);
    return {
      employee: candidate["employee_number"] ?? "",
      surname: candidate["surname"] ?? "",
      name: candidate["name"] ?? "",
      trade: candidate["trade"] ?? "",
      dob: candidate["date_of_birth"] ?? "",
      passport: candidate["passport_number"] ?? "",
      issue: candidate["passport_issue_date"] ?? "",
      expiry: candidate["passport_expiry"] ?? "",
      stage:
        entry.stage === "On Site" && trip?.flight_date && isFutureTravel(trip.flight_date)
          ? "Travel scheduled"
          : (MOBILISATION_STAGES as readonly string[]).includes(entry.stage) || entry.stage === "Selected"
            ? "Mobilisation"
            : entry.stage,
      medical: clearance?.medical_date ?? "",
      visa: clearance?.visa_issue_date ?? "",
      police: clearance?.police_date ?? "",
      travelDate: trip?.flight_date ?? "",
    };
  }

  async function downloadExcel() {
    const XLSX = await import("xlsx");
    const header = [
      "Employee number",
      "Surname",
      "Name",
      "Trade",
      "Date of Birth",
      "Passport number",
      "Issue Date",
      "Expiry Date",
      "Stage",
      "Medical Date",
      "Visa Date",
      "Police Clearance Date",
      "Travel Date",
    ];
    const title = `${project?.name ?? "Project"} - ${project?.client ?? ""} - ${project?.country ?? ""}`;
    const rows: (string | number)[][] = [[title], [], header];
    for (const entry of people) {
      const row = rowFor(entry);
      const asDate = (value: string) => (value ? formatDate(value) : "");
      rows.push([row.employee, row.surname, row.name, row.trade, asDate(row.dob), row.passport, asDate(row.issue), asDate(row.expiry), row.stage, asDate(row.medical), asDate(row.visa), asDate(row.police), asDate(row.travelDate)]);
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "All Employees");
    XLSX.writeFile(book, `${slug(project?.name ?? "project")}-all-employees.xlsx`);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">All employees</h2>
          <p className="mt-1 text-xs text-muted-foreground">Everyone in mobilisation, on site or marked EOC for this project.</p>
        </div>
        <Button size="sm" variant="outline" disabled={!people.length} onClick={() => void downloadExcel()}>
          <Download className="size-4" /> Download Excel
        </Button>
      </div>

      {rehireError ? <p className="mt-3 text-sm text-destructive">{rehireError}</p> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Employee no</th>
              <th className="py-2 pr-3 font-semibold">Surname</th>
              <th className="py-2 pr-3 font-semibold">Name</th>
              <th className="py-2 pr-3 font-semibold">Trade</th>
              <th className="py-2 pr-3 font-semibold">Passport no</th>
              <th className="py-2 pr-3 font-semibold">Stage</th>
              <th className="py-2 pr-3 font-semibold">Medical</th>
              <th className="py-2 pr-3 font-semibold">Visa</th>
              <th className="py-2 pr-3 font-semibold">Police</th>
              <th className="py-2 pr-3 font-semibold">Travel</th>
              <th className="py-2 pr-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {people.map((entry) => {
              const row = rowFor(entry);
              const id = (entry.candidate as { id: string }).id;
              return (
                <tr key={id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3">{row.employee || "—"}</td>
                  <td className="py-2 pr-3">{row.surname || "—"}</td>
                  <td className="py-2 pr-3">
                    <button className="text-left font-medium text-foreground hover:underline" onClick={() => onOpen(id)}>{row.name}</button>
                  </td>
                  <td className="py-2 pr-3">{row.trade || "—"}</td>
                  <td className="py-2 pr-3">{row.passport || "—"}</td>
                  <td className="py-2 pr-3"><Badge variant="outline" className={statusTone(row.stage)}>{row.stage}</Badge></td>
                  <td className="py-2 pr-3">{formatDate(row.medical)}</td>
                  <td className="py-2 pr-3">{formatDate(row.visa)}</td>
                  <td className="py-2 pr-3">{formatDate(row.police)}</td>
                  <td className="py-2 pr-3">{formatDate(row.travelDate)}</td>
                  <td className="py-2 pr-3 text-right">
                    {entry.stage === "EOC" && canRehire && (entry.candidate as { status: string; current_project_id: string | null }).status === "Available" && !(entry.candidate as { current_project_id: string | null }).current_project_id ? (
                      <Button size="sm" variant="outline" disabled={rehireBusy === id} onClick={() => void rehire(id)}>
                        {rehireBusy === id ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} New contract
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!people.length ? (
              <tr><td colSpan={11} className="py-8 text-center text-sm text-muted-foreground">No one has reached mobilisation for this project yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}