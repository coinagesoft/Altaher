// Single source of truth for document upload size limits (used by the browser forms and the server).
const MB = 1024 * 1024;

export const PASSPORT_MAX_BYTES = 1 * MB; // Passport copy: max 1 MB
export const CV_MAX_BYTES = 10 * MB; // CV / resume: max 10 MB
export const OTHER_MAX_BYTES = 3 * MB; // Every other document: max 3 MB

/** Largest limit of all - also what the storage bucket must allow. */
export const BUCKET_MAX_BYTES = CV_MAX_BYTES;

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

/** Size limit (bytes) for a document type name such as "Passport", "CV" or "Medical Certificate". */
export function maxBytesForDocument(documentName: string): number {
  const key = normalise(documentName);
  if (key === "passport" || key === "passportcopy") return PASSPORT_MAX_BYTES;
  if (key === "cv" || key === "resume" || key === "curriculumvitae" || key === "cvresume") return CV_MAX_BYTES;
  return OTHER_MAX_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${Number((bytes / MB).toFixed(2))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Returns an error message when the file is too large, otherwise an empty string. */
export function sizeProblem(documentName: string, file: { name: string; size: number }): string {
  const limit = maxBytesForDocument(documentName);
  if (file.size <= limit) return "";
  return `${documentName} "${file.name}" is ${formatBytes(file.size)} - the maximum allowed size is ${formatBytes(limit)}. Please choose a smaller file.`;
}

/** Throws when the file is too large. */
export function assertFileSize(documentName: string, file: { name: string; size: number }): void {
  const problem = sizeProblem(documentName, file);
  if (problem) throw new Error(problem);
}
