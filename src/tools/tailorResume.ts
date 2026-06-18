/**
 * The tailor_resume MCP tool.
 *
 * It takes a resume + a job description, calls the injected TailorFn, and
 * returns the result both as structured output (for MCP clients that read
 * structuredContent) and as pretty-printed text (for everything else).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TailorInputSchema, TailoringResultSchema } from "../schema.js";
import type { TailorFn } from "../llm/anthropic.js";

export function registerTailorResume(server: McpServer, tailor: TailorFn): void {
  server.registerTool(
    "tailor_resume",
    {
      title: "Tailor resume",
      description:
        "Tailor a resume to a specific job description without fabricating experience. " +
        "Returns a fit score, matched/missing keywords, truthful rewrites of existing " +
        "bullets, honest gaps, and a short cover note.",
      inputSchema: TailorInputSchema,
      // Declaring an outputSchema lets us return validated structuredContent.
      outputSchema: TailoringResultSchema.shape,
    },
    async ({ resume, job_description }) => {
      const result = await tailor({ resume, job_description });
      return {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
