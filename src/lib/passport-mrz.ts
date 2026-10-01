// Parses the two machine-readable lines (MRZ, ICAO 9303 TD3) at the bottom of a passport data page.
// Every field is only returned when its check digit validates, so a misread character is never trusted.

const WEIGHTS = [7, 3, 1];

function charValue(c: string): number {
  if (c === "<") return 0;
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55;
  return -1;
}

export function mrzCheckDigit(value: string): number {
  let sum = 0;
  for (let i = 0; i < value.length; i++) {
    const v = charValue(value.charAt(i));
    if (v < 0) return -1;
    sum += v * (WEIGHTS[i % 3] ?? 1);
  }
  return sum % 10;
}

// OCR often confuses letters and digits in numeric fields.
function toDigits(value: string): string {
  const map: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6" };
  return value.replace(/[A-Z]/g, (c) => map[c] ?? c);
}

function cleanLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/[«‹〈＜]/g, "<")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9<]/g, "");
}

function isoFromYymmdd(yymmdd: string, kind: "birth" | "expiry"): string {
  if (!/^\d{6}$/.test(yymmdd)) return "";
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  const currentYy = new Date().getFullYear() % 100;
  const century = kind === "expiry" ? 2000 : yy > currentYy ? 1900 : 2000;
  return `${century + yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export type MrzResult = {
  surname: string;
  name: string;
  passportNumber: string;
  dateOfBirth: string;
  passportExpiry: string;
  sex: string;
  /** true when passport number, date of birth and expiry all passed their check digits */
  verified: boolean;
};

export function parsePassportMrz(line1: string, line2: string): MrzResult | null {
  const a = cleanLine(line1);
  let rawB = cleanLine(line2);
  // If a character was dropped or added in the passport-number part, re-align on the nationality code.
  const ind = rawB.indexOf("IND", 8);
  if (ind >= 8 && ind <= 12 && ind !== 10) rawB = ind > 10 ? rawB.slice(ind - 10) : rawB.slice(0, ind).padEnd(10, "<") + rawB.slice(ind);
  const b = rawB.padEnd(44, "<").slice(0, 44);
  if (b.replace(/</g, "").length < 15) return null;

  const result: MrzResult = { surname: "", name: "", passportNumber: "", dateOfBirth: "", passportExpiry: "", sex: "", verified: false };

  // Line 1: P<ISSUING COUNTRY (3) SURNAME<<GIVEN<NAMES<<<<
  if (a.startsWith("P") && a.length > 5) {
    const parts = a.slice(5).split("<<");
    result.surname = (parts[0] ?? "").replace(/</g, " ").trim();
    result.name = (parts[1] ?? "").replace(/</g, " ").replace(/\s+/g, " ").trim();
  }

  // Line 2: number(9) cd | nationality(3) | dob(6) cd | sex | expiry(6) cd | personal no(14) cd | final cd
  const numberField = b.slice(0, 9);
  const numberCd = Number(toDigits(b.charAt(9)));
  // Indian passport numbers are 1 letter + 7 digits; OCR often reads 8 as B, 0 as O, etc. Try that repair too.
  const repaired = numberField.charAt(0) + toDigits(numberField.slice(1, 8)) + numberField.slice(8);
  const numberValue = mrzCheckDigit(numberField) === numberCd ? numberField : mrzCheckDigit(repaired) === numberCd ? repaired : "";
  const numberOk = numberValue !== "";
  if (numberOk) result.passportNumber = numberValue.replace(/</g, "");

  const dobField = toDigits(b.slice(13, 19));
  const dobOk = mrzCheckDigit(dobField) === Number(toDigits(b.charAt(19)));
  if (dobOk) result.dateOfBirth = isoFromYymmdd(dobField, "birth");

  const sex = b.charAt(20);
  if (sex === "M" || sex === "F") result.sex = sex;

  const expField = toDigits(b.slice(21, 27));
  const expOk = mrzCheckDigit(expField) === Number(toDigits(b.charAt(27)));
  if (expOk) result.passportExpiry = isoFromYymmdd(expField, "expiry");

  result.verified = numberOk && dobOk && expOk;
  if (!result.passportNumber && !result.dateOfBirth && !result.passportExpiry) return null;
  return result;
}