// Browser-only. Scanned passport PDFs often contain pages that are sideways or upside down, which the offline
// reader cannot read. This finds the right rotation of every page by trying all four and keeping the one where
// the OCR is most confident.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OcrWorker = any;

export type Rotation = 0 | 90 | 180 | 270;

export function scaleCanvas(src: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
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

/** Rotates clockwise. */
export function rotateCanvas(src: HTMLCanvasElement, degrees: Rotation): HTMLCanvasElement {
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

type Word = { text: string; conf: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wordsOf(data: any): Word[] {
  const out: Word[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const push = (w: any) => {
    if (w && typeof w.text === "string") out.push({ text: w.text, conf: Number(w.confidence ?? w.conf ?? 0) });
  };
  if (Array.isArray(data?.words) && data.words.length) {
    data.words.forEach(push);
  } else if (Array.isArray(data?.blocks)) {
    for (const block of data.blocks) for (const para of block?.paragraphs ?? []) for (const line of para?.lines ?? []) for (const word of line?.words ?? []) push(word);
  }
  if (!out.length && typeof data?.tsv === "string") {
    for (const row of data.tsv.split(/\r?\n/)) {
      const cols = row.split("\t");
      if (cols.length >= 12 && cols[0] === "5") out.push({ text: cols.slice(11).join("\t"), conf: Number(cols[10]) });
    }
  }
  return out;
}

const KEYWORDS = /passport|surname|given\s*name|nationality|birth|issue|expiry|address|spouse|father|mother|guardian|republic|india|file\s*no|place\s+of/gi;

function scoreOcr(data: unknown): number {
  const words = wordsOf(data);
  if (words.length) {
    let score = 0;
    for (const w of words) {
      const t = w.text.trim();
      if (w.conf >= 75 && t.length >= 3 && (t.match(/[A-Za-z]/g) ?? []).length >= 3) score += t.length;
    }
    return score;
  }
  // No word boxes available: fall back to counting passport vocabulary in the raw text.
  const text = String((data as { text?: string } | undefined)?.text ?? "");
  return (text.match(KEYWORDS) ?? []).length * 15;
}

async function scoreCanvas(worker: OcrWorker, canvas: HTMLCanvasElement): Promise<{ score: number; text: string }> {
  const { data } = await worker.recognize(scaleCanvas(canvas, 1200), {}, { text: true, blocks: true, tsv: true });
  return { score: scoreOcr(data), text: String((data as { text?: string } | undefined)?.text ?? "") };
}

export type OrientedPage = { canvas: HTMLCanvasElement; rotation: Rotation; score: number; readable: boolean; text: string };

/**
 * Finds the upright rotation of every page by OCR-scoring it. Unlike asking an AI model, this does not depend on a
 * model "imagining" an upside-down page the right way up. `readable` is false when no rotation gave usable text
 * (blank page, photo only) - callers should not trust the rotation in that case.
 */
export async function orientPagesDetailed(canvases: HTMLCanvasElement[], worker: OcrWorker, onProgress?: (message: string) => void): Promise<OrientedPage[]> {
  await worker.setParameters({ tessedit_pageseg_mode: "11" }); // sparse text: robust for small documents on a big page
  const result: OrientedPage[] = [];
  try {
    for (let i = 0; i < canvases.length; i += 1) {
      const page = canvases[i]!;
      onProgress?.(`Checking the orientation of page ${i + 1} of ${canvases.length}...`);
      const first = await scoreCanvas(worker, page);
      let best: { rotation: Rotation; score: number; text: string } = { rotation: 0, score: first.score, text: first.text };
      // An upright passport page scores high straight away; anything lower might be upside down or sideways.
      if (best.score < 150) {
        for (const rotation of [90, 180, 270] as Rotation[]) {
          const { score, text } = await scoreCanvas(worker, rotateCanvas(page, rotation));
          if (score > best.score) best = { rotation, score, text };
        }
      }
      const readable = best.score >= 25;
      result.push({ canvas: readable ? rotateCanvas(page, best.rotation) : page, rotation: readable ? best.rotation : 0, score: best.score, readable, text: best.text });
    }
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: "3" });
  }
  return result;
}

/** Returns each page turned upright. Pages with no readable text are returned unchanged. */
export async function orientPages(canvases: HTMLCanvasElement[], worker: OcrWorker, onProgress?: (message: string) => void): Promise<HTMLCanvasElement[]> {
  return (await orientPagesDetailed(canvases, worker, onProgress)).map((page) => page.canvas);
}