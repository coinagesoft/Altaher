// Browser-only helper. Turns an uploaded passport copy (image or PDF) into canvases, one per page.
// Requires:  npm i pdfjs-dist

const MAX_PAGES = 6;
const MAX_SIDE = 2400;

async function imageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot open the image.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function pdfToCanvases(file: File): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // Scanned PDFs often store their text as JBIG2 layers. pdfjs decodes those with wasm files, which must be served
// from /pdfjs-wasm/ (copied from node_modules/pdfjs-dist/wasm into public/). Without them the text layer silently
// disappears and fields such as the address, place of birth and the machine-readable lines are never seen.
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), wasmUrl: "/pdfjs-wasm/" }).promise;
  const pages = Math.min(pdf.numPages, MAX_PAGES);
  const canvases: HTMLCanvasElement[] = [];
  for (let n = 1; n <= pages; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(4, MAX_SIDE / Math.max(base.width, base.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    canvases.push(canvas);
  }
  return canvases;
}

export async function passportFileToCanvases(file: File): Promise<HTMLCanvasElement[]> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const canvases = isPdf ? await pdfToCanvases(file) : [await imageToCanvas(file)];
  if (!canvases.length) throw new Error("No pages could be read from this file.");
  return canvases;
}