#!/usr/bin/env node
/**
 * resume-tailor-mcp — an MCP server for ethical resume tailoring.
 *
 * buildServer() assembles the server and its tools, taking the provider
 * functions as a parameter so tests can inject fakes (no API key, no network).
 * main() wires in the real Anthropic-backed implementations and runs over
 * stdio. The import.meta guard means importing this file (as the tests do) does
 * NOT start a server.
 */
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerTailorResume } from "./tools/tailorResume.js";
import { registerScoreFit } from "./tools/scoreFit.js";
import { registerExtractKeywords } from "./tools/extractKeywords.js";
import {
  createAnthropicTailor,
  createAnthropicScorer,
  createAnthropicExtractor,
  type TailorFn,
  type ScoreFn,
  type ExtractFn,
} from "./llm/anthropic.js";
import { makeSamplingProviders } from "./llm/sampling.js";

/** The provider functions the tools depend on. Real ones in prod, fakes in tests. */
export interface Providers {
  tailor: TailorFn;
  score: ScoreFn;
  extract: ExtractFn;
}

export function buildServer(providers: Providers): McpServer {
  const server = new McpServer({ name: "resume-tailor-mcp", version: "0.1.0" });

  // Health check — proves the handshake without needing the LLM.
  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Health check. Returns 'pong', echoing an optional message.",
      inputSchema: {
        message: z.string().optional().describe("Optional text to echo back"),
      },
    },
    async ({ message }) => ({
      content: [{ type: "text", text: message ? `pong: ${message}` : "pong" }],
    }),
  );

  registerTailorResume(server, providers.tailor);
  registerScoreFit(server, providers.score);
  registerExtractKeywords(server, providers.extract);
  return server;
}

async function main() {
  // TAILOR_MODE=sampling → key-less, borrow the host's model (Option A).
  // default ("api")     → call the Anthropic API directly with our own key (Option B).
  const useSampling = process.env.TAILOR_MODE === "sampling";

  let server: McpServer;
  if (useSampling) {
    // The sampling providers need the server (to call back to the host), and
    // the server needs the providers (to register tools). The thunk defers
    // reading `server` until a tool actually runs, breaking the cycle.
    server = buildServer(makeSamplingProviders(() => server));
  } else {
    server = buildServer({
      tailor: createAnthropicTailor(),
      score: createAnthropicScorer(),
      extract: createAnthropicExtractor(),
    });
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the JSON-RPC channel — logs must go to stderr.
  console.error(`resume-tailor-mcp running on stdio (mode: ${useSampling ? "sampling" : "api"})`);
}

// Only run the stdio server when executed directly, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("Fatal error starting server:", err);
    process.exit(1);
  });
}
