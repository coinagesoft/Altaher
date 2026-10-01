// Pure text parser: turns OCR text of passport pages into form fields. No network, no API key.
import { parsePassportMrz } from "@/lib/passport-mrz";

export type PassportDetails = {
  surname: string;
  name: string;
  dateOfBirth: string;
  placeOfBirth: string;
  address: string;
  passportNumber: string;
  passportIssueDate: string;
  passportExpiry: string;
  passportPlaceOfIssue: string;
  mrzVerified: boolean;
  notes: string[];
};

const PASSPORT_OFFICES = [
  "AHMEDABAD", "SURAT", "RAJKOT", "VADODARA", "MUMBAI", "THANE", "PUNE", "NAGPUR", "PANAJI", "GOA", "DELHI", "JAIPUR", "LUCKNOW", "BAREILLY",
  "GHAZIABAD", "CHANDIGARH", "AMRITSAR", "JALANDHAR", "SHIMLA", "DEHRADUN", "SRINAGAR", "JAMMU", "PATNA", "RANCHI", "KOLKATA", "BHUBANESWAR",
  "GUWAHATI", "RAIPUR", "BHOPAL", "CHENNAI", "MADURAI", "TIRUCHIRAPPALLI", "COIMBATORE", "HYDERABAD", "VISAKHAPATNAM", "VIJAYAWADA", "TIRUPATI",
  "BENGALURU", "BANGALORE", "MANGALORE", "COCHIN", "KOCHI", "KOZHIKODE", "MALAPPURAM", "KANNUR", "TRIVANDRUM", "THIRUVANANTHAPURAM",
];

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function normaliseDigits(value: string): string {
  return value.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
}

type Ymd = { y: number; m: number; d: number };
const iso = ({ y, m, d }: Ymd) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function parseIso(value: string): Ymd | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}
function validDate({ y, m, d }: Ymd) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
// issue date such that expiry = issue + years - 1 day
function expiryFromIssue(issue: Ymd, years: number): string {
  const dt = new Date(Date.UTC(issue.y + years, issue.m - 1, issue.d - 1));
  return iso({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}
function issueFromExpiry(expiry: Ymd, years: number): string {
  const dt = new Date(Date.UTC(expiry.y - years, expiry.m - 1, expiry.d + 1));
  return iso({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

function allPrintedDates(text: string): Ymd[] {
  const out: Ymd[] = [];
  for (const m of text.matchAll(/([0-9OIl|]{2})\s?[\/.\-]\s?([0-9OIl|]{2})\s?[\/.\-]\s?([0-9OIl|]{4})/g)) {
    const d = { d: Number(normaliseDigits(m[1]!)), m: Number(normaliseDigits(m[2]!)), y: Number(normaliseDigits(m[3]!)) };
    if (validDate(d)) out.push(d);
  }
  return out;
}

function nonEmptyLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function lineAfter(lines: string[], label: RegExp, skip = 0): string {
  const i = lines.findIndex((l) => label.test(l));
  return i >= 0 ? (lines[i + 1 + skip] ?? "") : "";
}

function upperWords(value: string): string {
  const m = value.toUpperCase().match(/[A-Z]{3,}(?:[ ,.\-]+[A-Z]{3,})*/);
  return m ? m[0].replace(/[ ,.\-]+$/, "").replace(/\s+/g, " ") : "";
}

export function extractPassportFromOcr(pageTexts: string[]): PassportDetails {
  const notes: string[] = [];
  const fullText = pageTexts.join("\n");
  const lines = nonEmptyLines(fullText);

  // ---- 1. machine-readable lines (check-digit protected) ----
  let mrz = null as ReturnType<typeof parsePassportMrz>;
  for (let i = 0; i < lines.length - 1 && !mrz; i++) {
    const a = lines[i]!;
    const compact = a.replace(/\s/g, "");
    if (!/^[|\[]?P/i.test(compact) || (compact.match(/</g) ?? []).length < 5) continue;
    // line 2 is one of the next two lines: long, mostly digits/letters, at least one "<"
    for (const b of lines.slice(i + 1, i + 3)) {
      const bc = b.replace(/\s/g, "");
      if (bc.length >= 28 && bc.includes("<") && (bc.match(/\d/g) ?? []).length >= 12) {
        mrz = parsePassportMrz(a, b);
        if (mrz) break;
      }
    }
  }

  // ---- 2. word vote: fixes OCR slips in names using the same words printed elsewhere (father/mother/spouse lines) ----
  const vocab = new Map<string, number>();
  for (const l of lines) {
    if (l.includes("<<")) continue;
    for (const w of l.toUpperCase().match(/[A-Z]{4,}/g) ?? []) vocab.set(w, (vocab.get(w) ?? 0) + 1);
  }
  const snap = (token: string): string => {
    let best = token;
    let bestScore = 0.5 + (vocab.get(token) ?? 0); // the reading itself counts as half a vote plus any exact matches elsewhere
    for (const [w, count] of vocab) {
      if (w !== token && token.length >= 4 && editDistanceAtMost1(w, token) && count > bestScore) {
        best = w;
        bestScore = count;
      }
    }
    return best;
  };
  const snapPhrase = (phrase: string) => phrase.split(/\s+/).filter(Boolean).map(snap).join(" ");

  // ---- 3. names ----
  const printedSurname = upperWords(lineAfter(lines, /sur\s?name/i));
  const printedGiven = upperWords(lineAfter(lines, /given\s*name/i));
  const surname = snapPhrase(mrz?.surname || printedSurname);
  const name = snapPhrase(mrz?.name || printedGiven);
  if (!mrz?.surname && !printedSurname) notes.push("Surname could not be read.");

  // ---- 4. passport number, birth date, expiry ----
  let passportNumber = mrz?.passportNumber ?? "";
  if (!passportNumber) {
    const m = fullText.toUpperCase().match(/\b([A-Z])\s?([0-9OIBS]{7})\b/);
    if (m) passportNumber = m[1]! + normaliseDigits(m[2]!);
  }
  let dateOfBirth = mrz?.dateOfBirth ?? "";
  let passportExpiry = mrz?.passportExpiry ?? "";

  const printedDates = allPrintedDates(lines.filter((l) => !l.includes("<")).join("\n"));
  if (!passportExpiry && printedDates.length) {
    const latest = [...printedDates].sort((a, b) => iso(b).localeCompare(iso(a)))[0]!;
    passportExpiry = iso(latest);
    notes.push("Expiry date was read from the printed text only - please confirm.");
  }

  // ---- 5. issue date (printed only; not in the MRZ) ----
  let passportIssueDate = "";
  const expiryYmd = parseIso(passportExpiry);
  const dobYmd = parseIso(dateOfBirth);
  if (expiryYmd) {
    const pool = printedDates.filter((d) => iso(d) !== passportExpiry && iso(d) !== dateOfBirth);
    const exact = pool.find((d) => [10, 5].some((yrs) => expiryFromIssue(d, yrs) === passportExpiry));
    if (exact) passportIssueDate = iso(exact);
    else {
      // Indian adult passports are valid for 10 years (expiry = issue + 10y - 1 day)
      const derived = issueFromExpiry(expiryYmd, 10);
      const near = pool.find((d) => d.y === expiryYmd.y - 10 || d.y === expiryYmd.y - 5);
      passportIssueDate = near ? iso(near) : derived;
      notes.push(near ? "Issue date read from the printed text may be slightly off - please confirm." : "Issue date could not be read clearly; it was worked out as expiry minus 10 years plus 1 day - please confirm.");
    }
    if (dobYmd && passportIssueDate <= dateOfBirth) passportIssueDate = "";
  }

  // ---- 6. places ----
  let placeOfIssue = "";
  const issueIdx = lines.findIndex((l) => /place\s+of\s+(is|le|i)s?s?ue/i.test(l));
  if (issueIdx >= 0) {
    const window = lines.slice(issueIdx, issueIdx + 4).join(" ").toUpperCase();
    placeOfIssue = PASSPORT_OFFICES.find((c) => window.includes(c)) ?? "";
    if (!placeOfIssue) placeOfIssue = upperWords(lines[issueIdx + 1] ?? "");
  }
  if (!placeOfIssue) {
    const m = lines.filter((l) => !l.includes("<")).join(" ").toUpperCase();
    // last resort: a passport-office city that appears right next to the issue date
    placeOfIssue = PASSPORT_OFFICES.find((c) => new RegExp(`\\b${c}\\b`).test(m)) ?? "";
    if (placeOfIssue) notes.push("Place of issue is a best guess - please confirm.");
  }

  const placeOfBirth = snapPhrase(upperWords(lineAfter(lines, /place\s+of\s+birth/i))).replace(/\s+/g, " ");

  // ---- 7. address from the back page ----
  const STATES = ["GUJARAT", "MAHARASHTRA", "RAJASTHAN", "KARNATAKA", "KERALA", "PUNJAB", "HARYANA", "JHARKHAND", "BIHAR", "ODISHA", "TELANGANA", "UTTARAKHAND", "CHHATTISGARH", "ASSAM", "TAMIL NADU", "WEST BENGAL", "MADHYA PRADESH", "UTTAR PRADESH", "ANDHRA PRADESH", "DELHI", "GOA", "INDIA"];
  const fixToken = (tok: string) => {
    if (tok.length < 5) return tok;
    const state = STATES.find((st) => !st.includes(" ") && editDistanceAtMost1(st, tok));
    return state ?? tok;
  };
  let address = "";
  const pinIdx = lines.findIndex((l) => /PIN\s*[:;]?\s*\d{6}/i.test(l));
  if (pinIdx >= 0) {
    const picked: string[] = [];
    for (let i = pinIdx; i >= 0 && picked.length < 4; i--) {
      let l = lines[i]!;
      if (i !== pinIdx && /name\s+of|addr|add[a-z]{1,4}s{1,2}\b|spouse|mother|father|guardian/i.test(l)) break;
      if (i === pinIdx) l = l.replace(/(INDIA).*$/i, "$1"); // cut OCR junk after the PIN line
      let cleaned = l.toUpperCase().replace(/[^A-Z0-9,.:\-= ]/g, " ").replace(/=/g, "-").replace(/\s{2,}/g, " ").trim();
      if (i !== pinIdx) cleaned = cleaned.replace(/(\s+[A-Z]{1,3})+$/, (m) => (/^\s+(NR|RD|ST)$/.test(m) ? m : "")).trim();
      if (cleaned.length >= 5 && /[A-Z]{3}/.test(cleaned)) picked.unshift(cleaned);
    }
    address = picked
      .join(", ")
      .replace(/PIN:\s*/, "PIN ")
      .replace(/\s+,/g, ",")
      .replace(/[A-Z]{5,}/g, fixToken)
      .replace(/\s{2,}/g, " ");
    if (address) notes.push("Address was read from the back page - please check spelling.");
  }

  return {
    surname,
    name,
    dateOfBirth,
    placeOfBirth,
    address,
    passportNumber,
    passportIssueDate,
    passportExpiry,
    passportPlaceOfIssue: placeOfIssue,
    mrzVerified: Boolean(mrz?.verified),
    notes,
  };
}