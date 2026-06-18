/**
 * The score_fit MCP tool — a 1-5 fit score plus a ghost-job legitimacy read.
 * Cheaper than tailor_resume (no rewrite), good for triaging a pile of leads.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TailorInputSchema, ScoreResultSchema } from "../schema.js";
import type { ScoreFn } from "../llm/anthropic.js";

export function registerScoreFit(server: McpServer, score: ScoreFn): void {
  server.registerTool(
    "score_fit",
    {
      title: "Score fit",
      description:
        "Score how well a resume fits a job posting on a 1-5 scale (with a " +
        "recommendation), and separately judge whether the posting looks like a " +
        "real, active opening. Use it to triage which roles deserve a full tailor.",
      inputSchema: TailorInputSchema,
      outputSchema: ScoreResultSchema.shape,
    },
    async ({ resume, job_description }) => {
      const result = await score({ resume, job_description });
      return {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
