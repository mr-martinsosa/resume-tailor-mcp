/**
 * The MCP **sampling** path (Option A in PLAN.md) — the key-less design.
 *
 * Instead of holding its own ANTHROPIC_API_KEY and calling the API, the server
 * asks the *client's* host to run a completion via MCP sampling
 * (`server.createMessage`). The host already has a model and a key; we borrow
 * it. So this server needs no secret of its own.
 *
 * The tradeoff vs. the direct-API path: sampling is a generic text completion,
 * so there is NO server-side structured-output enforcement. We instruct the
 * model to return JSON (embedding the schema) and then validate the text
 * ourselves with the same zod schema. Key-less, but we own the parsing.
 *
 * It plugs into the exact same *Fn seam the tools already use — the tools can't
 * tell whether they got the API-backed provider or this one.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  TailoringResultSchema,
  SCORE_SYSTEM_PROMPT,
  buildScorePrompt,
  ScoreResultSchema,
  EXTRACT_SYSTEM_PROMPT,
  buildExtractPrompt,
  ExtractResultSchema,
  type TailorInput,
  type ExtractInput,
} from "../schema.js";
import type { TailorFn, ScoreFn, ExtractFn } from "./anthropic.js";

// A thunk for the server, so providers can be created before the server exists
// (the tools register on the server, the server is what calls back to the host).
type GetServer = () => McpServer;

function jsonInstruction(schema: z.ZodType): string {
  return (
    "Respond with ONLY a single JSON object — no prose, no markdown, no code " +
    "fences — that matches this JSON Schema:\n" +
    JSON.stringify(z.toJSONSchema(schema))
  );
}

function parseResult<S extends z.ZodType>(schema: S, text: string): z.infer<S> {
  // Strip accidental code fences, then parse + validate against the schema.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    throw new Error("Sampling response was not valid JSON:\n" + text);
  }
  return schema.parse(obj); // throws a ZodError if the shape is wrong
}

async function sample<S extends z.ZodType>(
  getServer: GetServer,
  schema: S,
  system: string,
  user: string,
): Promise<z.infer<S>> {
  const result = await getServer().server.createMessage({
    systemPrompt: `${system}\n\n${jsonInstruction(schema)}`,
    messages: [{ role: "user", content: { type: "text", text: user } }],
    maxTokens: 4096,
  });
  const text = result.content.type === "text" ? result.content.text : "";
  return parseResult(schema, text);
}

export function makeSamplingProviders(getServer: GetServer): {
  tailor: TailorFn;
  score: ScoreFn;
  extract: ExtractFn;
} {
  return {
    tailor: (input: TailorInput) =>
      sample(getServer, TailoringResultSchema, SYSTEM_PROMPT, buildUserPrompt(input)),
    score: (input: TailorInput) =>
      sample(getServer, ScoreResultSchema, SCORE_SYSTEM_PROMPT, buildScorePrompt(input)),
    extract: (input: ExtractInput) =>
      sample(getServer, ExtractResultSchema, EXTRACT_SYSTEM_PROMPT, buildExtractPrompt(input)),
  };
}
