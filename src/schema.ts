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

// ---------------------------------------------------------------------------
// M2: score_fit — a 1-5 fit score + a ghost-job legitimacy read.
// Ports the toolkit's scoring_rubric.md. Reuses TailorInputSchema (resume + JD).
// ---------------------------------------------------------------------------

export const ScoreResultSchema = z.object({
  global_score: z
    .number()
    .min(1)
    .max(5)
    .describe("Weighted overall 1-5 fit score."),
  dimensions: z
    .object({
      match_to_resume: z.number().min(1).max(5),
      goal_alignment: z.number().min(1).max(5),
      comp: z.number().min(1).max(5),
      culture_remote: z.number().min(1).max(5),
    })
    .describe("Per-dimension 1-5 scores."),
  archetype: z
    .string()
    .describe("Closest role archetype, e.g. 'Full-stack + AI' or 'LLMOps'."),
  recommendation: z
    .enum(["apply_now", "apply", "maybe", "skip"])
    .describe("Action threshold derived from the score."),
  legitimacy_tier: z
    .enum(["high_confidence", "proceed_with_caution", "suspicious"])
    .describe("Ghost-job legitimacy read — separate from the fit score."),
  rationale: z
    .string()
    .describe("A short paragraph justifying the score and the legitimacy tier."),
});

export type ScoreResult = z.infer<typeof ScoreResultSchema>;

export const SCORE_SYSTEM_PROMPT = `You score how well a candidate fits a job posting, on a 1-5 scale, and separately judge whether the posting looks like a real, active opening.

Fit score (weighted average of four dimensions, each 1-5):
- match_to_resume (35%): skills/experience the JD asks for vs. what the resume can defend.
- goal_alignment (25%): location/remote eligibility, level, and role family.
- comp (20%): 5 = top quartile for the level, 3 = at market, 1 = well below.
- culture_remote (20%): remote policy, stability, growth, team signals.
Map the global score to a recommendation: 4.5+ apply_now, 4.0-4.4 apply, 3.5-3.9 maybe, <3.5 skip.

Legitimacy tier is a SEPARATE judgment (it does not change the fit score): high_confidence, proceed_with_caution, or suspicious. Present signals, never accusations — every concerning signal has innocent explanations. Default to proceed_with_caution when unsure.`;

export function buildScorePrompt(input: TailorInput): string {
  return `Here is the candidate's resume:
<resume>
${input.resume}
</resume>

Here is the job description:
<job_description>
${input.job_description}
</job_description>

Score the fit and judge the posting's legitimacy.`;
}

// ---------------------------------------------------------------------------
// M2: extract_keywords — the ATS keywords a posting wants, grouped.
// Takes only the job description.
// ---------------------------------------------------------------------------

export const ExtractInputSchema = {
  job_description: z
    .string()
    .min(1)
    .describe("The full text of the job posting."),
};

export type ExtractInput = { job_description: string };

export const ExtractResultSchema = z.object({
  must_have: z
    .array(z.string())
    .describe("Required skills/technologies/keywords the posting emphasizes."),
  nice_to_have: z
    .array(z.string())
    .describe("Preferred-but-not-required keywords."),
});

export type ExtractResult = z.infer<typeof ExtractResultSchema>;

export const EXTRACT_SYSTEM_PROMPT = `You extract the keywords an applicant-tracking system would key on from a job posting. Separate genuine requirements from nice-to-haves. Use the posting's own terminology. Do not invent keywords that aren't supported by the text.`;

export function buildExtractPrompt(input: ExtractInput): string {
  return `Here is the job description:
<job_description>
${input.job_description}
</job_description>

Extract the must-have and nice-to-have keywords.`;
}
