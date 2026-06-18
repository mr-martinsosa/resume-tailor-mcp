/**
 * The extract_keywords MCP tool — the ATS keywords a posting wants, grouped
 * into must-have and nice-to-have. Takes only the job description.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ExtractInputSchema, ExtractResultSchema } from "../schema.js";
import type { ExtractFn } from "../llm/anthropic.js";

export function registerExtractKeywords(server: McpServer, extract: ExtractFn): void {
  server.registerTool(
    "extract_keywords",
    {
      title: "Extract keywords",
      description:
        "Extract the keywords an applicant-tracking system would key on from a " +
        "job posting, grouped into must-have and nice-to-have.",
      inputSchema: ExtractInputSchema,
      outputSchema: ExtractResultSchema.shape,
    },
    async ({ job_description }) => {
      const result = await extract({ job_description });
      return {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
