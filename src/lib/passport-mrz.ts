import { parse } from "mrz";

async function toCanvas(file: File, page = 1): Promise<HTMLCanvasElement | null> {
  const canvas = document.createElement("canvas");
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    if (page > Math.min(pdf.numPages, 3)) return null;
    const pdfPage = await pdf.getPage(page);
    const viewport = pdfPage.getViewport({ scale: 3 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await pdfPage.render({ canvas, viewport }).promise;
    return canvas;
  }
  if (page > 1) return null;
  const bitmap = await createImageBitmap(file);
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  return canvas;
}

function bottomPart(source: HTMLCanvasElement) {
  const height = Math.round(source.height * 0.4);
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = height;
  out.getContext("2d")!.drawImage(source, 0, source.height - height, source.width, height, 0, 0, source.width, height);
  return out;
}

function isoDate(yymmdd: string | null | undefined, kind: "birth" | "expiry") {
  if (!yymmdd || !/^\d{6}$/.test(yymmdd)) return "";
  const yy = Number(yymmdd.slice(0, 2));
  const currentYY = new Date().getFullYear() % 100;
  const year = kind === "birth" ? (yy > currentYY ? 1900 + yy : 2000 + yy) : 2000 + yy;
  return `${year}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

export async function readPassportLocally(file: File) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
    tessedit_pageseg_mode: "6" as never,
  });
  try {
    for (let page = 1; page <= 3; page += 1) {
      const canvas = await toCanvas(file, page);
      if (!canvas) break;
      const { data } = await worker.recognize(bottomPart(canvas));
      const lines = data.text
        .split("\n")
        .map((line) => line.replace(/\s/g, "").toUpperCase())
        .filter((line) => line.length >= 40 && line.includes("<"));
      if (lines.length < 2) continue;
      const mrz = lines.slice(-2).map((line) => line.padEnd(44, "<").slice(0, 44));
      try {
        const { fields } = parse(mrz);
        return {
          surname: fields.lastName ?? "",
          name: fields.firstName ?? "",
          dateOfBirth: isoDate(fields.birthDate, "birth"),
          passportNumber: fields.documentNumber ?? "",
          passportExpiry: isoDate(fields.expirationDate, "expiry"),
        };
      } catch {
        continue;
      }
    }
    throw new Error("The bottom two lines of the passport (the <<< lines) could not be read. Please fill the details by hand.");
  } finally {
    await worker.terminate();
  }
}