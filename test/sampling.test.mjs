/**
 * Sampling-path test — proves the key-less design end to end.
 *
 * A fake "host" client declares the `sampling` capability and answers the
 * server's createMessage request with canned JSON. So we exercise the whole
 * round-trip — tool call -> server asks the host to sample -> host returns text
 * -> server parses + validates against the zod schema -> structuredContent —
 * with no API key, no network, and no cost.
 *
 * Run after `npm run build`.
 */
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CreateMessageRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { buildServer } from "../dist/server.js";
import { makeSamplingProviders } from "../dist/llm/sampling.js";

const FAKE_TAILOR = {
  match_score: 77,
  verdict: "Good fit — apply.",
  matched_keywords: ["react", "node"],
  missing_keywords: ["go"],
  tailored_bullets: [{ original: "Shipped a feature", tailored: "Shipped a React feature" }],
  honest_gaps: ["No Go experience"],
  cover_note: "Keen on this role — it's my exact stack.",
};

// Build the server with the SAMPLING providers (thunk breaks the chicken-egg).
let server;
server = buildServer(makeSamplingProviders(() => server));

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);

// The fake host: declares the sampling capability and answers createMessage.
const client = new Client(
  { name: "sampling-test", version: "0.0.0" },
  { capabilities: { sampling: {} } },
);

let sampledSystemPrompt = null;
client.setRequestHandler(CreateMessageRequestSchema, async (req) => {
  sampledSystemPrompt = req.params.systemPrompt ?? "";
  // The host's "model" returns JSON text matching the requested schema.
  return {
    role: "assistant",
    model: "fake-host-model",
    stopReason: "endTurn",
    content: { type: "text", text: JSON.stringify(FAKE_TAILOR) },
  };
});

await client.connect(clientTransport);

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

const res = await client.callTool({
  name: "tailor_resume",
  arguments: { resume: "Shipped a feature.", job_description: "React/Node role." },
});

check("server asked the host to sample", sampledSystemPrompt !== null);
check("sampling prompt embeds the JSON schema",
  String(sampledSystemPrompt).includes("JSON Schema"));
check("sampled JSON parsed + validated into structuredContent",
  res.structuredContent?.match_score === 77, JSON.stringify(res.structuredContent));

await client.close();
console.log(failures ? `\n${failures} failure(s)` : "\nall good");
process.exit(failures ? 1 : 0);
