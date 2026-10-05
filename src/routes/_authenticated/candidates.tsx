import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowDown, ArrowUp, Ban, Check, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, Plus, Search, Trash2, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { AppShell } from "@/components/app-shell";
import { DocumentLink } from "@/components/document-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  addCandidate,
  appendCandidateRemark,
  assignCandidateToProject,
  bulkUpsertCandidates,
  readPassportDetails,
  checkPassportNumber,
  checkSimilarCandidate,
  deleteCandidate,
  downloadCandidateDocumentsZip,
  extractCandidatePhoto,
  getCandidatePhotoLink,
  markCandidateAvailable,
  setCandidateUnavailable,
  setCandidateBlacklisted,
  setCandidatePhoto,
  recordCandidateDocument,
  resolveDocumentType,
  updateCandidateDetails,
} from "@/lib/operations.functions";
import { isAdminRole, STATUSES, formatDate, statusChangedAt, statusTone, useRefreshWorkspace, useWorkspace, type Candidate, type Role } from "@/lib/workspace";
import { CategoryMultiSelect, TradeCategoryMultiSelect, hasAllCategories, joinCategories, parseCategories, useTradeOptions } from "@/components/trade-picker";

export const Route = createFileRoute("/_authenticated/candidates")({
  validateSearch: (search: Record<string, unknown>) => ({ candidate: typeof search["candidate"] === "string" ? (search["candidate"] as string) : undefined }),
  head: () => ({
    meta: [
      { title: "Candidate Database | Talent Operations" },
      { name: "description", content: "Search, filter and maintain the agency candidate pool with append-only remarks and document records." },
      { property: "og:title", content: "Candidate Database | Talent Operations" },
      { property: "og:description", content: "Search, filter and maintain the agency candidate pool with append-only remarks and document records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CandidatesPage,
});

const emptyForm = { candidateNumber: "", surname: "", name: "", dateOfBirth: "", placeOfBirth: "", address: "", email: "", phone: "", contactNo2: "", reference: "", bankHolder: "", bankAccount: "", bankName: "", bankBranch: "", bankIfsc: "", bankSwift: "", candidateKind: "New Candidate" as "New Candidate" | "Ex Candidate", trade: "", category: "", experienceYears: "0", rating: "0", passportNumber: "", passportIssueDate: "", passportExpiry: "", passportPlaceOfIssue: "", remark: "" };

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function ageFrom(dob: string | null | undefined) {
  if (!dob) return "—";
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 120 ? String(age) : "—";
}

function CandidatesPage() {
  const { user, role } = Route.useRouteContext() as { user: { id: string; email?: string }; role: Role };
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const setUnavailable = useServerFn(setCandidateUnavailable);
  const setBlacklisted = useServerFn(setCandidateBlacklisted);
  const executeBulkUpsert = useServerFn(bulkUpsertCandidates);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [trade, setTrade] = useState<string>("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [minRating, setMinRating] = useState("0");
  const [maxRating, setMaxRating] = useState("10");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "rating" | "trade">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const search = Route.useSearch() as { candidate?: string };
  const [selectedId, setSelectedId] = useState<string | null>(search.candidate ?? null);
  const [creating, setCreating] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  // Bulk Upload states
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    total: number;
    created: number;
    updated: number;
    failed: number;
    errors: { row: number; error: string }[];
  } | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Candidate | null>(null);
  const removeCandidate = useServerFn(deleteCandidate);

  // Go back to the first page whenever the result set or page size changes
  useEffect(() => {
    setPage(1);
  }, [query, status, trade, categories, minRating, maxRating, availableOnly, sortBy, sortDir, pageSize]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        alert("The uploaded Excel file contains no worksheets.");
        setUploading(false);
        return;
      }
      const sheet = workbook.Sheets[firstSheetName];
      if (!sheet) {
        alert("Could not read the worksheet data.");
        setUploading(false);
        return;
      }
      const rawRows = XLSX.utils.sheet_to_json(sheet);

      if (!rawRows || rawRows.length === 0) {
        alert("The selected Excel sheet contains no data rows.");
        setUploading(false);
        return;
      }

      const result = await executeBulkUpsert({ data: { rows: rawRows } });
      setUploadResult(result);
      refresh();
    } catch (err: any) {
      alert("Error reading Excel file: " + (err.message || String(err)));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const toggleStatus = useMutation({
    mutationFn: async ({ candidateId, unavailable }: { candidateId: string; unavailable: boolean }) => {
      await setUnavailable({ data: { candidateId, unavailable } });
    },
    onSuccess: () => {
      setRowError(null);
      refresh();
    },
    onError: (error: Error) => setRowError(error.message),
  });

  const toggleBlacklist = useMutation({
    mutationFn: async ({ candidateId, blacklisted }: { candidateId: string; blacklisted: boolean }) => {
      await setBlacklisted({ data: { candidateId, blacklisted } });
    },
    onSuccess: () => {
      setRowError(null);
      refresh();
    },
    onError: (error: Error) => setRowError(error.message),
  });

  const destroy = useMutation({
    mutationFn: async (candidateId: string) => {
      await removeCandidate({ data: { candidateId } });
    },
    onSuccess: () => {
      setRowError(null);
      setPendingDelete(null);
      setSelectedId(null);
      refresh();
    },
    onError: (error: Error) => setRowError(error.message),
  });
  const canDelete = role === "Data Entry" || role === "Recruiter" || isAdminRole(role);

  const data = workspace.data;
  const options = useTradeOptions();
  const trades = options.tradeNames;
  const categoryChoices = trade === "all" ? options.allCategories : options.categoriesFor(trade);

  const filtered = useMemo(() => {
    const rows = (data?.candidates ?? []).filter((candidate) => {
      const text = `${candidate.surname ?? ""} ${candidate.name} ${candidate.candidate_number} ${candidate.passport_number ?? ""}`.toLowerCase();
      if (query && !text.includes(query.toLowerCase())) return false;
      if (availableOnly && candidate.status !== "Available") return false;
      if (status !== "all" && candidate.status !== status) return false;
      if (trade !== "all" && candidate.trade !== trade) return false;
      if (categories.length > 0 && !hasAllCategories(candidate.category, categories)) return false;
      if (Number(candidate.rating) < Number(minRating) || Number(candidate.rating) > Number(maxRating)) return false;
      return true;
    });
    const direction = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortBy === "rating") return (Number(a.rating) - Number(b.rating)) * direction;
      if (sortBy === "trade") return (`${a.trade ?? ""} ${a.category ?? ""}`).localeCompare(`${b.trade ?? ""} ${b.category ?? ""}`) * direction;
      return `${a.surname ?? ""} ${a.name}`.localeCompare(`${b.surname ?? ""} ${b.name}`) * direction;
    });
  }, [data, query, status, trade, categories, minRating, maxRating, availableOnly, sortBy, sortDir]);

  // Pagination (client-side)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages); // clamps if rows get deleted
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = useMemo(() => filtered.slice(pageStart, pageStart + pageSize), [filtered, pageStart, pageSize]);

  const selected = (data?.candidates ?? []).find((candidate) => candidate.id === selectedId) ?? null;
  const projectName = (id: string | null) => data?.projects.find((project) => project.id === id)?.name ?? "—";

  return (
    <AppShell role={role} email={user.email}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Candidate Database</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === "Recruiter" ? "View the pool and assign Available candidates to a project." : role === "Data Entry" || isAdminRole(role) ? "Create and maintain candidate records, remarks and documents." : "Read-only view of the candidate pool."}
          </p>
        </div>
        {(role === "Data Entry" || role === "Recruiter" || isAdminRole(role)) && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setBulkModalOpen(true);
                setUploadResult(null);
              }}
            >
              <FileSpreadsheet className="size-4 mr-1.5 text-emerald-600" /> Bulk Import Excel
            </Button>
            <Button onClick={() => { setCreating(true); setSelectedId(null); }}>
              <Plus className="size-4" /> New candidate
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-9">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, surname, passport no or candidate no" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((item) => <SelectItem key={item} value={item}>{item === "Blacklisted" ? "BLACKLISTED" : item}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={trade} onValueChange={(value) => { setTrade(value); setCategories([]); }}>
          <SelectTrigger><SelectValue placeholder="Trade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All trades</SelectItem>
            {trades.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
        <CategoryMultiSelect options={categoryChoices} selected={categories} onChange={setCategories} placeholder="All categories" />
        <div className="flex items-center gap-2">
          <Input type="number" min="0" max="10" step="0.1" value={minRating} onChange={(event) => setMinRating(event.target.value)} aria-label="Minimum rating" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="number" min="0" max="10" step="0.1" value={maxRating} onChange={(event) => setMaxRating(event.target.value)} aria-label="Maximum rating" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />
          Available only
        </label>
        <div className="flex items-center gap-2 md:col-span-2">
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as "name" | "rating" | "trade")}>
            <SelectTrigger><SelectValue placeholder="Sort by" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort by name</SelectItem>
              <SelectItem value="rating">Sort by rating</SelectItem>
              <SelectItem value="trade">Sort by trade</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={sortDir === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}
            title={sortDir === "asc" ? "Ascending" : "Descending"}
            onClick={() => setSortDir((current) => (current === "asc" ? "desc" : "asc"))}
          >
            {sortDir === "asc" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
          </Button>
        </div>
      </div>

      {workspace.isLoading ? <p className="mt-8 text-sm text-muted-foreground">Loading candidates…</p> : null}
      {workspace.error ? <p className="mt-8 text-sm text-destructive">{(workspace.error as Error).message}</p> : null}
      {rowError ? <p className="mt-3 text-sm text-destructive">{rowError}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Surname</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Trade</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Experience</th>
              <th className="px-4 py-3">Passport no</th>
              <th className="px-4 py-3">Passport expiry</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Project</th>
              {canDelete ? <th className="px-4 py-3 text-right">Delete</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageRows.map((candidate) => (
              <tr key={candidate.id} className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => { setSelectedId(candidate.id); setCreating(false); }}>
                <td className="px-4 py-3 font-medium">{candidate.surname || "—"}</td>
                <td className="px-4 py-3">
                  <span className="block font-medium">{candidate.name}</span>
                  <span className="block text-xs text-muted-foreground">{candidate.candidate_number}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{candidate.trade || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{candidate.category || "—"}</td>
                <td className="px-4 py-3">{candidate.experience_years} yrs</td>
                <td className="px-4 py-3 text-muted-foreground">{candidate.passport_number || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(candidate.passport_expiry)}</td>
                <td className="px-4 py-3">{Number(candidate.rating).toFixed(1)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={statusTone(candidate.status)}>
                      {candidate.status === "Blacklisted" ? "BLACKLISTED" : candidate.status}
                    </Badge>
                    {(role === "Data Entry" || role === "Recruiter" || isAdminRole(role)) && !candidate.current_project_id ? (
                      <div className="flex items-center gap-0.5">
                        {candidate.status === "Available" ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 text-destructive hover:bg-destructive/10"
                              disabled={toggleStatus.isPending || toggleBlacklist.isPending}
                              aria-label="Mark unavailable"
                              title="Mark unavailable"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleStatus.mutate({ candidateId: candidate.id, unavailable: true });
                              }}
                            >
                              <X className="size-3.5 text-destructive" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 text-destructive hover:bg-destructive/10"
                              disabled={toggleStatus.isPending || toggleBlacklist.isPending}
                              aria-label="Blacklist candidate"
                              title="Blacklist candidate"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleBlacklist.mutate({ candidateId: candidate.id, blacklisted: true });
                              }}
                            >
                              <Ban className="size-3.5 text-destructive" />
                            </Button>
                          </>
                        ) : candidate.status === "Unavailable" ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 text-emerald-600 hover:bg-emerald-500/10"
                              disabled={toggleStatus.isPending || toggleBlacklist.isPending}
                              aria-label="Mark available"
                              title="Mark available"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleStatus.mutate({ candidateId: candidate.id, unavailable: false });
                              }}
                            >
                              <Check className="size-3.5 text-emerald-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 text-destructive hover:bg-destructive/10"
                              disabled={toggleStatus.isPending || toggleBlacklist.isPending}
                              aria-label="Blacklist candidate"
                              title="Blacklist candidate"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleBlacklist.mutate({ candidateId: candidate.id, blacklisted: true });
                              }}
                            >
                              <Ban className="size-3.5 text-destructive" />
                            </Button>
                          </>
                        ) : candidate.status === "Blacklisted" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-emerald-600 hover:bg-emerald-500/10"
                            disabled={toggleStatus.isPending || toggleBlacklist.isPending}
                            aria-label="Remove from blacklist"
                            title="Remove from blacklist (return to Available)"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleBlacklist.mutate({ candidateId: candidate.id, blacklisted: false });
                            }}
                          >
                            <Check className="size-3.5 text-emerald-600" />
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <span className="mt-1 block text-[11px] italic leading-tight text-muted-foreground">
                    since {formatDate(statusChangedAt(candidate, data?.audit ?? []))}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{projectName(candidate.current_project_id)}</td>
                {canDelete ? (
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Delete ${candidate.name}`}
                      onClick={(event) => { event.stopPropagation(); setPendingDelete(candidate); }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
            {!filtered.length && !workspace.isLoading ? (
              <tr><td colSpan={canDelete ? 11 : 10} className="px-4 py-10 text-center text-sm text-muted-foreground">No candidates match these filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            Showing {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger className="h-8 w-[72px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Previous page"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[90px] text-center text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Next page"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this candidate permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `${[pendingDelete.surname, pendingDelete.name].filter(Boolean).join(" ")} (${pendingDelete.candidate_number})` : ""} will be removed along with every uploaded document, remark, clearance, travel record and history entry. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={destroy.isPending}>Keep candidate</AlertDialogCancel>
            <AlertDialogAction
              disabled={destroy.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => { event.preventDefault(); if (pendingDelete) destroy.mutate(pendingDelete.id); }}
            >
              {destroy.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Upload Modal */}
      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-emerald-600" />
              Bulk Upload Candidates
            </DialogTitle>
            <DialogDescription>
              Upload your Excel sheet (.xlsx, .xls). If a candidate already exists by passport number or candidate ID, their details will be updated without duplicates.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!uploading && !uploadResult && (
              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition">
                <Upload className="size-8 text-muted-foreground mb-2" />
                <span className="text-sm font-medium">Click to select Excel file</span>
                <span className="text-xs text-muted-foreground mt-1">Supports Al Taher - Database (Responses).xlsx</span>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            )}

            {uploading && (
              <div className="flex flex-col items-center justify-center py-8 space-y-2">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Processing & Upserting Candidates...</p>
                <p className="text-xs text-muted-foreground">Checking duplicates and updating database</p>
              </div>
            )}

            {uploadResult && (
              <div className="space-y-3">
                <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-emerald-700">
                    <CheckCircle2 className="size-4" /> Import Complete
                  </div>
                  <div>• Total rows read: <strong>{uploadResult.total}</strong></div>
                  <div>• New candidates added: <strong>{uploadResult.created}</strong></div>
                  <div>• Existing candidates updated: <strong>{uploadResult.updated}</strong></div>
                  {uploadResult.failed > 0 && (
                    <div className="text-amber-800 font-medium">• Rows skipped / errors: {uploadResult.failed}</div>
                  )}
                </div>

                {uploadResult.errors?.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded border p-2 text-xs text-red-600 bg-red-50">
                    {uploadResult.errors.map((err, idx) => (
                      <div key={idx}>Row {err.row}: {err.error}</div>
                    ))}
                  </div>
                )}

                <Button className="w-full" onClick={() => setBulkModalOpen(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {creating ? <CandidateForm role={role} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); }} /> : null}
      {selected ? <CandidateDetail key={selected.id} candidate={selected} role={role} onClose={() => setSelectedId(null)} /> : null}
    </AppShell>
  );
}

function Panel({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20 backdrop-blur-sm" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
        </div>
        <div className="space-y-6 px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}

const INITIAL_DOCS = ["CV", "Passport", "Aadhar Card"] as const;

function CandidateForm({ role, candidate, onClose, onSaved }: { role: Role; candidate?: Candidate; onClose: () => void; onSaved: () => void }) {
  const create = useServerFn(addCandidate);
  const update = useServerFn(updateCandidateDetails);
  const remarkFn = useServerFn(appendCandidateRemark);
  const resolveType = useServerFn(resolveDocumentType);
  const recordDocument = useServerFn(recordCandidateDocument);
  const extractPhoto = useServerFn(extractCandidatePhoto);
  const [files, setFiles] = useState<Record<string, File | null>>({ CV: null, Passport: null, "Aadhar Card": null });
  const [form, setForm] = useState(() => candidate
    ? {
        ...emptyForm,
        candidateNumber: candidate.candidate_number,
        surname: candidate.surname ?? "",
        name: candidate.name,
        dateOfBirth: candidate.date_of_birth ?? "",
        placeOfBirth: candidate.place_of_birth ?? "",
        address: candidate.address ?? "",
        email: candidate.email ?? "",
        phone: candidate.phone ?? "",
        contactNo2: candidate.contact_no_2 ?? "",
        reference: candidate.reference ?? "",
        bankHolder: candidate.bank_account_holder ?? "",
        bankAccount: candidate.bank_account_number ?? "",
        bankName: candidate.bank_name ?? "",
        bankBranch: candidate.bank_branch ?? "",
        bankIfsc: candidate.bank_ifsc ?? "",
        bankSwift: candidate.bank_swift ?? "",
        candidateKind: candidate.candidate_kind ?? "New Candidate",
        trade: candidate.trade ?? "",
        category: candidate.category ?? "",
        experienceYears: String(candidate.experience_years),
        rating: String(candidate.rating),
        passportNumber: candidate.passport_number ?? "",
        passportIssueDate: candidate.passport_issue_date ?? "",
        passportExpiry: candidate.passport_expiry ?? "",
        passportPlaceOfIssue: candidate.passport_place_of_issue ?? "",
      }
    : emptyForm);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState("");
  const readPassportFn = useServerFn(readPassportDetails);
  const [reading, setReading] = useState(false);
  const [readState, setReadState] = useState("");

  async function readPassport() {
    const file = files["Passport"];
    if (!file) return;
    setReading(true);
    setReadState("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("The file could not be read."));
        reader.readAsDataURL(file);
      });
      const details = await readPassportFn({ data: { dataUrl } });
      setForm((current) => ({
        ...current,
        surname: details.surname || current.surname,
        name: details.name || current.name,
        dateOfBirth: details.dateOfBirth || current.dateOfBirth,
        placeOfBirth: details.placeOfBirth || current.placeOfBirth,
        address: details.address || current.address,
        passportNumber: details.passportNumber || current.passportNumber,
        passportIssueDate: details.passportIssueDate || current.passportIssueDate,
        passportExpiry: details.passportExpiry || current.passportExpiry,
        passportPlaceOfIssue: details.passportPlaceOfIssue || current.passportPlaceOfIssue,
      }));
      setReadState("Filled in from the passport copy — please check and edit anything that looks wrong.");
    } catch (readError) {
      setReadState(readError instanceof Error ? readError.message : "The passport copy could not be read.");
    } finally {
      setReading(false);
    }
  }

  const checkPassport = useServerFn(checkPassportNumber);
  const passportNumber = form.passportNumber.trim();

  useEffect(() => {
    if (!passportNumber) {
      setDuplicate("");
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const result = await checkPassport({ data: { passportNumber, ...(candidate ? { candidateId: candidate.id } : {}) } });
        if (!active) return;
        setDuplicate(result.duplicate ? `This passport number is already on file for ${result.name} (${result.candidateNumber}).` : "");
      } catch {
        if (active) setDuplicate("");
      }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [passportNumber, candidate, checkPassport]);

  const checkSimilar = useServerFn(checkSimilarCandidate);
  const [lookAlikes, setLookAlikes] = useState<Array<{ id: string; candidateNumber: string; name: string; passportNumber: string }>>([]);
  const [confirmedDifferent, setConfirmedDifferent] = useState<string[]>([]);
  useEffect(() => {
    if (candidate || !form.name.trim() || !form.surname.trim() || !form.dateOfBirth || !form.address.trim()) { setLookAlikes([]); return; }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const result = await checkSimilar({ data: { name: form.name, surname: form.surname, dateOfBirth: form.dateOfBirth, address: form.address } });
        if (active) setLookAlikes(result.matches);
      } catch { if (active) setLookAlikes([]); }
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [candidate, form.name, form.surname, form.dateOfBirth, form.address, checkSimilar]);
  const pendingLookAlikes = lookAlikes.filter((match) => !confirmedDifferent.includes(match.id));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        candidateNumber: form.candidateNumber.trim(),
        surname: form.surname.trim(),
        name: form.name.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        placeOfBirth: form.placeOfBirth.trim(),
        address: form.address.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        contactNo2: form.contactNo2.trim(),
        reference: form.reference.trim(),
        bankHolder: form.bankHolder.trim(),
        bankAccount: form.bankAccount.trim(),
        bankName: form.bankName.trim(),
        bankBranch: form.bankBranch.trim(),
        bankIfsc: form.bankIfsc.trim(),
        bankSwift: form.bankSwift.trim(),
        candidateKind: form.candidateKind,
        trade: form.trade.trim(),
        category: form.category.trim(),
        experienceYears: Number(form.experienceYears || 0),
        rating: Number(form.rating || 0),
        passportNumber: form.passportNumber.trim(),
        passportIssueDate: form.passportIssueDate || undefined,
        passportExpiry: form.passportExpiry || undefined,
        passportPlaceOfIssue: form.passportPlaceOfIssue.trim(),
      };
      if (candidate) return update({ data: { ...payload, candidateId: candidate.id } });
      const created = await create({ data: { ...payload, confirmedDifferentFrom: confirmedDifferent } });
      if (form.remark.trim()) await remarkFn({ data: { candidateId: created.id, text: form.remark.trim() } });
      for (const label of INITIAL_DOCS) {
        const file = files[label];
        if (!file) continue;
        const path = `${created.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
        const uploaded = await supabase.storage.from("candidate-documents").upload(path, file);
        if (uploaded.error) throw new Error(`${label}: ${uploaded.error.message}`);
        const type = await resolveType({ data: { name: label, category: "candidate" } });
        await recordDocument({ data: { candidateId: created.id, documentTypeId: type.id, fileName: file.name, storagePath: path } });
      }
      if (files["Passport"]) {
        try {
          await extractPhoto({ data: { candidateId: created.id } });
        } catch {
          /* the photo can still be added by hand from the profile */
        }
      }
      return created;
    },
    onSuccess: onSaved,
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  if (role !== "Data Entry" && role !== "Recruiter" && !isAdminRole(role)) return null;

  return (
    <Panel title={candidate ? "Edit candidate" : "New candidate"} subtitle="New records start off the Available list until CV and Passport are on file." onClose={onClose}>
      {!candidate ? (
        <section className="rounded-md border border-dashed border-border p-3">
          <p className="text-sm font-medium">Start with the passport copy</p>
          <p className="mt-1 text-xs text-muted-foreground">Upload the passport copy and we will fill in the surname, name, date of birth, address and all passport details. You can edit everything before saving.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Passport copy">
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setFiles((current) => ({ ...current, Passport: file }));
                  setReadState("");
                }}
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={!files["Passport"] || reading}
              onClick={() => void readPassport()}
            >
              {reading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Read details
            </Button>
          </div>
          {readState ? <p className={`mt-2 text-xs ${readState.startsWith("Filled") ? "text-emerald-600" : "text-destructive"}`}>{readState}</p> : null}
        </section>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Candidate ID">
          <Input value={candidate ? form.candidateNumber : "Assigned automatically on save"} readOnly className="text-muted-foreground" />
        </Field>
        <Field label="Trade and category">
          <div className="grid gap-2 sm:grid-cols-2">
            <TradeCategoryMultiSelect
              trade={form.trade}
              categories={parseCategories(form.category)}
              onChange={(next) => setForm({ ...form, trade: next.trade, category: joinCategories(next.categories) })}
            />
          </div>
        </Field>
        <Field label="Surname"><Input value={form.surname} onChange={(event) => setForm({ ...form, surname: event.target.value })} /></Field>
        <Field label="Name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Date of birth"><Input type="date" value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} /></Field>
        <Field label="Age"><Input value={ageFrom(form.dateOfBirth)} readOnly /></Field>
        <Field label="Place of birth"><Input value={form.placeOfBirth} onChange={(event) => setForm({ ...form, placeOfBirth: event.target.value })} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
        <Field label="Contact no. 1"><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
        <Field label="Contact no. 2"><Input value={form.contactNo2} onChange={(event) => setForm({ ...form, contactNo2: event.target.value })} /></Field>
        <Field label="Reference (walk-in, online/email, or referred by)"><Input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="e.g. Walk-in, Online, or name of referrer" /></Field>
        <Field label="Email address"><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
        <div className="sm:col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Banking details</div>
        <Field label="Name of account holder"><Input value={form.bankHolder} onChange={(event) => setForm({ ...form, bankHolder: event.target.value })} /></Field>
        <Field label="Account number"><Input value={form.bankAccount} onChange={(event) => setForm({ ...form, bankAccount: event.target.value })} /></Field>
        <Field label="Bank name"><Input value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} /></Field>
        <Field label="Branch name"><Input value={form.bankBranch} onChange={(event) => setForm({ ...form, bankBranch: event.target.value })} /></Field>
        <Field label="IFSC code"><Input value={form.bankIfsc} onChange={(event) => setForm({ ...form, bankIfsc: event.target.value })} /></Field>
        <Field label="SWIFT code (optional)"><Input value={form.bankSwift} onChange={(event) => setForm({ ...form, bankSwift: event.target.value })} /></Field>
        <Field label="Candidate type">
          <div className="flex gap-2">
            {(["New Candidate", "Ex Candidate"] as const).map((kind) => (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant={form.candidateKind === kind ? "default" : "outline"}
                onClick={() => setForm({ ...form, candidateKind: kind })}
              >
                {kind}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="Passport number">
          <Input value={form.passportNumber} onChange={(event) => setForm({ ...form, passportNumber: event.target.value })} aria-invalid={Boolean(duplicate)} />
          {duplicate ? <p className="mt-1 text-xs text-destructive">{duplicate}</p> : null}
        </Field>
        <Field label="Passport place of issue"><Input value={form.passportPlaceOfIssue} onChange={(event) => setForm({ ...form, passportPlaceOfIssue: event.target.value })} /></Field>
        <Field label="Passport issue date"><Input type="date" value={form.passportIssueDate} onChange={(event) => setForm({ ...form, passportIssueDate: event.target.value })} /></Field>
        <Field label="Passport expiry date"><Input type="date" value={form.passportExpiry} onChange={(event) => setForm({ ...form, passportExpiry: event.target.value })} /></Field>
        <Field label="Experience (years)"><Input type="number" min="0" step="0.5" value={form.experienceYears} onChange={(event) => setForm({ ...form, experienceYears: event.target.value })} /></Field>
        <Field label="Rating (0-10)"><Input type="number" min="0" max="10" step="0.1" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} /></Field>
        {!candidate ? <Field label="Remark" className="sm:col-span-2"><Input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} placeholder="First entry in the append-only remarks log" /></Field> : null}
      </div>
      {!candidate ? (
        <section className="grid gap-3 rounded-md border border-dashed border-border p-3 sm:grid-cols-3">
          <p className="text-xs text-muted-foreground sm:col-span-3">Attach the remaining documents. The passport copy is already taken above.</p>
          {INITIAL_DOCS.filter((label) => label !== "Passport").map((label) => (
            <Field key={label} label={label}>
              <Input
                type="file"
                onChange={(event) => setFiles((current) => ({ ...current, [label]: event.target.files?.[0] ?? null }))}
              />
            </Field>
          ))}
        </section>
      ) : null}
      {pendingLookAlikes.map((match) => (
        <div key={match.id} className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">Possible duplicate — please check the existing candidate first</p>
          <p className="mt-1 text-muted-foreground">{match.name} ({match.candidateNumber}) has the same name, surname, date of birth and address. Passport on file: {match.passportNumber || "—"}.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setConfirmedDifferent((current) => [...current, match.id])}>This is a different person</Button>
        </div>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={() => { setError(""); save.mutate(); }} disabled={pendingLookAlikes.length > 0 || save.isPending || form.name.trim().length < 2 || Boolean(candidate && !form.candidateNumber.trim()) || Boolean(duplicate)}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save candidate
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </Panel>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function CandidateDetail({ candidate, role, onClose }: { candidate: Candidate; role: Role; onClose: () => void }) {
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const addRemark = useServerFn(appendCandidateRemark);
  const assign = useServerFn(assignCandidateToProject);
  const markAvailable = useServerFn(markCandidateAvailable);
  const setUnavailable = useServerFn(setCandidateUnavailable);
  const setBlacklisted = useServerFn(setCandidateBlacklisted);
  const resolveType = useServerFn(resolveDocumentType);
  const recordDocument = useServerFn(recordCandidateDocument);

  const [remark, setRemark] = useState("");
  const [project, setProject] = useState("");
  const [docType, setDocType] = useState("CV");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState(false);

  const remarks = (workspace.data?.remarks ?? []).filter((item) => item.candidate_id === candidate.id);
  const typeName = (id: string) => workspace.data?.documentTypes.find((type) => type.id === id)?.name ?? "Document";
  const projectLabel = (id: string) => workspace.data?.projects.find((item) => item.id === id)?.name ?? "Project";
  const documents = (workspace.data?.documents ?? []).filter((item) => item.candidate_id === candidate.id);
  const history = (workspace.data?.assignments ?? []).filter((item) => item.candidate_id === candidate.id);
  const events = (workspace.data?.history ?? []).filter((item) => item.candidate_id === candidate.id);
  const documentNames = new Set(documents.map((item) => typeName(item.document_type_id)));
  const canEdit = role === "Data Entry" || role === "Recruiter" || isAdminRole(role);
  const canAssign = (role === "Recruiter" || isAdminRole(role)) && candidate.status === "Available";
  const canToggleAvailability = (role === "Data Entry" || role === "Recruiter" || isAdminRole(role)) && !candidate.current_project_id;

  async function run(action: () => Promise<unknown>, okText: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "ok", text: okText });
      refresh();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    const path = `${candidate.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const uploaded = await supabase.storage.from("candidate-documents").upload(path, file);
    if (uploaded.error) throw new Error(uploaded.error.message);
    const type = await resolveType({ data: { name: docType, category: "candidate" } });
    await recordDocument({ data: { candidateId: candidate.id, documentTypeId: type.id, fileName: file.name, storagePath: path, expiryDate: expiry || undefined } });
  }

  if (editing) return <CandidateForm role={role} candidate={candidate} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />;

  return (
    <Panel title={candidate.name} subtitle={`${candidate.candidate_number} · ${candidate.status === "Blacklisted" ? "BLACKLISTED" : candidate.status}`} onClose={onClose}>
      <CandidatePhoto candidate={candidate} canEdit={canEdit} />
      <div className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
        <Detail label="Surname" value={candidate.surname ?? "—"} />
        <Detail label="Name" value={candidate.name} />
        <Detail label="Age" value={ageFrom(candidate.date_of_birth)} />
        <Detail label="Date of birth" value={formatDate(candidate.date_of_birth)} />
        <Detail label="Place of birth" value={candidate.place_of_birth ?? "—"} />
        <Detail label="Address" value={candidate.address ?? "—"} />
        <Detail label="Contact no. 1" value={candidate.phone || "—"} />
        <Detail label="Contact no. 2" value={candidate.contact_no_2 || "—"} />
        <Detail label="Reference" value={candidate.reference || "—"} />
        <Detail label="Email address" value={candidate.email || "—"} />
        <Detail label="Candidate type" value={candidate.candidate_kind ?? "New Candidate"} />
        <Detail label="Trade" value={candidate.trade ?? "—"} />
        <Detail label="Category" value={candidate.category ?? "—"} />
        <Detail label="Experience" value={`${candidate.experience_years} years`} />
        <Detail label="Rating (0-10)" value={Number(candidate.rating).toFixed(1)} />
      </div>

      <section className="rounded-md border border-border p-3">
        <h3 className="mb-2 text-sm font-semibold">Passport details</h3>
        <div className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          <Detail label="Passport number" value={candidate.passport_number ?? "—"} />
          <Detail label="Issue date" value={formatDate(candidate.passport_issue_date)} />
          <Detail label="Expiry date" value={formatDate(candidate.passport_expiry)} />
          <Detail label="Place of issue" value={candidate.passport_place_of_issue ?? "—"} />
        </div>
      </section>

      <section className="rounded-md border border-border p-3">
        <h3 className="mb-2 text-sm font-semibold">Banking details</h3>
        <div className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          <Detail label="Name of account holder" value={candidate.bank_account_holder || "—"} />
          <Detail label="Account number" value={candidate.bank_account_number || "—"} />
          <Detail label="Bank name" value={candidate.bank_name || "—"} />
          <Detail label="Branch name" value={candidate.bank_branch || "—"} />
          <Detail label="IFSC code" value={candidate.bank_ifsc || "—"} />
          <Detail label="SWIFT code (optional)" value={candidate.bank_swift || "—"} />
        </div>
      </section>

      {canEdit ? <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit details</Button> : null}

      {!documentNames.has("Aadhar Card") ? (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Aadhar Card is missing. This is a warning only and does not block progress.
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Documents</h3>
            <p className="text-xs text-muted-foreground">Every document ever uploaded stays on file, including after end of contract.</p>
          </div>
          <CandidateZipButton candidateId={candidate.id} disabled={!documents.length} />
        </div>
        <ul className="space-y-2 text-sm">
          {documents.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <span>
                <span className="font-medium">{typeName(document.document_type_id)}</span>
                <span className="block text-xs text-muted-foreground">
                  {document.file_name} · uploaded {formatDate(document.created_at)}
                  {document.expiry_date ? ` · expires ${formatDate(document.expiry_date)}` : ""}
                  {document.project_id ? ` · ${projectLabel(document.project_id)}` : ""}
                </span>
              </span>
              <DocumentLink documentId={document.id} {...(canEdit ? { onDeleted: refresh } : {})} />
            </li>
          ))}
          {!documents.length ? <li className="text-xs text-muted-foreground">No documents on file yet.</li> : null}
        </ul>

        {canEdit ? (
          <div className="grid gap-2 rounded-md border border-dashed border-border p-3 sm:grid-cols-2">
            <Field label="Document type">
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["CV", "Passport", "Aadhar Card", ...(workspace.data?.documentTypes ?? []).filter((type) => type.is_active).map((type) => type.name)]
                    .filter((name, index, array) => array.indexOf(name) === index)
                    .map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Expiry date (optional)"><Input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></Field>
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Upload file</Label>
              <Input
                className="mt-1.5"
                type="file"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void run(() => upload(file), `${docType} uploaded.`);
                  event.target.value = "";
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        {canEdit && candidate.status !== "Available" && candidate.status !== "Unavailable" && candidate.status !== "Blacklisted" && !candidate.current_project_id ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => markAvailable({ data: { candidateId: candidate.id } }), "Candidate is now Available.")}>
            <Upload className="size-4" /> Mark Available
          </Button>
        ) : null}

        {canToggleAvailability && candidate.status === "Available" ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => setUnavailable({ data: { candidateId: candidate.id, unavailable: true } }), "Candidate marked Unavailable.")}>
            Mark Unavailable
          </Button>
        ) : null}

        {canToggleAvailability && candidate.status === "Unavailable" ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => setUnavailable({ data: { candidateId: candidate.id, unavailable: false } }), "Candidate is Available again.")}>
            Mark Available again
          </Button>
        ) : null}

        {canToggleAvailability && candidate.status === "Blacklisted" ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => setBlacklisted({ data: { candidateId: candidate.id, blacklisted: false } }), "Candidate removed from blacklist.")}>
            <Check className="size-4 mr-1 text-emerald-600" /> Remove from Blacklist
          </Button>
        ) : null}

        {canToggleAvailability && candidate.status !== "Blacklisted" && !candidate.current_project_id ? (
          <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" disabled={busy} onClick={() => void run(() => setBlacklisted({ data: { candidateId: candidate.id, blacklisted: true } }), "Candidate has been blacklisted.")}>
            <Ban className="size-4 mr-1 text-destructive" /> Blacklist Candidate
          </Button>
        ) : null}
      </div>

      {candidate.status === "Unavailable" ? (
        <p className="text-xs text-muted-foreground">Working with another company — cannot be assigned to a project until marked Available again.</p>
      ) : null}

      {candidate.status === "Blacklisted" ? (
        <p className="text-xs text-destructive font-medium">Candidate is blacklisted — cannot be assigned to any project until removed from the blacklist.</p>
      ) : null}

      {canAssign ? (
        <section className="space-y-2 rounded-md border border-border p-3">
          <h3 className="text-sm font-semibold">Assign to project</h3>
          <div className="flex flex-wrap gap-2">
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="w-[240px]"><SelectValue placeholder="Choose a project" /></SelectTrigger>
              <SelectContent>
                {(workspace.data?.projects ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.client}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button disabled={!project || busy} onClick={() => void run(() => assign({ data: { candidateId: candidate.id, projectId: project } }), "Candidate assigned.")}>Assign</Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Projects worked on</h3>
        <ul className="space-y-2">
          {history.map((item) => (
            <li key={item.id} className="rounded-md border border-border px-3 py-2 text-sm">
              <p className="font-medium">{projectLabel(item.project_id)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Joined {formatDate(item.assigned_at)}
                {item.ended_at ? ` · left ${formatDate(item.ended_at)} · ${item.end_reason ?? "Closed"}` : " · currently on this project"}
              </p>
            </li>
          ))}
          {!history.length ? <li className="text-xs text-muted-foreground">No project history yet.</li> : null}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Assignment history</h3>
        <p className="text-xs text-muted-foreground">Every assignment, rejection, cancellation and mobilisation, with the reason given.</p>
        <ul className="space-y-2">
          {events.map((item) => (
            <li key={item.id} className="rounded-md border border-border px-3 py-2 text-sm">
              <p className="font-medium">{item.event}{item.project_id ? ` · ${projectLabel(item.project_id)}` : ""}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDate(item.created_at)}
                {item.reason ? ` · ${item.reason}` : ""}
              </p>
            </li>
          ))}
          {!events.length ? <li className="text-xs text-muted-foreground">No stage history yet.</li> : null}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Remarks</h3>
        <div className="space-y-2">
          <Textarea rows={3} value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="Add a remark. Entries are appended and never overwritten." />
          <Button size="sm" disabled={!remark.trim() || busy} onClick={() => void run(async () => { await addRemark({ data: { candidateId: candidate.id, text: remark.trim() } }); setRemark(""); }, "Remark added.")}>Append remark</Button>
        </div>
        <ul className="space-y-2">
          {remarks.map((item) => (
            <li key={item.id} className="rounded-md border border-border px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground">{formatDate(item.created_at)} · {item.author_id.slice(0, 8)}</p>
              <p className="mt-1 whitespace-pre-wrap">{item.text}</p>
            </li>
          ))}
          {!remarks.length ? <li className="text-xs text-muted-foreground">No remarks yet.</li> : null}
        </ul>
      </section>

      {message ? <p className={`text-xs ${message.tone === "ok" ? "text-emerald-600" : "text-destructive"}`}>{message.text}</p> : null}
    </Panel>
  );
}

function CandidateZipButton({ candidateId, disabled }: { candidateId: string; disabled: boolean }) {
  const downloadZip = useServerFn(downloadCandidateDocumentsZip);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const { base64, fileName } = await downloadZip({ data: { candidateId } });
      const link = document.createElement("a");
      link.href = `data:application/zip;base64,${base64}`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (zipError) {
      setError((zipError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={busy || disabled} onClick={() => void run()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download all as Zip
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}

function CandidatePhoto({ candidate, canEdit }: { candidate: Candidate; canEdit: boolean }) {
  const refresh = useRefreshWorkspace();
  const photoLink = useServerFn(getCandidatePhotoLink);
  const savePhoto = useServerFn(setCandidatePhoto);
  const takeFromPassport = useServerFn(extractCandidatePhoto);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const photo = useQuery({
    queryKey: ["candidate-photo", candidate.id, (candidate as { photo_path?: string | null }).photo_path ?? ""],
    queryFn: () => photoLink({ data: { candidateId: candidate.id } }),
  });

  const initials = [candidate.surname, candidate.name].filter(Boolean).map((part) => String(part).trim().charAt(0).toUpperCase()).join("") || "?";
  const source = (candidate as { photo_source?: string | null }).photo_source;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      refresh();
      await photo.refetch();
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    const path = `${candidate.id}/photo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const uploaded = await supabase.storage.from("candidate-documents").upload(path, file);
    if (uploaded.error) throw new Error(uploaded.error.message);
    await savePhoto({ data: { candidateId: candidate.id, storagePath: path } });
  }

  return (
    <section className="flex items-center gap-4">
      <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-xl font-semibold text-muted-foreground">
        {photo.data?.url ? <img src={photo.data.url} alt={`Photo of ${candidate.name}`} className="size-full object-cover" /> : <span>{initials}</span>}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-muted-foreground">{photo.data?.url ? (source === "Passport copy" ? "Taken from the passport copy." : "Uploaded by staff.") : "No photo yet."}</p>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
              <Upload className="size-3.5" /> {photo.data?.url ? "Replace photo" : "Add photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => upload(file)); event.target.value = ""; }}
              />
            </label>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => takeFromPassport({ data: { candidateId: candidate.id } }))}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Take from passport copy
            </Button>
          </div>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </section>
  );
}