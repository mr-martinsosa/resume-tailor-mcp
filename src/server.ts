#!/usr/bin/env node
/**
 * resume-tailor-mcp — an MCP server for ethical resume tailoring.
 *
 * buildServer() assembles the server and its tools, taking the TailorFn as a
 * parameter so tests can inject a fake (no API key, no network). main() wires
 * in the real Anthropic-backed tailor and runs over stdio. The import.meta
 * guard means importing this file (as the test does) does NOT start a server.
 */
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerTailorResume } from "./tools/tailorResume.js";
import { createAnthropicTailor, type TailorFn } from "./llm/anthropic.js";

export function buildServer(tailor: TailorFn): McpServer {
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

  registerTailorResume(server, tailor);
  return server;
}

async function main() {
  const server = buildServer(createAnthropicTailor());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the JSON-RPC channel — logs must go to stderr.
  console.error("resume-tailor-mcp running on stdio");
}

// Only run the stdio server when executed directly, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("Fatal error starting server:", err);
    process.exit(1);
  });
}
