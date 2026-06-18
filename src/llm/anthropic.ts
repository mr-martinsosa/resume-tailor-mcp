/**
 * The direct-Anthropic-API path (Option B in PLAN.md).
 *
 * Uses the official @anthropic-ai/sdk and structured outputs: the model is
 * *forced* to return an object matching the given zod schema, so there's no
 * brittle "return JSON" + JSON.parse step. Each tool's provider is hidden
 * behind a typed *Fn (TailorFn / ScoreFn / ExtractFn), so the tools don't know
 * how the result is produced — which is what lets us test them without an API
 * key, and what makes adding the MCP-sampling path (Option A) a drop-in later.
 */
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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
  type TailoringResult,
  type ScoreResult,
  type ExtractInput,
  type ExtractResult,
} from "../schema.js";

const MODEL = process.env.TAILOR_MODEL ?? "claude-opus-4-8";

export type TailorFn = (input: TailorInput) => Promise<TailoringResult>;
export type ScoreFn = (input: TailorInput) => Promise<ScoreResult>;
export type ExtractFn = (input: ExtractInput) => Promise<ExtractResult>;

// One client, built lazily so the server can boot and list tools without a key.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set; cannot call the Anthropic API.");
  }
  return (client ??= new Anthropic());
}

// The shared structured-output call. Every tool is this plus a schema + prompts.
async function runStructured<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
): Promise<z.infer<S>> {
  const message = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: [
      // Cache the stable instructions; only kicks in above the model's
      // minimum cacheable prefix, but it's free to ask for.
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(schema) },
  });
  if (message.stop_reason === "refusal") {
    throw new Error("The model declined this request.");
  }
  if (!message.parsed_output) {
    throw new Error("The model did not return a parseable result.");
  }
  return message.parsed_output as z.infer<S>;
}

export function createAnthropicTailor(): TailorFn {
  return (input) =>
    runStructured(TailoringResultSchema, SYSTEM_PROMPT, buildUserPrompt(input));
}

export function createAnthropicScorer(): ScoreFn {
  return (input) =>
    runStructured(ScoreResultSchema, SCORE_SYSTEM_PROMPT, buildScorePrompt(input));
}

export function createAnthropicExtractor(): ExtractFn {
  return (input) =>
    runStructured(ExtractResultSchema, EXTRACT_SYSTEM_PROMPT, buildExtractPrompt(input));
}
