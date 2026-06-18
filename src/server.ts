#!/usr/bin/env node
/**
 * resume-tailor-mcp — an MCP server for ethical resume tailoring.
 *
 * M0: the scaffold. Boots a server over stdio and registers a single `ping`
 * tool so we can prove the protocol handshake works before adding real logic.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// The server object holds our identity and the tools/resources we expose.
const server = new McpServer({
  name: "resume-tailor-mcp",
  version: "0.1.0",
});

// A tool is a function the client (Claude, an IDE, the Inspector) can call.
// registerTool(name, config, handler):
//   - inputSchema is a map of zod schemas; the SDK turns it into the JSON
//     Schema the client sees, and validates incoming args against it.
//   - the handler returns a result whose `content` is what the client receives.
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

async function main() {
  // stdio transport: the client launches this process and talks JSON-RPC over
  // stdin/stdout. That means stdout is reserved for the protocol — anything we
  // want to log has to go to stderr, or it corrupts the message stream.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("resume-tailor-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
