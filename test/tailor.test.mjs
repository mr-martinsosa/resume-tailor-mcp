/**
 * tailor_resume test — exercises the full MCP path with a FAKE tailor injected,
 * so there is no API key, no network, and no cost. It verifies the tool is
 * listed, that input is forwarded, that input-schema validation rejects bad
 * input, and that the result comes back as validated structuredContent.
 *
 * Uses an in-memory transport pair instead of spawning a subprocess, which is
 * what lets us inject the fake directly. Run with `node test/tailor.test.mjs`
 * after `npm run build`.
 */
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { buildServer } from "../dist/server.js";

const FAKE_RESULT = {
  match_score: 82,
  verdict: "Strong fit — apply.",
  matched_keywords: ["react", "typescript", "node"],
  missing_keywords: ["kubernetes"],
  tailored_bullets: [
    { original: "Built a dashboard", tailored: "Built a React/TypeScript dashboard" },
  ],
  honest_gaps: ["No Kubernetes experience"],
  cover_note: "I'm excited about this role because it pairs React and Node.",
};

let seenInput = null;
const fakeTailor = async (input) => {
  seenInput = input;
  return FAKE_RESULT;
};

const server = buildServer(fakeTailor);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "tailor-test", version: "0.0.0" });
await client.connect(clientTransport);

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

const { tools } = await client.listTools();
check("tailor_resume is listed", tools.some((t) => t.name === "tailor_resume"));

const res = await client.callTool({
  name: "tailor_resume",
  arguments: { resume: "Built a dashboard.", job_description: "React + Node role." },
});
check("input forwarded to the tailor fn",
  seenInput?.resume === "Built a dashboard." && seenInput?.job_description === "React + Node role.");
check("structuredContent returned and validated",
  res.structuredContent?.match_score === 82, JSON.stringify(res.structuredContent));
check("text content mirrors the result", String(res.content?.[0]?.text || "").includes("82"));

// Empty resume must be rejected by the input schema (.min(1)), as a throw or isError.
let rejected = false;
try {
  const bad = await client.callTool({
    name: "tailor_resume",
    arguments: { resume: "", job_description: "x" },
  });
  rejected = bad?.isError === true;
} catch {
  rejected = true;
}
check("empty resume rejected by input schema", rejected);

await client.close();
console.log(failures ? `\n${failures} failure(s)` : "\nall good");
process.exit(failures ? 1 : 0);
