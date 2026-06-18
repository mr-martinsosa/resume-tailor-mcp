/**
 * Smoke test: spin up the server as a subprocess, connect a client over stdio,
 * and exercise the handshake + the ping tool. No test framework needed — run
 * with `node test/smoke.mjs` after `npm run build`.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/server.js"],
});
const client = new Client({ name: "smoke-test", version: "0.0.0" });

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

await client.connect(transport); // performs the initialize handshake
check("handshake / connect", true);

const { tools } = await client.listTools();
check("tools/list returns ping", tools.some((t) => t.name === "ping"),
  tools.map((t) => t.name).join(", "));

const res = await client.callTool({ name: "ping", arguments: { message: "hi" } });
const text = res.content?.[0]?.text;
check("ping echoes the message", text === "pong: hi", `got "${text}"`);

await client.close();
console.log(failures ? `\n${failures} failure(s)` : "\nall good");
process.exit(failures ? 1 : 0);
