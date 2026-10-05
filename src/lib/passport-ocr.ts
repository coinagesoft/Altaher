import { passportFileToCanvases } from "@/lib/passport-pdf";
import type { PassportDetails } from "@/lib/passport-text";
import { parsePassportMrz } from "@/lib/passport-mrz";
import { GEMINI_CONFIG } from "@/lib/gemini-config";
import { askGeminiForOrientation, askGeminiForPassport } from "@/lib/passport-gemini-core";
import { readPassportWithGemini } from "@/lib/passport-gemini.functions";


export type { PassportDetails };

export type PassportReadResult = PassportDetails & {
  source: "gemini";
  engineNote: string;
};

type Rotation = 0 | 90 | 180 | 270;
type PageKind = "data_page" | "back_page" | "visa" | "other";

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

function validIso(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalizeDate(raw?: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const ymd = trimmed.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (ymd) return validIso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) return validIso(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const text = trimmed.toUpperCase().match(/^(\d{1,2})[\s\-\/.]*([A-Z]{3,9})[\s\-\/.,]*(\d{4})$/);
  if (text) {
    const m = MONTHS[text[2]!.slice(0, 3)];
    if (m) return validIso(Number(text[3]), Number(m), Number(text[1]));
  }
  return "";
}

const text = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  return /^(null|n\/a|none|unknown|-)$/i.test(trimmed) ? "" : trimmed;
};

function detailsFromGemini(parsed: Record<string, unknown>): PassportDetails {
  const notes: string[] = Array.isArray(parsed["notes"]) ? (parsed["notes"] as unknown[]).map(text).filter(Boolean) : [];

  let mrz: ReturnType<typeof parsePassportMrz> = null;
  const mrz1 = text(parsed["mrzLine1"]);
  const mrz2 = text(parsed["mrzLine2"]);
  if (mrz1 && mrz2) {
    try {
      mrz = parsePassportMrz(mrz1, mrz2);
    } catch {
      mrz = null;
    }
  }

  const printedNumber = text(parsed["passportNumber"]).replace(/\s+/g, "").toUpperCase();
  const printedDob = normalizeDate(parsed["dateOfBirth"]);
  const printedExpiry = normalizeDate(parsed["passportExpiry"]);
  let issue = normalizeDate(parsed["passportIssueDate"]);

  // The machine-readable lines are check-digit protected, so a verified field there beats the printed reading.
  const passportNumber = mrz?.passportNumber || printedNumber;
  const dateOfBirth = mrz?.dateOfBirth || printedDob;
  const passportExpiry = mrz?.passportExpiry || printedExpiry;
  const surname = (mrz?.surname || text(parsed["surname"])).toUpperCase();
  const name = (mrz?.name || text(parsed["name"])).toUpperCase();

  if (mrz) {
    if (printedNumber && mrz.passportNumber && printedNumber !== mrz.passportNumber) notes.push("Printed passport number differs from the machine-readable lines - the verified one was used.");
    if (printedDob && mrz.dateOfBirth && printedDob !== mrz.dateOfBirth) notes.push("Printed date of birth differs from the machine-readable lines - the verified one was used.");
  }
  if (passportNumber && !/^[A-Z][0-9]{7}$/.test(passportNumber)) notes.push("Passport number is not in the usual 1 letter + 7 digits format - please check it.");
  if (issue && passportExpiry && issue >= passportExpiry) {
    issue = "";
    notes.push("Issue date looked wrong and was left blank.");
  }
  if (issue && dateOfBirth && issue <= dateOfBirth) issue = "";

  return {
    surname,
    name,
    dateOfBirth,
    placeOfBirth: text(parsed["placeOfBirth"]).toUpperCase(),
    address: text(parsed["address"]),
    passportNumber,
    passportIssueDate: issue,
    passportExpiry,
    passportPlaceOfIssue: text(parsed["passportPlaceOfIssue"]).toUpperCase(),
    mrzVerified: Boolean(mrz?.verified),
    notes,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Image preparation (browser only)
// ---------------------------------------------------------------------------------------------------------------

function rotateCanvas(src: HTMLCanvasElement, degrees: Rotation): HTMLCanvasElement {
  if (degrees === 0) return src;
  const out = document.createElement("canvas");
  const sideways = degrees === 90 || degrees === 270;
  out.width = sideways ? src.height : src.width;
  out.height = sideways ? src.width : src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  if (degrees === 90) {
    ctx.translate(out.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (degrees === 180) {
    ctx.translate(out.width, out.height);
    ctx.rotate(Math.PI);
  } else {
    ctx.translate(0, out.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(src, 0, 0);
  return out;
}

function resizeCanvas(src: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  if (scale >= 1) return src;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(src.width * scale));
  out.height = Math.max(1, Math.round(src.height * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

/** A scan of one passport page usually has a lot of empty paper around it. Cropping it away makes the text bigger for Gemini. */
function cropToDocument(src: HTMLCanvasElement): HTMLCanvasElement {
  try {
    const small = resizeCanvas(src, 400);
    const ctx = small.getContext("2d", { willReadFrequently: true });
    if (!ctx) return src;
    const { width: w, height: h } = small;
    const { data } = ctx.getImageData(0, 0, w, h);
    const margin = Math.round(0.03 * Math.max(w, h)); // ignore scanner edge lines
    const rowInk = new Array<number>(h).fill(0);
    const colInk = new Array<number>(w).fill(0);
    for (let y = margin; y < h - margin; y += 1) {
      for (let x = margin; x < w - margin; x += 1) {
        const i = (y * w + x) * 4;
        if (Math.min(data[i]!, data[i + 1]!, data[i + 2]!) < 235) {
          rowInk[y] = rowInk[y]! + 1;
          colInk[x] = colInk[x]! + 1;
        }
      }
    }
    const rows = rowInk.map((n, y) => (n / w > 0.12 ? y : -1)).filter((y) => y >= 0);
    const cols = colInk.map((n, x) => (n / h > 0.12 ? x : -1)).filter((x) => x >= 0);
    if (rows.length < 20 || cols.length < 20) return src;

    const padX = 0.04 * w;
    const padY = 0.04 * h;
    const x0 = Math.max(0, Math.min(...cols) - padX) / w;
    const x1 = Math.min(w, Math.max(...cols) + padX) / w;
    const y0 = Math.max(0, Math.min(...rows) - padY) / h;
    const y1 = Math.min(h, Math.max(...rows) + padY) / h;
    const area = (x1 - x0) * (y1 - y0);
    if (area > 0.9 || area < 0.1) return src; // nothing worth cropping, or the detection looks wrong

    const sx = Math.round(x0 * src.width);
    const sy = Math.round(y0 * src.height);
    const sw = Math.round((x1 - x0) * src.width);
    const sh = Math.round((y1 - y0) * src.height);
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    const octx = out.getContext("2d");
    if (!octx) return src;
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, sw, sh);
    octx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    return out;
  } catch {
    return src;
  }
}

function toBase64Jpeg(canvas: HTMLCanvasElement, maxSide: number, quality: number): string {
  return resizeCanvas(canvas, maxSide).toDataURL("image/jpeg", quality).replace(/^data:image\/jpeg;base64,/, "");
}

// ---------------------------------------------------------------------------------------------------------------
// Calling Gemini: server first (the key stays private), then straight from the browser as a backup route
// ---------------------------------------------------------------------------------------------------------------

async function callGemini(task: "orient" | "extract", images: string[], models: string[] | undefined, onProgress?: (msg: string) => void): Promise<Record<string, unknown>> {
  let problem = "";
  let tryBrowser = true;
  try {
    const response = await readPassportWithGemini({ data: { task, images, ...(models ? { models } : {}) } });
    if (response.ok) return JSON.parse(response.json) as Record<string, unknown>;
    problem = response.error;
    tryBrowser = response.reason === "no_key"; // the same key would fail the same way in the browser
  } catch (error) {
    problem = `The server could not reach Gemini (${error instanceof Error ? error.message : "unknown error"}).`;
  }

  if (tryBrowser && GEMINI_CONFIG.ApiKey) {
    const run = task === "orient" ? askGeminiForOrientation : askGeminiForPassport;
    try {
      return await run({ apiKey: GEMINI_CONFIG.ApiKey, models: models ?? GEMINI_CONFIG.Models, images, onProgress });
    } catch (error) {
      problem = error instanceof Error ? error.message : problem;
    }
  }
  throw new Error(problem || "Gemini failed.");
}

// ---------------------------------------------------------------------------------------------------------------
// Orientation + extraction
// ---------------------------------------------------------------------------------------------------------------

type PagePlan = { rotation: Rotation; kind: PageKind };

async function planPages(canvases: HTMLCanvasElement[], onProgress?: (msg: string) => void): Promise<PagePlan[]> {
  const fallback: PagePlan[] = canvases.map(() => ({ rotation: 0, kind: "other" }));
  try {
    onProgress?.("Checking which way up each page is...");
    const images = canvases.map((c) => toBase64Jpeg(c, 800, 0.7));
    const answer = await callGemini("orient", images, undefined, onProgress);
    const pages = Array.isArray(answer["pages"]) ? (answer["pages"] as Array<Record<string, unknown>>) : [];
    const plan = canvases.map((_, index): PagePlan => {
      const hit = pages.find((p) => Number(p["page"]) === index + 1) ?? pages[index];
      const raw = Number(hit?.["rotateClockwise"]);
      const rotation: Rotation = raw === 90 || raw === 180 || raw === 270 ? raw : 0;
      const kindText = String(hit?.["kind"] ?? "").toLowerCase();
      const kind: PageKind = kindText.includes("data") ? "data_page" : kindText.includes("back") ? "back_page" : kindText.includes("visa") ? "visa" : "other";
      return { rotation, kind };
    });
    return plan;
  } catch (error) {
    console.warn("Page orientation check failed, sending the pages as they are:", error);
    return fallback;
  }
}

const STRONGER_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash"];

const isEmpty = (d: PassportDetails) => !d.passportNumber && !d.surname && !d.name;

function missingFields(d: PassportDetails, expectBackPage: boolean): string[] {
  const missing: string[] = [];
  if (!d.surname && !d.name) missing.push("name");
  if (!d.passportNumber) missing.push("passport number");
  if (!d.dateOfBirth) missing.push("date of birth");
  if (!d.placeOfBirth) missing.push("place of birth");
  if (!d.passportIssueDate) missing.push("issue date");
  if (!d.passportExpiry) missing.push("expiry date");
  if (!d.passportPlaceOfIssue) missing.push("place of issue");
  if (expectBackPage && !d.address) missing.push("address");
  return missing;
}

function mergeDetails(primary: PassportDetails, extra: PassportDetails): PassportDetails {
  const [a, b] = extra.mrzVerified && !primary.mrzVerified ? [extra, primary] : [primary, extra];
  return {
    surname: a.surname || b.surname,
    name: a.name || b.name,
    dateOfBirth: a.dateOfBirth || b.dateOfBirth,
    placeOfBirth: a.placeOfBirth || b.placeOfBirth,
    address: a.address || b.address,
    passportNumber: a.passportNumber || b.passportNumber,
    passportIssueDate: a.passportIssueDate || b.passportIssueDate,
    passportExpiry: a.passportExpiry || b.passportExpiry,
    passportPlaceOfIssue: a.passportPlaceOfIssue || b.passportPlaceOfIssue,
    mrzVerified: a.mrzVerified || b.mrzVerified,
    notes: Array.from(new Set([...a.notes, ...b.notes])),
  };
}

/** Indian adult passports are valid for 10 years: expiry = issue + 10 years - 1 day. */
function issueFromExpiry(expiryIso: string): string {
  const m = expiryIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Date.UTC(Number(m[1]) - 10, Number(m[2]) - 1, Number(m[3]) + 1));
  return validIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export async function readPassportFile(file: File, onProgress?: (msg: string) => void): Promise<PassportReadResult> {
  onProgress?.("Loading passport document pages...");
  const canvases = await passportFileToCanvases(file);

  // 1. find out which way up every page is, and drop visa pages
  const plan = await planPages(canvases, onProgress);
  let usable = canvases
    .map((canvas, index) => ({ canvas, ...plan[index]! }))
    .filter((page) => page.kind === "data_page" || page.kind === "back_page");
  if (!usable.length) usable = canvases.map((canvas, index) => ({ canvas, ...plan[index]! })).filter((page) => page.kind !== "visa");
  if (!usable.length) usable = canvases.map((canvas, index) => ({ canvas, ...plan[index]! }));
  const expectBackPage = usable.some((page) => page.kind === "back_page");

  // 2. turn pages upright, crop the empty paper away, send at high resolution
  const images = usable.map((page) => toBase64Jpeg(cropToDocument(rotateCanvas(page.canvas, page.rotation)), 2400, 0.92));

  // 3. read the details
  let details: PassportDetails | null = null;
  let problem = "";
  try {
    const answer = await callGemini("extract", images, undefined, onProgress);
    details = detailsFromGemini(answer);
  } catch (error) {
    problem = error instanceof Error ? error.message : "Gemini failed.";
    console.warn("Gemini passport reading failed:", error);
  }

  // 4. anything still missing (or the machine-readable lines unverified): ask a stronger model and merge
  if (!details || missingFields(details, expectBackPage).length > 0 || !details.mrzVerified) {
    try {
      onProgress?.("Double-checking the details with a stronger Gemini model...");
      const answer = await callGemini("extract", images, STRONGER_MODELS, onProgress);
      const second = detailsFromGemini(answer);
      details = details ? mergeDetails(details, second) : second;
      problem = "";
    } catch (error) {
      if (!details) problem = error instanceof Error ? error.message : problem;
      console.warn("Second Gemini pass failed:", error);
    }
  }

  if (!details || isEmpty(details)) {
    throw new Error(`Gemini could not read the passport: ${problem || "no passport details were found on these pages."} You can fill in the details by hand.`);
  }

  // 5. tidy up
  const notes: string[] = [];
  if (!details.passportIssueDate && details.passportExpiry) {
    const derived = issueFromExpiry(details.passportExpiry);
    if (derived) {
      details = { ...details, passportIssueDate: derived };
      notes.push("Issue date was worked out from the expiry date (10-year passport) - please confirm.");
    }
  }
  const stillMissing = missingFields(details, expectBackPage);
  if (stillMissing.length) notes.push(`Not found on the pages: ${stillMissing.join(", ")}.`);
  if (!expectBackPage) notes.push("The back page (address) was not found in this file.");

  // Gemini's own free-text remarks are kept only when they flag a real reading doubt.
  const doubts = details.notes.filter((n) => /differs|usual 1 letter|looked wrong|blurry|illegible|unclear|uncertain/i.test(n));
  return { ...details, notes: [...doubts, ...notes], source: "gemini", engineNote: "" };
}