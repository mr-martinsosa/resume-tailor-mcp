/**
 * Tool tests — exercise the full MCP path for all three tools with FAKE
 * providers injected, so there is no API key, no network, and no cost. Verifies
 * the tools are listed, input is forwarded, input-schema validation rejects bad
 * input, and results come back as validated structuredContent.
 *
 * Uses an in-memory transport pair instead of spawning a subprocess, which is
 * what lets us inject the fakes directly. Run after `npm run build`.
 */
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { buildServer } from "../dist/server.js";

const FAKE_TAILOR = {
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
const FAKE_SCORE = {
  global_score: 4.2,
  dimensions: { match_to_resume: 4, goal_alignment: 5, comp: 4, culture_remote: 4 },
  archetype: "Full-stack + AI",
  recommendation: "apply",
  legitimacy_tier: "high_confidence",
  rationale: "Clean fit on stack and level; posting looks active.",
};
const FAKE_EXTRACT = {
  must_have: ["react", "node", "typescript"],
  nice_to_have: ["react native", "rag"],
};

const seen = {};
const providers = {
  tailor: async (i) => ((seen.tailor = i), FAKE_TAILOR),
  score: async (i) => ((seen.score = i), FAKE_SCORE),
  extract: async (i) => ((seen.extract = i), FAKE_EXTRACT),
};

const server = buildServer(providers);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "tools-test", version: "0.0.0" });
await client.connect(clientTransport);

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
for (const n of ["tailor_resume", "score_fit", "extract_keywords"]) {
  check(`${n} is listed`, names.includes(n), names.join(", "));
}

// tailor_resume
const t = await client.callTool({
  name: "tailor_resume",
  arguments: { resume: "Built a dashboard.", job_description: "React + Node role." },
});
check("tailor: input forwarded", seen.tailor?.resume === "Built a dashboard.");
check("tailor: structuredContent validated", t.structuredContent?.match_score === 82,
  JSON.stringify(t.structuredContent));

// score_fit
const s = await client.callTool({
  name: "score_fit",
  arguments: { resume: "R", job_description: "JD" },
});
check("score: structuredContent validated",
  s.structuredContent?.global_score === 4.2 && s.structuredContent?.recommendation === "apply",
  JSON.stringify(s.structuredContent));

// extract_keywords (job description only)
const e = await client.callTool({
  name: "extract_keywords",
  arguments: { job_description: "We want React, Node, TypeScript." },
});
check("extract: input forwarded", seen.extract?.job_description?.includes("React"));
check("extract: structuredContent validated",
  Array.isArray(e.structuredContent?.must_have) && e.structuredContent.must_have.includes("react"),
  JSON.stringify(e.structuredContent));

// Input-schema validation: empty resume must be rejected (throw or isError).
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
