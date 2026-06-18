# resume-tailor-mcp — build plan

An **original, from-scratch MCP server** that exposes ethical resume-tailoring as tools any
MCP client (Claude Desktop, Claude Code, Cursor) can call. This is the strategic GitHub piece:
it converts a non-defensible resume line (a *forked* MCP server) into one you authored end to
end, and it lands squarely on the AI-engineer signal that target roles screen for.

> **Why this, why now:** your strongest AI bullets right now are forks + heavy assist. An MCP
> server you wrote yourself, every line, is the cleanest way to say "I build agent tooling" and
> defend it in an interview. Keep the scope small so it's *finishable* and *fully understood*.

---

## 0. Guardrails (non-negotiable)
- **Author every line.** The point is defensibility. Use Claude to review/explain, not to
  generate code you can't walk through on a whiteboard.
- **Ethical core, same as the toolkit:** the server NEVER fabricates experience. It rephrases,
  re-emphasizes, and flags gaps. This is a genuine differentiator and a great interview story.
- **Be able to explain, live:** what MCP is, why a server vs. a plain script, stdio vs. HTTP
  transport, and the sampling-vs-direct-API decision below. If you can't yet, that's the first
  thing to learn — it's a 30-minute read.

---

## 1. Stack decision

| Choice | Pick | Why |
|---|---|---|
| Language | **TypeScript** | Doubles as a portfolio signal for your target stack (React/TS/Node). Official MCP SDK is TS-first. |
| SDK | **`@modelcontextprotocol/sdk`** (official) | Don't hand-roll the protocol. Verify the current package name + API in its README at build time. |
| Transport | **stdio** | Standard for local servers a desktop client launches. (Add a streamable-HTTP transport later only if you want a hosted demo.) |
| Runtime | Node 20+ | — |
| Validation | **zod** | The SDK uses zod for tool input schemas; gives you typed, validated args for free. |

> The Python MCP SDK is also fine and would reuse your existing `tailor.py` logic directly.
> Recommendation: **TypeScript**, because the portfolio value of a public TS/Node repo is higher
> for your roles. Port the prompt + JSON contract from `tailor.py`; the logic is identical.

---

## 2. The key architectural decision — where does the LLM call happen?

This is the most interview-worthy design choice in the whole project. Two options:

### Option A — MCP **sampling** (recommended primary)
The server asks the *client's* model to do the completion via the sampling capability
(`createMessage`). **The server needs no API key of its own** — it borrows the model the user
already runs. This is the more "MCP-native" design and a strong talking point ("my server is
key-less; it requests sampling from the host").
- Pros: no secret management, works for any client/model, cheap to demo.
- Cons: requires a client that supports sampling; you don't control the exact model.

### Option B — Direct Anthropic API (recommended fallback)
The server calls the Anthropic API itself with its own `ANTHROPIC_API_KEY` (model
`claude-opus-4-8`, or `claude-sonnet-4-6` for cheaper runs — verify current IDs against the
`claude-api` reference). This is exactly what `tailor.py` already does.
- Pros: deterministic model choice, prompt caching, works regardless of client capabilities.
- Cons: needs a key; you manage the secret.

**Build plan:** ship Option B first (you already have the working code in `tailor.py`), then add
Option A as a `--sampling` mode. Being able to explain *both* and why you'd choose each is the
win.

---

## 3. Tools to expose (the MCP surface)

Keep it to 3–4 sharp tools. Each gets a zod input schema and returns structured JSON.

1. **`tailor_resume`** — *(resume: string, job_description: string)* → the full tailoring object
   from `tailor.py`: `match_score`, `verdict`, `matched_keywords`, `missing_keywords`,
   `tailored_bullets[]`, `honest_gaps[]`, `cover_note`. The flagship tool.
2. **`score_fit`** — *(resume, job_description)* → a 1–5 fit score + ghost-job legitimacy tier,
   porting `playbooks/scoring_rubric.md` from the toolkit. Cheap, no rewrite — good for triage.
3. **`extract_keywords`** — *(job_description)* → the ATS keywords a posting wants, grouped
   (must-have / nice-to-have). Useful standalone and as a building block.
4. **`diff_bullets`** *(optional)* — *(original: string[], tailored: string[])* → a readable
   before/after so a human can audit that nothing was fabricated. This is your integrity story
   made tangible.

### Resources (optional, nice second milestone)
Expose saved resume variants as MCP **resources** (`resume://default`, `resume://frontend`),
so a client can read "the resume" without the user pasting it each time. Demonstrates you know
MCP is tools **and** resources.

---

## 4. Milestones (each is a commit / a demo)

- **M0 — scaffold (½ day).** `npm init`, add the SDK + zod + tsx, a `src/server.ts` that boots
  a stdio server and registers one trivial `ping` tool. Confirm it connects from Claude Desktop
  (or `npx @modelcontextprotocol/inspector`). *Goal: a server that handshakes.*
- **M1 — `tailor_resume` via direct API (1 day).** Port the `tailor.py` system prompt + JSON
  contract. Return validated structured output. *Goal: real tailoring through MCP.*
- **M2 — `score_fit` + `extract_keywords` (½ day).** Round out the surface; reuse the scoring
  rubric.
- **M3 — sampling mode (1 day).** Add the key-less `createMessage` path. *Goal: the
  architecture talking point.*
- **M4 — polish for GitHub (½ day).** README with an asciinema/GIF of the MCP Inspector calling
  `tailor_resume`, a `claude_desktop_config.json` snippet, tests for the JSON-contract parser,
  MIT license, CI that runs `tsc --noEmit` + tests.

Roughly **3–4 focused days**. Stop at M2 if time-boxed — it's already a complete, demoable,
defensible server.

---

## 5. Repo shape (target)
```
resume-tailor-mcp/
  src/
    server.ts          # boot stdio server, register tools
    tools/
      tailorResume.ts
      scoreFit.ts
      extractKeywords.ts
    llm/
      anthropic.ts     # direct-API path (Option B)
      sampling.ts      # MCP sampling path (Option A)
    schema.ts          # zod input schemas + output types
  test/
    contract.test.ts   # the model-output parser never accepts fabricated shapes
  README.md            # what MCP is, how to wire it into a client, a demo GIF
  package.json
  tsconfig.json
  LICENSE
```

---

## 6. README must-haves (this is what recruiters actually read)
- One-paragraph "what is MCP" so a non-MCP reader gets it in 15 seconds.
- A copy-paste `claude_desktop_config.json` block to run your server.
- A **demo GIF** of the MCP Inspector (or Claude) calling `tailor_resume` on the sample resume.
- An explicit **"it will not fabricate experience"** section — your ethical-core differentiator.
- A short "design notes" section on the sampling-vs-direct-API decision (signals depth).

---

## 7. Interview prep this project unlocks (the real payoff)
Be ready to whiteboard:
- What MCP is and the client/server/host split; tools vs. resources vs. prompts vs. sampling.
- Why stdio transport for a local server; when you'd switch to streamable HTTP.
- The sampling-vs-direct-API tradeoff and why you supported both.
- How the JSON contract + zod validation prevents the model from returning a fabricated shape.
- Honest limitations (no fine-tuning, relies on the host model, single-user).

---

## 8. First action when you start
1. `npm create` the project, install `@modelcontextprotocol/sdk` + `zod`, and read the SDK
   README to confirm the current server/tool registration API (it evolves — verify, don't
   assume this doc).
2. Get M0 (the `ping` server) connecting from the MCP Inspector before writing any real logic.
3. Port the `tailor.py` prompt for M1.

> Reuse from `../job-search-toolkit`: the system prompt + JSON contract live in
> `tools/tailor.py`, and the scoring rubric in `playbooks/scoring_rubric.md`. Same logic, new
> transport.
