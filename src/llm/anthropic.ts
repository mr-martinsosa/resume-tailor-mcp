/**
 * The direct-Anthropic-API path (Option B in PLAN.md).
 *
 * Uses the official @anthropic-ai/sdk and structured outputs: the model is
 * *forced* to return an object matching TailoringResultSchema, so there's no
 * brittle "return JSON" + JSON.parse step. The provider is hidden behind the
 * TailorFn type, so tools/tailorResume.ts doesn't know or care how the result
 * is produced — which is what lets us test it without an API key, and what
 * makes adding the MCP-sampling path (Option A) a drop-in later.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  TailoringResultSchema,
  type TailorInput,
  type TailoringResult,
} from "../schema.js";

const MODEL = process.env.TAILOR_MODEL ?? "claude-opus-4-8";

/** A function that turns a (resume, job description) into a tailoring result. */
export type TailorFn = (input: TailorInput) => Promise<TailoringResult>;

export function createAnthropicTailor(): TailorFn {
  // Construct the client lazily so the server can boot (and list its tools)
  // without a key present — the key is only needed when the tool is called.
  let client: Anthropic | null = null;

  return async (input) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set; cannot tailor via the Anthropic API.",
      );
    }
    client ??= new Anthropic();

    const message = await client.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      system: [
        // Cache the stable instructions; only kicks in above the model's
        // minimum cacheable prefix, but it's free to ask for.
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      output_config: { format: zodOutputFormat(TailoringResultSchema) },
    });

    if (message.stop_reason === "refusal") {
      throw new Error("The model declined this request.");
    }
    if (!message.parsed_output) {
      throw new Error("The model did not return a parseable tailoring result.");
    }
    return message.parsed_output;
  };
}
