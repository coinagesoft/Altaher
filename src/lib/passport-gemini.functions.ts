import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askGeminiForAddress, askGeminiForOrientation, askGeminiForPassport, buildModelList, cleanEnvValue, GeminiPassportError } from "@/lib/passport-gemini-core";

export type PassportServerResult =
  | { ok: true; json: string }
  | { ok: false; error: string; reason: "no_key" | "auth" | "failed" };

// The Gemini call runs on the server so the API key never has to be sent to (or restricted for) the browser.
export const readPassportWithGemini = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        task: z.enum(["orient", "extract", "address"]).default("extract"),
        images: z.array(z.string().min(100).max(8_000_000)).min(1).max(6),
        models: z.array(z.string().min(3).max(60)).max(5).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<PassportServerResult> => {
    const viteEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;
    const apiKey = cleanEnvValue(process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"] || viteEnv["VITE_GEMINI_API_KEY"]);
    const model = process.env["GEMINI_MODEL"] || process.env["VITE_GEMINI_MODEL"] || viteEnv["VITE_GEMINI_MODEL"];
    if (!apiKey) return { ok: false, reason: "no_key", error: "GEMINI_API_KEY is not set on the server (.env)." };

    const models = data.models && data.models.length ? data.models : buildModelList(model);
    try {
      const run = data.task === "orient" ? askGeminiForOrientation : data.task === "address" ? askGeminiForAddress : askGeminiForPassport;
      const parsed = await run({ apiKey, models, images: data.images });
      return { ok: true, json: JSON.stringify(parsed) };
    } catch (error) {
      const err = error instanceof GeminiPassportError ? error : new GeminiPassportError(500, error instanceof Error ? error.message : "Gemini failed.");
      console.error("[passport] Gemini failed:", err.message);
      return { ok: false, reason: err.status === 401 || err.status === 403 ? "auth" : "failed", error: err.message };
    }
  });