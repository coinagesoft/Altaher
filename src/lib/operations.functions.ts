import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import JSZip from "jszip";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roles = ["Data Entry", "Recruiter", "Project Coordinator", "Mobilisation Executive", "Admin", "Super Admin"] as const;
const statuses = ["Available", "Unavailable", "Assigned", "Shortlisted", "Interview", "Practical Test", "Passed", "Selected", "Rejected", "Medical", "Visa", "Mobilisation", "On Site", "R&R", "EOC"] as const;
const requirementStages = ["Assigned", "Shortlisted", "Interview", "Selected", "Medical", "Visa", "Mobilisation"] as const;

const candidateInput = z.object({
  candidateNumber: z.string().trim().max(40).optional(),
  surname: z.string().trim().max(120).optional(),
  name: z.string().trim().min(2).max(160),
  dateOfBirth: z.string().optional(),
  placeOfBirth: z.string().trim().max(160).optional(),
  address: z.string().trim().max(600).optional(),
  email: z.string().email().or(z.literal("")).optional(),
  phone: z.string().trim().max(60).optional(),
  contactNo2: z.string().trim().max(60).optional(),
  reference: z.string().trim().max(200).optional(),
  bankHolder: z.string().trim().max(120).optional(),
  bankAccount: z.string().trim().max(120).optional(),
  bankName: z.string().trim().max(120).optional(),
  bankBranch: z.string().trim().max(120).optional(),
  bankIfsc: z.string().trim().max(120).optional(),
  bankSwift: z.string().trim().max(120).optional(),
  candidateKind: z.enum(["New Candidate", "Ex Candidate"]).default("New Candidate"),
  trade: z.string().trim().max(120).optional(),
  category: z.string().trim().max(500).optional(),
  experienceYears: z.number().min(0).max(70),
  rating: z.number().min(0).max(10),
  passportNumber: z.string().trim().max(80).optional(),
  passportIssueDate: z.string().optional(),
  passportExpiry: z.string().optional(),
  passportPlaceOfIssue: z.string().trim().max(160).optional(),
});

async function assertPassportIsUnique(supabaseAdmin: any, passportNumber: string | undefined, candidateId?: string) {
  const value = (passportNumber ?? "").trim();
  if (!value) return;
  let query = supabaseAdmin.from("candidates").select("id,candidate_number,name,surname").ilike("passport_number", value);
  if (candidateId) query = query.neq("id", candidateId);
  const { data: rows } = await query;
  const clash = (rows ?? []).find((row: any) => String(row.passport_number ?? value).trim().toUpperCase() === value.toUpperCase());
  const match = clash ?? (rows ?? [])[0];
  if (match) {
    const label = [match.surname, match.name].filter(Boolean).join(" ");
    throw new Error(`Passport number ${value} is already used by ${label} (${match.candidate_number}).`);
  }
}

export const checkPassportNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ passportNumber: z.string().trim().max(80), candidateId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const value = data.passportNumber.trim();
    if (!value) return { duplicate: false as const };
    let query = supabaseAdmin.from("candidates").select("id,candidate_number,name,surname").ilike("passport_number", value);
    if (data.candidateId) query = query.neq("id", data.candidateId);
    const { data: rows } = await query;
    const match = (rows ?? [])[0];
    if (!match) return { duplicate: false as const };
    return { duplicate: true as const, candidateNumber: match.candidate_number as string, name: [match.surname, match.name].filter(Boolean).join(" ") };
  });

const normText = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

async function findLookAlikes(supabaseAdmin: any, input: { name?: string | undefined; surname?: string | undefined; dateOfBirth?: string | undefined; address?: string | undefined }, candidateId?: string) {
  if (!input.name?.trim() || !input.surname?.trim() || !input.dateOfBirth || !input.address?.trim()) return [];
  let query = supabaseAdmin.from("candidates").select("id,candidate_number,name,surname,date_of_birth,address,passport_number").eq("date_of_birth", input.dateOfBirth);
  if (candidateId) query = query.neq("id", candidateId);
  const { data: rows } = await query;
  return (rows ?? [])
    .filter((row: any) => normText(row.name) === normText(input.name) && normText(row.surname) === normText(input.surname) && normText(row.address) === normText(input.address))
    .map((row: any) => ({ id: row.id as string, candidateNumber: row.candidate_number as string, name: [row.name, row.surname].filter(Boolean).join(" "), passportNumber: (row.passport_number ?? "") as string }));
}

export const checkSimilarCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().max(160), surname: z.string().max(160), dateOfBirth: z.string().max(20), address: z.string().max(1000), candidateId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return { matches: await findLookAlikes(supabaseAdmin, data, data.candidateId) };
  });

async function nextCandidateNumber(supabaseAdmin: any) {
  const { data: rows } = await supabaseAdmin.from("candidates").select("candidate_number");
  let max = 0;
  for (const row of rows ?? []) {
    const match = /^C-(\d+)$/i.exec(String(row.candidate_number ?? ""));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `C-${String(max + 1).padStart(4, "0")}`;
}

function candidateValues(data: z.infer<typeof candidateInput>) {
  return {
    ...(data.candidateNumber ? { candidate_number: data.candidateNumber } : {}),
    surname: data.surname || null,
    name: data.name,
    date_of_birth: data.dateOfBirth || null,
    place_of_birth: data.placeOfBirth || null,
    address: data.address || null,
    email: data.email || null,
    phone: data.phone || null,
    contact_no_2: data.contactNo2 || null,
    reference: data.reference || null,
    bank_account_holder: data.bankHolder || null,
    bank_account_number: data.bankAccount || null,
    bank_name: data.bankName || null,
    bank_branch: data.bankBranch || null,
    bank_ifsc: data.bankIfsc || null,
    bank_swift: data.bankSwift || null,
    candidate_kind: data.candidateKind,
    trade: data.trade || null,
    category: data.category || null,
    skills: data.trade ? [data.trade] : [],
    experience_years: data.experienceYears,
    rating: data.rating,
    passport_number: data.passportNumber || null,
    passport_issue_date: data.passportIssueDate || null,
    passport_expiry: data.passportExpiry || null,
    passport_place_of_issue: data.passportPlaceOfIssue || null,
  };
}

async function ensureTradeOption(supabaseAdmin: any, userId: string, trade?: string | null, category?: string | null) {
  const tradeName = (trade ?? "").trim();
  if (!tradeName) return null;
  let { data: row } = await supabaseAdmin.from("trades").select("id").ilike("name", tradeName).maybeSingle();
  if (!row) {
    const created = await supabaseAdmin.from("trades").insert({ name: tradeName, created_by: userId }).select("id").single();
    if (created.error) {
      const again = await supabaseAdmin.from("trades").select("id").ilike("name", tradeName).maybeSingle();
      row = again.data;
    } else row = created.data;
  }
  if (!row) return null;
  const categoryName = (category ?? "").trim();
  if (categoryName) {
    const { data: existing } = await supabaseAdmin.from("trade_categories").select("id").eq("trade_id", row.id).ilike("name", categoryName).maybeSingle();
    if (!existing) await supabaseAdmin.from("trade_categories").insert({ trade_id: row.id, name: categoryName, created_by: userId });
  }
  return row.id as string;
}

export const addTradeOption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ trade: z.string().trim().min(2).max(120), category: z.string().trim().max(120).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = await ensureTradeOption(supabaseAdmin, context.userId, data.trade, data.category);
    return { id, trade: data.trade.trim(), category: (data.category ?? "").trim() || null };
  });

async function requireRole(context: { supabase: any; userId: string }, allowed: readonly string[]) {
  const { data, error } = await context.supabase.from("user_roles").select("role,is_active").eq("user_id", context.userId).single();
  if (error || !data || data.is_active === false) throw new Error("Forbidden");
  if (data.role !== "Super Admin" && !allowed.includes(data.role)) throw new Error("Forbidden");
  return data.role as (typeof roles)[number];
}

export const bootstrapInitialAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true });
    if (count !== 0) throw new Error("Initial administrator already exists");
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "Super Admin" });
    if (error) throw error;
    return { role: "Super Admin" as const };
  });

export const getWorkspaceData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await requireRole(context, roles);
    const [candidates, projects, remarks, documents, documentTypes, requirements, tradeRequirements, travel, clearances, assignments, history, audit, trades, tradeCategories, employeeNumbers] = await Promise.all([
      context.supabase.from("candidates").select("id,candidate_number,employee_number,surname,name,date_of_birth,place_of_birth,address,email,phone,contact_no_2,reference,bank_account_holder,bank_account_number,bank_name,bank_branch,bank_ifsc,bank_swift,candidate_kind,trade,category,skills,experience_years,rating,interview_rating,practical_rating,status,current_project_id,passport_number,passport_issue_date,passport_expiry,passport_place_of_issue,photo_path,photo_source,rr_start_date,rr_days,created_at,updated_at").order("name"),
      context.supabase.from("projects").select("id,name,client,country,start_date,required_headcount,cancelled_at,cancel_reason").order("start_date"),
      context.supabase.from("candidate_remarks").select("id,candidate_id,author_id,text,created_at").order("created_at", { ascending: false }),
      context.supabase.from("candidate_documents").select("id,candidate_id,project_id,document_type_id,file_name,expiry_date,uploaded_by,created_at"),
      context.supabase.from("document_types").select("id,name,category,usage_count,is_active").order("name"),
      context.supabase.from("project_stage_requirements").select("id,project_id,stage,document_type_id"),
      context.supabase.from("project_trade_requirements").select("id,project_id,trade,category,required_count").order("trade"),
      context.supabase.from("travel_details").select("candidate_id,flight_date,flight_number,departure_airport,departure_time,arrival_airport,arrival_time,arrival_date,connections,ticket_number"),
      context.supabase.from("mobilisation_clearances").select("candidate_id,project_id,medical_cleared,medical_date,visa_cleared,visa_issue_date,visa_expiry_date,police_cleared,police_date,updated_at"),
      context.supabase.from("candidate_assignments").select("id,candidate_id,project_id,assigned_at,ended_at,end_reason,final_status").order("assigned_at", { ascending: false }),
      context.supabase.from("candidate_history").select("id,candidate_id,project_id,event,reason,details,created_by,created_at").order("created_at", { ascending: false }).limit(1000),
      context.supabase.from("audit_events").select("id,candidate_id,project_id,action,previous_status,new_status,actor_id,details,created_at").order("created_at", { ascending: false }).limit(500),
      context.supabase.from("trades").select("id,name").order("name"),
      context.supabase.from("trade_categories").select("id,trade_id,name").order("name"),
      context.supabase.from("project_employee_numbers").select("project_id,candidate_id,employee_number"),
    ]);
    const errors = [candidates, projects, remarks, documents, documentTypes, requirements, tradeRequirements, travel, clearances, assignments, history, audit, trades, tradeCategories, employeeNumbers].map((result) => result.error).filter(Boolean);
    if (errors.length) throw new Error(errors[0]?.message ?? "Workspace data could not be loaded");
    return { role, candidates: candidates.data ?? [], projects: projects.data ?? [], remarks: remarks.data ?? [], documents: documents.data ?? [], documentTypes: documentTypes.data ?? [], requirements: requirements.data ?? [], tradeRequirements: tradeRequirements.data ?? [], travel: travel.data ?? [], clearances: clearances.data ?? [], assignments: assignments.data ?? [], history: history.data ?? [], audit: audit.data ?? [], trades: trades.data ?? [], tradeCategories: tradeCategories.data ?? [], employeeNumbers: employeeNumbers.data ?? [] };
  });

export const addCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => candidateInput.extend({ confirmedDifferentFrom: z.array(z.string().uuid()).max(20).optional() }).parse(input))
  .handler(async ({ data: input, context }) => {
    await requireRole(context, ["Data Entry", "Recruiter", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { confirmedDifferentFrom = [], ...data } = input;
    await assertPassportIsUnique(supabaseAdmin, data.passportNumber);
    const lookAlikes = await findLookAlikes(supabaseAdmin, data);
    const unconfirmed = lookAlikes.filter((match: { id: string }) => !confirmedDifferentFrom.includes(match.id));
    if (unconfirmed.length) throw new Error(`Possible duplicate: ${unconfirmed[0].name} (${unconfirmed[0].candidateNumber}) has the same name, surname, date of birth and address. Check them first, then confirm this is a different person.`);
    const candidateNumber = data.candidateNumber?.trim() ? data.candidateNumber.trim() : await nextCandidateNumber(supabaseAdmin);
    const { data: candidate, error } = await supabaseAdmin.from("candidates").insert({ ...candidateValues(data), candidate_number: candidateNumber, status: "Available", created_by: context.userId, duplicate_checked_of: lookAlikes[0]?.id ?? null }).select().single();
    if (error) throw new Error(error.message);
    await ensureTradeOption(supabaseAdmin, context.userId, data.trade, data.category);
    await supabaseAdmin.from("audit_events").insert({ candidate_id: candidate.id, action: "Candidate created", actor_id: context.userId, new_status: "Available", details: lookAlikes.length ? { candidate_number: candidateNumber, confirmed_different_from: lookAlikes.map((match: { candidateNumber: string }) => match.candidateNumber) } : { candidate_number: candidateNumber } });
    return candidate;
  });

export const updateCandidateDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => candidateInput.extend({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Data Entry", "Recruiter", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertPassportIsUnique(supabaseAdmin, data.passportNumber, data.candidateId);
    const { data: candidate, error } = await supabaseAdmin.from("candidates").update(candidateValues(data)).eq("id", data.candidateId).select().single();
    if (error) throw new Error(error.message);
    await ensureTradeOption(supabaseAdmin, context.userId, data.trade, data.category);
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, action: "Candidate details updated", actor_id: context.userId });
    return candidate;
  });

export const bulkUpsertCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: any[] }) => input)
  .handler(async ({ data: { rows }, context }) => {
    await requireRole(context, ["Data Entry", "Recruiter", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let createdCount = 0;
    let updatedCount = 0;
    const errors: { row: number; error: string }[] = [];

    const parseExcelDate = (val: any): string | null => {
      if (!val) return null;
      if (typeof val === "number") {
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        return isNaN(date.getTime()) ? null : (date.toISOString().split("T")[0] ?? null);
      }
      if (val instanceof Date && !isNaN(val.getTime())) {
        return val.toISOString().split("T")[0] ?? null;
      }
      const str = String(val).trim();
      const direct = new Date(str);
      if (!isNaN(direct.getTime()) && direct.getFullYear() > 1900) {
        return direct.toISOString().split("T")[0] ?? null;
      }
      const parts = str.split(/[-/.]/);
      if (parts.length === 3) {
        let d = parts[0] ?? "";
        let m = parts[1] ?? "";
        let y = parts[2] ?? "";
        if (d.length === 4) {
          const temp = d;
          d = y;
          y = temp;
        }
        const parsed = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0] ?? null;
      }
      return null;
    };

    const cleanPhone = (val: any): string | null => {
      if (!val) return null;
      const str = String(val).replace(/\.0$/, "").trim();
      return str || null;
    };

    // 1. Fetch ALL existing candidates by paginating through all rows
    const passportMap = new Map<string, any>();
    const candNoMap = new Map<string, any>();
    let highestCandNum = 0;

    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: chunk, error: fetchErr } = await supabaseAdmin
        .from("candidates")
        .select("id, candidate_number, passport_number")
        .range(from, from + step - 1);

      if (fetchErr) throw fetchErr;

      for (const c of chunk ?? []) {
        if (c.passport_number?.trim()) {
          passportMap.set(c.passport_number.trim().toUpperCase(), c);
        }
        if (c.candidate_number?.trim()) {
          candNoMap.set(c.candidate_number.trim().toUpperCase(), c);
          const match = /^C-(\d+)$/i.exec(c.candidate_number.trim());
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > highestCandNum) {
              highestCandNum = num;
            }
          }
        }
      }

      if (!chunk || chunk.length < step) {
        hasMore = false;
      } else {
        from += step;
      }
    }

    // 2. Process rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIdx = i + 2;

      try {
        const getVal = (colNames: string[]) => {
          for (const k of Object.keys(row)) {
            const cleanKey = k.trim().toLowerCase();
            for (const target of colNames) {
              if (cleanKey === target.toLowerCase()) return row[k];
            }
          }
          return undefined;
        };

        const firstName = String(getVal(["First name (As per passport)", "First Name", "Name"]) ?? "").trim();
        const lastName = String(getVal(["Last name (As per passport)", "Last Name", "Surname"]) ?? "").trim();
        const passport = String(getVal(["Passport No.", "Passport Number", "Passport"]) ?? "").trim().toUpperCase();
        const candidateNo = String(getVal(["Candidate ID Assigned", "Candidate ID", "Candidate Number"]) ?? "").trim().toUpperCase();

        if (!firstName && !lastName && !passport) {
          continue;
        }

        const dob = parseExcelDate(getVal(["Date of Birth", "DOB"]));
        const doi = parseExcelDate(getVal(["Date of Issue", "Passport Issue Date"]));
        const doe = parseExcelDate(getVal(["Date of Expiry", "Passport Expiry"]));
        const placeOfIssue = String(getVal(["Place of Issue"]) ?? "").trim() || null;
        const phone1 = cleanPhone(getVal(["Contact No. 1", "Phone", "Mobile"]));
        const phone2 = cleanPhone(getVal(["Contact No. 2", "Alternate Contact"]));
        const emailRaw = String(getVal(["Email ID", "Email"]) ?? "").trim().toLowerCase();
        const email = emailRaw && emailRaw.includes("@") ? emailRaw : null;
        const trade = String(getVal(["Discipline", "Trade"]) ?? "").trim() || null;
        const category = String(getVal(["Category (eg. PIPING, TIG, ARC)", "Category"]) ?? "").trim() || null;

        const overseasMonths = Number(getVal(["Overseas (In Months)"])) || 0;
        const indiaMonths = Number(getVal(["In India  (In Months)", "In India (In Months)"])) || 0;
        const experienceYears = Math.min(70, Math.max(0, Math.round(((overseasMonths + indiaMonths) / 12) * 10) / 10));

        const techRating = Number(getVal(["Technical Rating"])) || 0;
        const engRating = Number(getVal(["English Rating"])) || 0;
        const rating = techRating || engRating
          ? Math.min(10, Math.max(0, Math.round(((techRating + engRating) / (techRating && engRating ? 2 : 1)) * 10) / 10))
          : 0;

        const exNew = String(getVal(["Ex / New", "Candidate Kind"]) ?? "").toUpperCase();
        const candidateKind = exNew.includes("EX") ? "Ex Candidate" : "New Candidate";
        const stateRes = String(getVal(["State of Residence"]) ?? "").trim();
        const countryRes = String(getVal(["Country of Residence"]) ?? "").trim();
        const address = [stateRes, countryRes].filter(Boolean).join(", ") || null;
        const reference = String(getVal(["Reference"]) ?? "").trim() || null;

        const payload: any = {
          name: firstName || lastName || "Unknown",
          surname: lastName || null,
          date_of_birth: dob,
          place_of_birth: null,
          address,
          email,
          phone: phone1,
          contact_no_2: phone2,
          reference,
          candidate_kind: candidateKind,
          trade,
          category,
          skills: trade ? [trade] : [],
          experience_years: experienceYears,
          rating,
          passport_number: passport || null,
          passport_issue_date: doi,
          passport_expiry: doe,
          passport_place_of_issue: placeOfIssue,
          updated_at: new Date().toISOString(),
        };

        let existing = null;
        if (passport && passportMap.has(passport)) {
          existing = passportMap.get(passport);
        } else if (candidateNo && candNoMap.has(candidateNo)) {
          existing = candNoMap.get(candidateNo);
        }

        if (existing) {
          const { error } = await supabaseAdmin
            .from("candidates")
            .update(payload)
            .eq("id", existing.id);

          if (error) throw error;

          await ensureTradeOption(supabaseAdmin, context.userId, trade, category);
          updatedCount++;
        } else {
          // Determine next unique candidate number
          let nextNum = candidateNo;
          if (!nextNum || candNoMap.has(nextNum)) {
            highestCandNum += 1;
            nextNum = `C-${String(highestCandNum).padStart(4, "0")}`;
          }

          const { data: newCand, error } = await supabaseAdmin
            .from("candidates")
            .insert({
              ...payload,
              candidate_number: nextNum,
              status: "Available",
              created_by: context.userId,
            })
            .select("id, candidate_number, passport_number")
            .single();

          if (error) throw error;

          await ensureTradeOption(supabaseAdmin, context.userId, trade, category);
          if (newCand.passport_number?.trim()) {
            passportMap.set(newCand.passport_number.trim().toUpperCase(), newCand);
          }
          candNoMap.set(newCand.candidate_number.trim().toUpperCase(), newCand);
          createdCount++;
        }
      } catch (err: any) {
        errors.push({ row: rowIdx, error: err.message || "Unknown error" });
      }
    }

    return {
      total: rows.length,
      created: createdCount,
      updated: updatedCount,
      failed: errors.length,
      errors: errors.slice(0, 20),
    };
  });

export const resolveDocumentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().trim().min(1).max(120), category: z.enum(["candidate", "project"]).default("candidate") }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Data Entry", "Recruiter", "Project Coordinator", "Mobilisation Executive", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalized = data.name.trim().toLowerCase();
    const { data: existing } = await supabaseAdmin.from("document_types").select("id,name").eq("normalized_name", normalized).eq("category", data.category).maybeSingle();
    if (existing) return existing;
    const created = await supabaseAdmin.from("document_types").insert({ name: data.name.trim(), category: data.category, created_by: context.userId }).select("id,name").single();
    if (created.error) throw new Error(created.error.message);
    return created.data;
  });

export const recordCandidateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid(), documentTypeId: z.string().uuid(), fileName: z.string().trim().min(1).max(255), storagePath: z.string().trim().min(1).max(500), expiryDate: z.string().optional(), projectId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Data Entry", "Recruiter", "Project Coordinator", "Mobilisation Executive", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.storagePath.startsWith(`${data.candidateId}/`)) throw new Error("Invalid document path");
    const { data: document, error } = await supabaseAdmin.from("candidate_documents").insert({ candidate_id: data.candidateId, project_id: data.projectId ?? null, document_type_id: data.documentTypeId, file_name: data.fileName, storage_path: data.storagePath, expiry_date: data.expiryDate || null, uploaded_by: context.userId }).select().single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, project_id: data.projectId ?? null, action: "Document uploaded", actor_id: context.userId, details: { document_id: document.id, file_name: data.fileName } });
    return document;
  });

export const getDocumentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().uuid(), download: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: document, error } = await supabaseAdmin
      .from("candidate_documents")
      .select("storage_path,file_name,candidates(name,surname),document_types(name)")
      .eq("id", data.documentId)
      .single();
    if (error || !document) throw new Error("Document not found");
    const person = document.candidates as unknown as { name: string | null; surname: string | null } | null;
    const typeName = (document.document_types as unknown as { name: string } | null)?.name ?? "Document";
    const niceName = documentFileName(person ?? null, typeName, document.file_name);
    const signed = await supabaseAdmin.storage
      .from("candidate-documents")
      .createSignedUrl(document.storage_path, 300, data.download ? { download: niceName } : undefined);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl, fileName: niceName };
  });

export const deleteCandidateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Data Entry", "Recruiter", "Project Coordinator", "Mobilisation Executive", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: document, error } = await supabaseAdmin.from("candidate_documents").select("id,candidate_id,project_id,storage_path,file_name").eq("id", data.documentId).single();
    if (error || !document) throw new Error("Document not found");
    const removed = await supabaseAdmin.storage.from("candidate-documents").remove([document.storage_path]);
    if (removed.error) throw new Error(removed.error.message);
    const deleted = await supabaseAdmin.from("candidate_documents").delete().eq("id", document.id);
    if (deleted.error) throw new Error(deleted.error.message);
    await supabaseAdmin.from("audit_events").insert({ candidate_id: document.candidate_id, project_id: document.project_id, action: "Document deleted", actor_id: context.userId, details: { document_id: document.id, file_name: document.file_name } });
    return { id: document.id };
  });

function documentFileName(
  candidate: { name: string | null | undefined; surname: string | null | undefined } | null | undefined,
  typeName: string,
  originalFileName: string,
) {
  const extension = originalFileName.includes(".") ? originalFileName.slice(originalFileName.lastIndexOf(".")) : "";
  const person = [candidate?.name, candidate?.surname].filter(Boolean).join(" ") || "Candidate";
  return `${person} - ${typeName}${extension}`.replace(/[\\/:*?"<>|]/g, "_");
}

export const downloadProjectDocumentsZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: assignments } = await supabaseAdmin.from("candidate_assignments").select("candidate_id").eq("project_id", data.projectId);
    const pastIds = [...new Set((assignments ?? []).map((row) => row.candidate_id))];
    const { data: candidates, error: candidatesError } = await supabaseAdmin
      .from("candidates")
      .select("id,candidate_number,surname,name")
      .or(`current_project_id.eq.${data.projectId}${pastIds.length ? `,id.in.(${pastIds.join(",")})` : ""}`);
    if (candidatesError) throw new Error(candidatesError.message);

    const candidateIds = (candidates ?? []).map((candidate) => candidate.id);
    if (candidateIds.length === 0) {
      const zip = new JSZip();
      const base64 = await zip.generateAsync({ type: "base64" });
      return { base64, fileName: `project-documents-${data.projectId}.zip` };
    }

    const { data: documents, error } = await supabaseAdmin
      .from("candidate_documents")
      .select("id,file_name,storage_path,candidate_id,document_types(name)")
      .in("candidate_id", candidateIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const candidateMap = new Map((candidates ?? []).map((candidate) => [candidate.id, candidate]));
    const zip = new JSZip();

    for (const document of documents ?? []) {
      const candidate = candidateMap.get(document.candidate_id);
      const typeName = (document.document_types as unknown as { name: string } | null)?.name ?? "Document";
      const candidateLabel = `${candidate?.candidate_number ?? "unknown"} - ${[candidate?.surname, candidate?.name].filter(Boolean).join(" ") || "Candidate"}`;
      const safeFolder = candidateLabel.replace(/[\\/:*?"<>|]/g, "_");
      const path = `${safeFolder}/${documentFileName({ name: candidate?.name, surname: candidate?.surname }, typeName, document.file_name)}`;

      const downloaded = await supabaseAdmin.storage.from("candidate-documents").download(document.storage_path);
      if (downloaded.error || !downloaded.data) continue;
      const bytes = await downloaded.data.arrayBuffer();
      zip.file(path, bytes);
    }

    const base64 = await zip.generateAsync({ type: "base64" });
    return { base64, fileName: `project-documents-${data.projectId}.zip` };
  });

export const downloadCandidateDocumentsZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: candidate, error: candidateError } = await supabaseAdmin
      .from("candidates")
      .select("id,candidate_number,surname,name")
      .eq("id", data.candidateId)
      .single();
    if (candidateError || !candidate) throw new Error("Candidate not found");

    const { data: documents, error } = await supabaseAdmin
      .from("candidate_documents")
      .select("id,file_name,storage_path,candidate_id,document_types(name)")
      .eq("candidate_id", data.candidateId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const candidateLabel = `${candidate.candidate_number} - ${[candidate.surname, candidate.name].filter(Boolean).join(" ") || "Candidate"}`;
    const safeFolder = candidateLabel.replace(/[\\/:*?"<>|]/g, "_");
    const zip = new JSZip();

    for (const document of documents ?? []) {
      const typeName = (document.document_types as unknown as { name: string } | null)?.name ?? "Document";
      const path = `${safeFolder}/${documentFileName(candidate, typeName, document.file_name)}`;

      const downloaded = await supabaseAdmin.storage.from("candidate-documents").download(document.storage_path);
      if (downloaded.error || !downloaded.data) continue;
      const bytes = await downloaded.data.arrayBuffer();
      zip.file(path, bytes);
    }

    const base64 = await zip.generateAsync({ type: "base64" });
    return { base64, fileName: `${safeFolder}.zip` };
  });

export const markCandidateAvailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Data Entry", "Recruiter", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: docs, error: docsError } = await supabaseAdmin.from("candidate_documents").select("document_types(name)").eq("candidate_id", data.candidateId);
    if (docsError) throw new Error(docsError.message);
    const names = new Set((docs ?? []).map((doc) => (doc.document_types as unknown as { name: string } | null)?.name));
    if (!names.has("CV") || !names.has("Passport")) throw new Error("CV and Passport are required before marking Available");
    const { data: candidate, error } = await supabaseAdmin.from("candidates").update({ status: "Available", current_project_id: null }).eq("id", data.candidateId).select().single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, action: "Candidate marked Available", actor_id: context.userId, new_status: "Available" });
    return candidate;
  });

export const setCandidateUnavailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid(), unavailable: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Data Entry", "Recruiter", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: candidate, error: readError } = await supabaseAdmin.from("candidates").select("status,current_project_id").eq("id", data.candidateId).single();
    if (readError || !candidate) throw new Error("Candidate not found");
    if (candidate.current_project_id) throw new Error("Candidate is on one of our projects. Close that assignment first.");
    if (data.unavailable && candidate.status !== "Available") throw new Error("Only Available candidates can be marked Unavailable");
    if (!data.unavailable && candidate.status !== "Unavailable") throw new Error("Candidate is not marked Unavailable");
    const next = data.unavailable ? "Unavailable" : "Available";
    const { data: updated, error } = await supabaseAdmin.from("candidates").update({ status: next, current_project_id: null }).eq("id", data.candidateId).select().single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, action: data.unavailable ? "Candidate marked Unavailable" : "Candidate returned to Available", actor_id: context.userId, previous_status: candidate.status, new_status: next });
    return updated;
  });

export const setEmployeeNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid(), projectId: z.string().uuid(), employeeNumber: z.string().trim().max(60) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Project Coordinator", "Mobilisation Executive", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const value = data.employeeNumber.trim();
    if (!value) throw new Error("Enter an employee number.");
    const { data: existing } = await supabaseAdmin.from("project_employee_numbers").select("id,employee_number").eq("project_id", data.projectId).eq("candidate_id", data.candidateId).maybeSingle();
    if (existing && existing.employee_number.toUpperCase() !== value.toUpperCase()) {
      throw new Error(`This employee already has employee number ${existing.employee_number} in this project. It cannot be changed.`);
    }
    const { data: clashes } = await supabaseAdmin.from("project_employee_numbers").select("candidate_id,project_id").ilike("employee_number", value);
    const clash = (clashes ?? []).find((row) => row.candidate_id !== data.candidateId);
    if (clash) {
      const { data: other } = await supabaseAdmin.from("candidates").select("name,surname,candidate_number").eq("id", clash.candidate_id).maybeSingle();
      const who = other ? [other.name, other.surname].filter(Boolean).join(" ") || other.candidate_number : "another employee";
      throw new Error(`Employee number ${value} already belongs to ${who}. Employee numbers cannot be reused.`);
    }
    const ownOtherProject = (clashes ?? []).find((row) => row.candidate_id === data.candidateId && row.project_id !== data.projectId);
    if (ownOtherProject) {
      throw new Error(`This employee already uses ${value} in another project. Employee numbers are project-wise — assign a different number for this project.`);
    }
    if (existing) return { employeeNumber: existing.employee_number };
    const { error } = await supabaseAdmin.from("project_employee_numbers").insert({ project_id: data.projectId, candidate_id: data.candidateId, employee_number: value, created_by: context.userId });
    if (error) throw new Error(error.message);
    const { data: candidate } = await supabaseAdmin.from("candidates").select("current_project_id").eq("id", data.candidateId).maybeSingle();
    if (candidate?.current_project_id === data.projectId) await supabaseAdmin.from("candidates").update({ employee_number: value }).eq("id", data.candidateId);
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, project_id: data.projectId, action: "Employee number set", actor_id: context.userId, details: { employee_number: value } });
    return { employeeNumber: value };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().trim().min(2).max(160), client: z.string().trim().min(2).max(160), country: z.string().trim().min(2).max(90), startDate: z.string().min(10), requiredHeadcount: z.number().int().min(0).max(10000).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Project Coordinator", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project, error } = await supabaseAdmin.from("projects").insert({ name: data.name, client: data.client, country: data.country, start_date: data.startDate, required_headcount: data.requiredHeadcount ?? 0, created_by: context.userId }).select().single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_events").insert({ project_id: project.id, action: "Project created", actor_id: context.userId, details: { name: data.name } });
    return project;
  });

export const cancelProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Project Coordinator", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project } = await supabaseAdmin.from("projects").select("id,cancelled_at").eq("id", data.projectId).single();
    if (!project) throw new Error("Project not found");
    if (project.cancelled_at) throw new Error("This project is already cancelled");

    const { data: attached } = await supabaseAdmin.from("candidates").select("id,status").eq("current_project_id", data.projectId);
    const now = new Date().toISOString();

    for (const candidate of attached ?? []) {
      await supabaseAdmin.from("candidates").update({ status: "Available", current_project_id: null }).eq("id", candidate.id);
      await supabaseAdmin
        .from("candidate_assignments")
        .update({ ended_at: now, end_reason: "Project cancelled", final_status: candidate.status })
        .eq("candidate_id", candidate.id)
        .eq("project_id", data.projectId)
        .is("ended_at", null);
      await supabaseAdmin.from("candidate_history").insert({ candidate_id: candidate.id, project_id: data.projectId, event: "Project cancelled", reason: data.reason, created_by: context.userId });
      await supabaseAdmin.from("audit_events").insert({ candidate_id: candidate.id, project_id: data.projectId, action: "Project cancelled", previous_status: candidate.status, new_status: "Available", actor_id: context.userId, details: { reason: data.reason } });
    }

    const { data: updatedProject, error } = await supabaseAdmin.from("projects").update({ cancelled_at: now, cancel_reason: data.reason }).eq("id", data.projectId).select().single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_events").insert({ project_id: data.projectId, action: "Project cancelled", actor_id: context.userId, details: { reason: data.reason, released: (attached ?? []).length } });
    return updatedProject;
  });

export const assignCandidateToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid(), projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Recruiter", "Project Coordinator", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project } = await supabaseAdmin.from("projects").select("cancelled_at").eq("id", data.projectId).single();
    if (project?.cancelled_at) throw new Error("This project is cancelled");
    const { data: candidate } = await supabaseAdmin.from("candidates").select("status").eq("id", data.candidateId).single();
    if (candidate?.status !== "Available") throw new Error("Only Available candidates can be assigned");
    const { data: updated, error } = await supabaseAdmin.from("candidates").update({ status: "Assigned", current_project_id: data.projectId }).eq("id", data.candidateId).eq("status", "Available").select().single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("candidate_assignments").insert({ candidate_id: data.candidateId, project_id: data.projectId, created_by: context.userId });
    await supabaseAdmin.from("candidate_history").insert({ candidate_id: data.candidateId, project_id: data.projectId, event: "Assigned to project", created_by: context.userId });
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, project_id: data.projectId, action: "Candidate assigned to project", previous_status: "Available", new_status: "Assigned", actor_id: context.userId });
    return updated;
  });

export const startNewContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid(), projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Project Coordinator", "Mobilisation Executive", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project } = await supabaseAdmin.from("projects").select("cancelled_at").eq("id", data.projectId).single();
    if (project?.cancelled_at) throw new Error("This project is cancelled");
    const { data: candidate } = await supabaseAdmin.from("candidates").select("status,current_project_id").eq("id", data.candidateId).single();
    if (!candidate || candidate.current_project_id || candidate.status !== "Available") throw new Error("Only employees who are back in the database as Available can start a new contract.");
    const { data: past } = await supabaseAdmin.from("candidate_assignments").select("id").eq("candidate_id", data.candidateId).eq("project_id", data.projectId).limit(1);
    if (!past?.length) throw new Error("This person has not worked on this project before.");
    const { data: numberRow } = await supabaseAdmin.from("project_employee_numbers").select("employee_number").eq("project_id", data.projectId).eq("candidate_id", data.candidateId).maybeSingle();
    const { data: updated, error } = await supabaseAdmin.from("candidates").update({ status: "Selected", current_project_id: data.projectId, rr_start_date: null, rr_days: null, employee_number: numberRow?.employee_number ?? null }).eq("id", data.candidateId).eq("status", "Available").select().single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("mobilisation_clearances").delete().eq("candidate_id", data.candidateId).eq("project_id", data.projectId);
    await supabaseAdmin.from("travel_details").delete().eq("candidate_id", data.candidateId);
    await supabaseAdmin.from("candidate_assignments").insert({ candidate_id: data.candidateId, project_id: data.projectId, created_by: context.userId });
    await supabaseAdmin.from("candidate_history").insert({ candidate_id: data.candidateId, project_id: data.projectId, event: "New contract — sent to mobilisation", created_by: context.userId });
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, project_id: data.projectId, action: "New contract started", previous_status: "Available", new_status: "Selected", actor_id: context.userId });
    return updated;
  });

export const setTravelDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid(), flightDate: z.string().min(10), flightNumber: z.string().trim().min(2).max(30), departureAirport: z.string().trim().min(3).max(80), departureTime: z.string().trim().max(20).optional(), arrivalAirport: z.string().trim().min(3).max(80), arrivalTime: z.string().trim().max(20).optional(), arrivalDate: z.string().trim().max(20).optional(), ticketNumber: z.string().trim().max(60).optional(), connections: z.array(z.object({ flightNumber: z.string().trim().min(2).max(30), from: z.string().trim().min(3).max(80), to: z.string().trim().min(3).max(80), departureDate: z.string().trim().max(20).optional(), departureTime: z.string().trim().max(20).optional(), arrivalDate: z.string().trim().max(20).optional(), arrivalTime: z.string().trim().max(20).optional() })).max(5).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Project Coordinator", "Mobilisation Executive", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const values = { candidate_id: data.candidateId, flight_date: data.flightDate, flight_number: data.flightNumber, departure_airport: data.departureAirport, departure_time: data.departureTime || null, arrival_airport: data.arrivalAirport, arrival_time: data.arrivalTime || null, arrival_date: data.arrivalDate || null, ticket_number: data.ticketNumber || null, connections: (data.connections ?? []).map((leg) => ({ ...leg, flightNumber: leg.flightNumber.toUpperCase(), from: leg.from.toUpperCase(), to: leg.to.toUpperCase() })), updated_by: context.userId };
    const { data: travel, error } = await supabaseAdmin.from("travel_details").upsert(values, { onConflict: "candidate_id" }).select().single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, action: "Travel details updated", actor_id: context.userId, details: { flight_date: data.flightDate, flight_number: data.flightNumber } });
    return travel;
  });

export const addStageRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid(), stage: z.enum(requirementStages), documentName: z.string().trim().min(1).max(120), category: z.enum(["candidate", "project"]).default("candidate") }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Project Coordinator", "Mobilisation Executive", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalized = data.documentName.trim().toLowerCase();
    let { data: type } = await supabaseAdmin.from("document_types").select("id").eq("normalized_name", normalized).eq("category", data.category).maybeSingle();
    if (!type) {
      const created = await supabaseAdmin.from("document_types").insert({ name: data.documentName.trim(), category: data.category, created_by: context.userId }).select("id").single();
      if (created.error) throw new Error(created.error.message);
      type = created.data;
    }
    const { data: requirement, error } = await supabaseAdmin.from("project_stage_requirements").upsert({ project_id: data.projectId, stage: data.stage, document_type_id: type.id, created_by: context.userId }, { onConflict: "project_id,stage,document_type_id" }).select().single();
    if (error) throw new Error(error.message);
    const { count } = await supabaseAdmin.from("project_stage_requirements").select("id", { count: "exact", head: true }).eq("document_type_id", type.id);
    await supabaseAdmin.from("document_types").update({ usage_count: count ?? 1 }).eq("id", type.id);
    return requirement;
  });

export const removeStageRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ requirementId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Project Coordinator", "Mobilisation Executive", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("project_stage_requirements").delete().eq("id", data.requirementId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setProjectTradeRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid(), trade: z.string().trim().min(2).max(80), category: z.string().trim().max(500).optional(), requiredCount: z.number().int().min(1).max(10000) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Project Coordinator", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const category = (data.category ?? "").trim();
    const { data: requirement, error } = await supabaseAdmin
      .from("project_trade_requirements")
      .upsert({ project_id: data.projectId, trade: data.trade.trim(), category, required_count: data.requiredCount, created_by: context.userId }, { onConflict: "project_id,trade,category" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await ensureTradeOption(supabaseAdmin, context.userId, data.trade, category);
    await supabaseAdmin.from("audit_events").insert({ project_id: data.projectId, action: "Trade requirement saved", actor_id: context.userId, details: { trade: data.trade.trim(), category, required_count: data.requiredCount } });
    return requirement;
  });

export const removeProjectTradeRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ requirementId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Project Coordinator", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("project_trade_requirements").select("project_id,trade").eq("id", data.requirementId).single();
    const { error } = await supabaseAdmin.from("project_trade_requirements").delete().eq("id", data.requirementId);
    if (error) throw new Error(error.message);
    if (existing) await supabaseAdmin.from("audit_events").insert({ project_id: existing.project_id, action: "Trade requirement removed", actor_id: context.userId, details: { trade: existing.trade } });
    return { ok: true };
  });

export const deactivateDocumentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentTypeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Super Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: type, error } = await supabaseAdmin.from("document_types").update({ is_active: false }).eq("id", data.documentTypeId).select().single();
    if (error) throw new Error(error.message);
    return type;
  });

export const changeCandidateStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        candidateId: z.string().uuid(),
        nextStatus: z.enum(statuses),
        rrStartDate: z.string().optional(),
        rrDays: z.number().int().min(1).max(365).optional(),
        reason: z.string().trim().max(400).optional(),
        interviewRating: z.number().min(0).max(10).optional(),
        practicalRating: z.number().min(0).max(10).optional(),
        eocDate: z.string().optional(),
        fromTravelBatch: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await requireRole(context, ["Recruiter", "Project Coordinator", "Mobilisation Executive", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: candidate, error } = await supabaseAdmin.from("candidates").select("status,current_project_id").eq("id", data.candidateId).single();
    if (error || !candidate) throw new Error("Candidate not found");
    const transitions: Record<string, Record<string, string[]>> = {
      "Project Coordinator": {
        Assigned: ["Interview", "Available"],
        Shortlisted: ["Interview", "Available"],
        Interview: ["Practical Test", "Available"],
        "Practical Test": ["Passed", "Available"],
        Passed: ["Selected", "Available"],
        "On Site": ["R&R", "Available"],
        "R&R": ["On Site", "Available"],
      },
      "Mobilisation Executive": { Selected: ["On Site", "Available"] },
      Recruiter: {
        Assigned: ["Interview", "Available"],
        Shortlisted: ["Interview", "Available"],
        Interview: ["Practical Test", "Available"],
        "Practical Test": ["Passed", "Available"],
        Passed: ["Selected", "Available"],
      },
    };
    transitions["Project Coordinator"]!["Selected"] = ["On Site", "Available"];
    if (role !== "Admin" && role !== "Super Admin" && !transitions[role]?.[candidate.status]?.includes(data.nextStatus)) throw new Error("This stage change is not permitted for your role");
    if ((role === "Admin" || role === "Super Admin") && candidate.status === data.nextStatus) throw new Error("No stage change requested");
    if (data.nextStatus === "On Site" && candidate.status !== "R&R" && candidate.current_project_id) {
      const { data: clearance } = await supabaseAdmin.from("mobilisation_clearances").select("medical_cleared,visa_cleared,police_cleared").eq("candidate_id", data.candidateId).eq("project_id", candidate.current_project_id).maybeSingle();
      if (!data.fromTravelBatch && (!clearance?.medical_cleared || !clearance?.visa_cleared || !clearance?.police_cleared)) throw new Error("Medical, visa and police clearance must all be confirmed first");
      const { data: travel } = await supabaseAdmin.from("travel_details").select("flight_date,flight_number").eq("candidate_id", data.candidateId).maybeSingle();
      if (!travel?.flight_date || !travel?.flight_number) throw new Error("Flight details must be filled in before moving this candidate on site");
    }
    const clearProject = data.nextStatus === "Available";
    if (data.nextStatus === "R&R" && (!data.rrStartDate || !data.rrDays)) throw new Error("R&R start date and number of days are required");
    if (clearProject && !["On Site", "R&R"].includes(candidate.status) && !data.reason) throw new Error("A reason is required");
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("candidates")
      .update({
        status: data.nextStatus,
        current_project_id: clearProject ? null : candidate.current_project_id,
        rr_start_date: data.nextStatus === "R&R" ? data.rrStartDate! : null,
        rr_days: data.nextStatus === "R&R" ? data.rrDays! : null,
        ...(data.interviewRating !== undefined ? { interview_rating: data.interviewRating } : {}),
        ...(data.practicalRating !== undefined ? { practical_rating: data.practicalRating } : {}),
        ...(clearProject ? { interview_rating: null, practical_rating: null } : {}),
      })
      .eq("id", data.candidateId)
      .select()
      .single();
    if (updateError) throw updateError;

    const wasOnSite = ["On Site", "R&R"].includes(candidate.status);
    const historyEvent = clearProject
      ? wasOnSite
        ? "End of contract"
        : ["Selected", "Medical", "Visa", "Mobilisation"].includes(candidate.status)
          ? "Mobilisation cancelled"
          : "Rejected"
      : data.nextStatus === "On Site"
        ? "Mobilised on site"
        : `Moved to ${data.nextStatus}`;

    if (clearProject && candidate.current_project_id) {
      const endReason = data.reason || (wasOnSite ? "End of contract" : "Rejected");
      const endedAt = wasOnSite && data.eocDate ? new Date(`${data.eocDate}T12:00:00Z`).toISOString() : new Date().toISOString();
      const { data: open } = await supabaseAdmin.from("candidate_assignments").select("id").eq("candidate_id", data.candidateId).eq("project_id", candidate.current_project_id).is("ended_at", null).order("assigned_at", { ascending: false }).limit(1).maybeSingle();
      if (open) {
        await supabaseAdmin.from("candidate_assignments").update({ ended_at: endedAt, end_reason: endReason, final_status: candidate.status }).eq("id", open.id);
      } else {
        await supabaseAdmin.from("candidate_assignments").insert({ candidate_id: data.candidateId, project_id: candidate.current_project_id, ended_at: endedAt, end_reason: endReason, final_status: candidate.status, created_by: context.userId });
      }
    }
    await supabaseAdmin.from("candidate_history").insert({
      candidate_id: data.candidateId,
      project_id: candidate.current_project_id,
      event: historyEvent,
      reason: data.reason || null,
      details: { previous_status: candidate.status, new_status: data.nextStatus, ...(data.interviewRating !== undefined ? { interview_rating: data.interviewRating } : {}), ...(data.practicalRating !== undefined ? { practical_rating: data.practicalRating } : {}) },
      created_by: context.userId,
    });
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, project_id: candidate.current_project_id, action: clearProject ? "Candidate returned to Available" : "Candidate stage changed", previous_status: candidate.status, new_status: data.nextStatus, actor_id: context.userId, details: data.reason ? { reason: data.reason } : {} });
    return updated;
  });

export const appendCandidateRemark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid(), text: z.string().trim().min(1).max(4000) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: remark, error } = await supabaseAdmin.from("candidate_remarks").insert({ candidate_id: data.candidateId, author_id: context.userId, text: data.text }).select().single();
    if (error) throw error;
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, action: "Remark appended", actor_id: context.userId, details: { remark_id: remark.id } });
    return remark;
  });

export const listStaffAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireRole(context, ["Super Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    const { data: assignments, error: roleError } = await supabaseAdmin.from("user_roles").select("user_id,role,is_active");
    if (roleError) throw new Error(roleError.message);
    const byUser = new Map((assignments ?? []).map((row) => [row.user_id, row]));
    return users.users.map((user) => {
      const assignment = byUser.get(user.id);
      return {
        id: user.id,
        email: user.email ?? "",
        role: (assignment?.role as string | undefined) ?? null,
        active: assignment ? assignment.is_active !== false : false,
        invited: !user.last_sign_in_at,
        createdAt: user.created_at,
      };
    });
  });

export const inviteStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().email(), role: z.enum(roles), redirectTo: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Super Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, { redirectTo: data.redirectTo });
    if (error) throw new Error(error.message);
    const userId = invited.user?.id;
    if (!userId) throw new Error("The invitation could not be created");
    const { data: existing } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", userId).maybeSingle();
    const result = existing
      ? await supabaseAdmin.from("user_roles").update({ role: data.role, is_active: true }).eq("id", existing.id)
      : await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
    if (result.error) throw new Error(result.error.message);
    return { id: userId, email: data.email, role: data.role };
  });

export const createStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().email(), password: z.string().min(10), role: z.enum(roles) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Super Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true });
    if (error) throw new Error(error.message);
    const userId = created.user?.id;
    if (!userId) throw new Error("Account could not be created");
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw roleError;
    }
    return { id: userId, email: data.email, role: data.role };
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid(), role: z.enum(roles) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Super Admin"]);
    if (data.userId === context.userId) throw new Error("You cannot change your own role");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", data.userId).maybeSingle();
    const result = existing
      ? await supabaseAdmin.from("user_roles").update({ role: data.role }).eq("id", existing.id).select().single()
      : await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role }).select().single();
    if (result.error) throw new Error(result.error.message);
    return { userId: data.userId, role: data.role };
  });

export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Super Admin"]);
    if (data.userId === context.userId) throw new Error("You cannot deactivate your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_roles").update({ is_active: data.active }).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    const ban = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: data.active ? "none" : "876000h" });
    if (ban.error) throw new Error(ban.error.message);
    return { userId: data.userId, active: data.active };
  });

export const setMobilisationClearance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        candidateId: z.string().uuid(),
        projectId: z.string().uuid(),
        medicalCleared: z.boolean(),
        medicalDate: z.string().optional(),
        visaCleared: z.boolean(),
        visaIssueDate: z.string().optional(),
        visaExpiryDate: z.string().optional(),
        policeCleared: z.boolean(),
        policeDate: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Project Coordinator", "Mobilisation Executive", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("mobilisation_clearances")
      .upsert(
        {
          candidate_id: data.candidateId,
          project_id: data.projectId,
          medical_cleared: data.medicalCleared,
          medical_date: data.medicalDate || null,
          visa_cleared: data.visaCleared,
          visa_issue_date: data.visaIssueDate || null,
          visa_expiry_date: data.visaExpiryDate || null,
          police_cleared: data.policeCleared,
          police_date: data.policeDate || null,
          updated_by: context.userId,
        },
        { onConflict: "candidate_id,project_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, project_id: data.projectId, action: "Mobilisation clearances updated", actor_id: context.userId, details: { medical: data.medicalCleared, visa: data.visaCleared, police: data.policeCleared } });
    return row;
  });

export const getCandidatePhotoLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: candidate } = await supabaseAdmin.from("candidates").select("photo_path").eq("id", data.candidateId).single();
    if (!candidate?.photo_path) return { url: null as string | null };
    const signed = await supabaseAdmin.storage.from("candidate-documents").createSignedUrl(candidate.photo_path, 600);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl as string | null };
  });

export const setCandidatePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid(), storagePath: z.string().trim().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Data Entry", "Recruiter", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.storagePath.startsWith(`${data.candidateId}/`)) throw new Error("Invalid photo path");
    const { error } = await supabaseAdmin.from("candidates").update({ photo_path: data.storagePath, photo_source: "Uploaded by staff" }).eq("id", data.candidateId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, action: "Candidate photo updated", actor_id: context.userId, details: { source: "Uploaded by staff" } });
    return { photoPath: data.storagePath };
  });

export const extractCandidatePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Data Entry", "Recruiter", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: documents } = await supabaseAdmin
      .from("candidate_documents")
      .select("id,file_name,storage_path,created_at,document_types(name)")
      .eq("candidate_id", data.candidateId)
      .order("created_at", { ascending: false });
    const passport = (documents ?? []).find((row: any) => /passport/i.test(String(row.document_types?.name ?? "")) || /passport/i.test(String(row.file_name ?? "")));
    if (!passport) throw new Error("No passport copy has been uploaded for this candidate yet");
    if (!/\.(jpe?g|png|webp)$/i.test(String(passport.file_name))) throw new Error("The passport copy must be a photo (JPG or PNG) for the picture to be read from it");

    const downloaded = await supabaseAdmin.storage.from("candidate-documents").download(passport.storage_path);
    if (downloaded.error || !downloaded.data) throw new Error("The passport copy could not be opened");
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const mime = /\.png$/i.test(passport.file_name) ? "image/png" : /\.webp$/i.test(passport.file_name) ? "image/webp" : "image/jpeg";
    const dataUrl = `data:${mime};base64,${btoa(binary)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "This is a scan of a passport. Return only the passport photograph of the person, cropped tightly to the portrait, upright, as a square image. Do not add any text or borders." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) throw new Error("The picture could not be read from the passport copy. Please upload a photo instead.");
    const payload = (await response.json()) as any;
    const image = payload?.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
    const base64 = image?.split(",")[1];
    if (!base64) throw new Error("No picture was found on the passport copy. Please upload a photo instead.");

    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) out[index] = raw.charCodeAt(index);
    const path = `${data.candidateId}/photo-${Date.now()}.png`;
    const uploaded = await supabaseAdmin.storage.from("candidate-documents").upload(path, out, { contentType: "image/png", upsert: true });
    if (uploaded.error) throw new Error(uploaded.error.message);
    const { error } = await supabaseAdmin.from("candidates").update({ photo_path: path, photo_source: "Passport copy" }).eq("id", data.candidateId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_events").insert({ candidate_id: data.candidateId, action: "Candidate photo updated", actor_id: context.userId, details: { source: "Passport copy" } });
    return { photoPath: path };
  });

export const deleteCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, ["Data Entry", "Recruiter", "Admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: candidate } = await supabaseAdmin.from("candidates").select("id,name,candidate_number").eq("id", data.candidateId).maybeSingle();
    if (!candidate) throw new Error("Candidate not found");

    const paths = new Set<string>();
    const { data: documents } = await supabaseAdmin.from("candidate_documents").select("storage_path").eq("candidate_id", data.candidateId);
    for (const document of documents ?? []) if (document.storage_path) paths.add(document.storage_path);
    const listed = await supabaseAdmin.storage.from("candidate-documents").list(data.candidateId, { limit: 1000 });
    for (const file of listed.data ?? []) paths.add(`${data.candidateId}/${file.name}`);
    if (paths.size) await supabaseAdmin.storage.from("candidate-documents").remove([...paths]);

    for (const table of ["candidate_documents", "candidate_remarks", "candidate_history", "travel_details", "mobilisation_clearances", "candidate_assignments", "audit_events"] as const) {
      await supabaseAdmin.from(table).delete().eq("candidate_id", data.candidateId);
    }
    const { error } = await supabaseAdmin.from("candidates").delete().eq("id", data.candidateId);
    if (error) throw new Error(error.message);
    return { candidateId: data.candidateId, name: candidate.name, candidateNumber: candidate.candidate_number };
  });