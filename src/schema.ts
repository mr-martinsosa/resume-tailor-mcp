/**
 * Schemas and prompt for the tailor_resume tool.
 *
 * One zod schema (TailoringResultSchema) does triple duty:
 *   1. it's the MCP tool's outputSchema (so MCP clients get structured output),
 *   2. it's the Anthropic structured-output format (so the model is forced to
 *      return exactly this shape — no "please return JSON" + hope), and
 *   3. it gives us the TypeScript type for free via z.infer.
 */
import { z } from "zod";

// MCP tool input — a zod *shape* (map of schemas), as registerTool expects.
export const TailorInputSchema = {
  resume: z
    .string()
    .min(1)
    .describe("The candidate's full resume text (Markdown or plain text)."),
  job_description: z
    .string()
    .min(1)
    .describe("The full text of the job posting to tailor toward."),
};

export type TailorInput = { resume: string; job_description: string };

// The structured tailoring result. Ported from the toolkit's tailor.py contract.
export const TailoringResultSchema = z.object({
  match_score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Honest 0-100 fit estimate."),
  verdict: z
    .string()
    .describe("One sentence: is this worth applying to and why."),
  matched_keywords: z
    .array(z.string())
    .describe("Keywords from the posting the resume already supports."),
  missing_keywords: z
    .array(z.string())
    .describe("Keywords the posting wants that the resume does NOT support."),
  tailored_bullets: z
    .array(
      z.object({
        original: z.string().describe("An existing resume bullet."),
        tailored: z
          .string()
          .describe("Rewritten to mirror the posting, still truthful."),
      }),
    )
    .describe("Rewrites of EXISTING bullets only — never fabricated."),
  honest_gaps: z
    .array(z.string())
    .describe("Real gaps the candidate should be ready to address in a screen."),
  cover_note: z
    .string()
    .describe("A 3-4 sentence outreach note referencing the specific role."),
});

export type TailoringResult = z.infer<typeof TailoringResultSchema>;

// The ethical core. Same hard rules as the toolkit's tailor.py — the whole point
// is that this tool re-emphasizes real experience and never invents any.
export const SYSTEM_PROMPT = `You are a precise resume-tailoring assistant. Hard rules:
- NEVER invent jobs, titles, dates, metrics, or skills the candidate does not already have.
- Only rephrase, reorder, and re-emphasize the candidate's EXISTING resume content.
- When the posting wants something the resume genuinely lacks, list it as a gap, do not fabricate it.
- Keep rewritten bullets truthful to the original meaning; mirror the posting's terminology only where it accurately describes existing work.`;

export function buildUserPrompt(input: TailorInput): string {
  return `Here is the candidate's resume:
<resume>
${input.resume}
</resume>

Here is the job description:
<job_description>
${input.job_description}
</job_description>

Tailor the resume to this posting and produce the structured result.`;
}
