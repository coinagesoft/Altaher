import { passportFileToCanvases } from "@/lib/passport-pdf";
import { extractPassportFromOcr, type PassportDetails } from "@/lib/passport-text";

export async function readPassportFile(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<PassportDetails> {
  onProgress?.("Loading passport document pages...");
  const canvases = await passportFileToCanvases(file);

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  try {
    const pageTexts: string[] = [];

    for (let i = 0; i < canvases.length; i += 1) {
      onProgress?.(`Scanning page ${i + 1} of ${canvases.length}...`);
      const canvas = canvases[i]!;
      const { data } = await worker.recognize(canvas);
      pageTexts.push(data.text);
    }

    onProgress?.("Extracting passport fields...");
    const details = extractPassportFromOcr(pageTexts);

    if (!details.passportNumber && !details.surname && !details.name) {
      throw new Error(
        "Could not read passport details. If the document photo is blurry or unclear, please upload a clear, high-resolution PDF or photo of the passport copy, or fill in the details by hand."
      );
    }

    return details;
  } finally {
    await worker.terminate();
  }
}
