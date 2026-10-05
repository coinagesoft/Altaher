// Shared by the server function and the browser fallback. Plain fetch only, no browser or server APIs.

export class GeminiPassportError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const PASSPORT_SYSTEM_INSTRUCTION = `You are an expert passport reader, specialised in Indian and international passports.
You receive scanned pages of ONE person's documents. Pages may be rotated sideways or upside down - mentally rotate them so the text is upright before reading. They may include the passport data page (photo, personal details and the two machine-readable lines at the bottom), the passport back page (address, father/mother/spouse names, old passport details, file number) and also unrelated pages such as visa stickers, ID cards or covers. Use ONLY the passport pages. Ignore visas and any other document.

Rules:
- Read what is printed. Never guess or invent. If a value is not visible or not legible, return an empty string for it.
- surname: family name in UPPERCASE (empty if the passport shows only given names).
- name: given name(s) in UPPERCASE.
- passportNumber: the passport number printed top right of the data page, no spaces (Indian format: one letter followed by seven digits, e.g. A1234567). Do NOT use the "old passport" number or the file number from the back page.
- dateOfBirth, passportIssueDate, passportExpiry: always YYYY-MM-DD. Printed dates are DD/MM/YYYY.
- placeOfBirth: town/city and state exactly as printed.
- passportPlaceOfIssue: the passport office printed under "Place of Issue", e.g. SURAT.
- address: the residential address from the back page, the lines under "Address", as one line ending with the PIN code. Do NOT include the father, mother or spouse names. Empty if the back page is not provided.
- mrzLine1 and mrzLine2: the two machine-readable lines at the bottom of the data page, each exactly 44 characters, copied character by character, keeping every "<" filler. Empty if not visible.
- notes: short warnings for anything blurry, cut off or uncertain.`;

export const PASSPORT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    surname: { type: "STRING" },
    name: { type: "STRING" },
    dateOfBirth: { type: "STRING" },
    placeOfBirth: { type: "STRING" },
    address: { type: "STRING" },
    passportNumber: { type: "STRING" },
    passportIssueDate: { type: "STRING" },
    passportExpiry: { type: "STRING" },
    passportPlaceOfIssue: { type: "STRING" },
    mrzLine1: { type: "STRING" },
    mrzLine2: { type: "STRING" },
    notes: { type: "ARRAY", items: { type: "STRING" } },
  },
};

export function cleanEnvValue(value?: string | null): string {
  return (value ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

export function buildModelList(primary?: string | null): string[] {
  const first = cleanEnvValue(primary) || "gemini-3.1-flash-lite";
  return Array.from(new Set([first, "gemini-2.5-flash", "gemini-3.5-flash"]));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function shortError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message.slice(0, 260);
  } catch {
    /* not JSON */
  }
  return body.slice(0, 260);
}

type Parts = Array<Record<string, unknown>>;

function buildParts(instruction: string, images: string[]): Parts {
  const parts: Parts = [{ text: instruction }];
  images.forEach((data, index) => {
    parts.push({ text: `Page ${index + 1} of ${images.length}:` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data } });
  });
  return parts;
}

async function callOnce(model: string, apiKey: string, parts: Parts, schema: Record<string, unknown>, useSchema: boolean): Promise<Record<string, unknown>> {
  const generationConfig: Record<string, unknown> = { responseMimeType: "application/json" };
  if (useSchema) generationConfig["responseSchema"] = schema;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new GeminiPassportError(0, "Gemini took too long to answer.");
    throw new GeminiPassportError(0, "Could not reach Gemini (network problem).");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new GeminiPassportError(response.status, shortError(await response.text()));

  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  if (result.promptFeedback?.blockReason) throw new GeminiPassportError(422, `Gemini blocked the request (${result.promptFeedback.blockReason}).`);

  const text = (result.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
  if (!text) throw new GeminiPassportError(502, "Gemini returned an empty answer.");

  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced) as Record<string, unknown>;
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    throw new GeminiPassportError(502, "Gemini returned an answer that could not be understood.");
  }
}

async function askGemini(opts: {
  apiKey: string;
  models: string[];
  parts: Parts;
  schema: Record<string, unknown>;
  onProgress?: ((message: string) => void) | undefined;
}): Promise<Record<string, unknown>> {
  const { apiKey, models, parts, schema, onProgress } = opts;
  if (!apiKey) throw new GeminiPassportError(-1, "No Gemini API key is set.");

  const problems: string[] = [];
  for (const model of models) {
    let useSchema = true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      onProgress?.(attempt === 0 ? `Reading passport with Gemini (${model})...` : `Gemini is busy, trying again (${attempt + 1}/3)...`);
      try {
        return await callOnce(model, apiKey, parts, schema, useSchema);
      } catch (error) {
        const err = error instanceof GeminiPassportError ? error : new GeminiPassportError(0, error instanceof Error ? error.message : "Unknown error");
        if (err.status === 401 || err.status === 403) {
          throw new GeminiPassportError(
            err.status,
            `Gemini rejected the API key (${err.status}): ${err.message} - check that the key is valid, not restricted to other websites/IPs, and that the Gemini API is enabled for its project.`,
          );
        }
        if (err.status === 400 && useSchema && /schema|response_?mime/i.test(err.message)) {
          useSchema = false; // some models are picky about the schema; retry once without it
          continue;
        }
        const temporary = err.status === 0 || err.status === 429 || err.status >= 500;
        if (temporary && attempt < 2) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        problems.push(`${model}: ${err.message}`);
        break; // next model
      }
    }
  }
  throw new GeminiPassportError(500, problems.join(" | ") || "Gemini could not read the document.");
}

/** Reads the passport fields from upright page images (base64 JPEG). */
export function askGeminiForPassport(opts: {
  apiKey: string;
  models: string[];
  images: string[];
  onProgress?: ((message: string) => void) | undefined;
}): Promise<Record<string, unknown>> {
  return askGemini({ apiKey: opts.apiKey, models: opts.models, parts: buildParts(PASSPORT_SYSTEM_INSTRUCTION, opts.images), schema: PASSPORT_RESPONSE_SCHEMA, onProgress: opts.onProgress });
}

export const ORIENT_INSTRUCTION = `You are given scanned pages from a person's passport book. Pages can be sideways or upside down.
For EVERY page, in order, report:
- page: the page number as labelled (1, 2, 3...).
- rotateClockwise: how many degrees the page image must be turned CLOCKWISE so that the printed text reads upright, left to right. Use only 0, 90, 180 or 270. If the text is upside down, answer 180. If the top of the text points to the right, answer 270. If the top of the text points to the left, answer 90.
- kind: one of "data_page" (passport photo with surname, given names, dates and two machine-readable lines), "back_page" (address, father/mother/spouse names, file number, old passport details), "visa" (a visa sticker or visa form), or "other".`;

export const ORIENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    pages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          page: { type: "INTEGER" },
          rotateClockwise: { type: "INTEGER" },
          kind: { type: "STRING" },
        },
        required: ["page", "rotateClockwise", "kind"],
      },
    },
  },
  required: ["pages"],
};

/** Asks which way up each page is and what kind of page it is (small images are enough). */
export function askGeminiForOrientation(opts: {
  apiKey: string;
  models: string[];
  images: string[];
  onProgress?: ((message: string) => void) | undefined;
}): Promise<Record<string, unknown>> {
  return askGemini({ apiKey: opts.apiKey, models: opts.models, parts: buildParts(ORIENT_INSTRUCTION, opts.images), schema: ORIENT_SCHEMA, onProgress: opts.onProgress });
}

export const ADDRESS_INSTRUCTION = `You are given ONE scanned page: the back page of an Indian passport. Read ONLY the residential address.
On this page the address is the block of printed lines directly under the label "Address" (Hindi + English), after the father/legal guardian, mother and spouse names, and before the "Old Passport No. with Date and Place of Issue" line. It usually has 2 to 4 lines and ends with a PIN code.
Rules:
- Copy the lines exactly as printed, joined into one line separated by single spaces or commas. Keep the PIN code (e.g. "PIN:396439,GUJARAT,INDIA").
- Do NOT include the father, mother or spouse names, the old passport number, the file number or any label.
- If the page is upside down or sideways, mentally rotate it first.
- If there is no address on the page, return an empty string. Never guess.`;

export const ADDRESS_SCHEMA = {
  type: "OBJECT",
  properties: { address: { type: "STRING" } },
  required: ["address"],
};

/** Reads only the address from the (upright) back page. A tiny, focused request is far more reliable than the full extraction. */
export function askGeminiForAddress(opts: {
  apiKey: string;
  models: string[];
  images: string[];
  onProgress?: ((message: string) => void) | undefined;
}): Promise<Record<string, unknown>> {
  return askGemini({ apiKey: opts.apiKey, models: opts.models, parts: buildParts(ADDRESS_INSTRUCTION, opts.images), schema: ADDRESS_SCHEMA, onProgress: opts.onProgress });
}