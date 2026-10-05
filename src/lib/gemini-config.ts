// Configuration for Gemini AI services.
// The key and model come from .env (VITE_GEMINI_API_KEY / VITE_GEMINI_MODEL). No key is hard-coded here any more.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

const clean = (value?: string) => (value ?? "").trim().replace(/^["']|["']$/g, "");

const primaryModel = clean(env["VITE_GEMINI_MODEL"]) || "gemini-3.1-flash-lite";

export const Gemini = {
  ApiKey: clean(env["VITE_GEMINI_API_KEY"]),
  Model: primaryModel,
  // Tried in this order if the previous model is unavailable, overloaded or rate limited.
  Models: Array.from(new Set([primaryModel, "gemini-2.5-flash", "gemini-3.5-flash"])),
};

export const GEMINI_CONFIG = Gemini;