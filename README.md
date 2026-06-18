# resume-tailor-mcp

An [MCP](https://modelcontextprotocol.io) server that tailors a resume to a job posting
without making anything up. It exposes three tools any MCP client (Claude Desktop, an IDE, the
MCP Inspector) can call, and it runs two ways: against the Anthropic API with your own key, or
key-less by borrowing the host's model through MCP sampling.

I built it from scratch to learn the protocol end to end — every line is mine, and there's a
walkthrough of the design and the MCP concepts in [`study-materials/`](study-materials/).

## What is MCP, in 15 seconds

MCP (Model Context Protocol) is a standard way to give an LLM access to tools and data. A
**host** (e.g. Claude Desktop) embeds the model; a **server** (this project) exposes capabilities;
they talk over JSON-RPC. The server has no model of its own — it just answers requests.

## What it does

Three tools, plus a `ping` health check:

| Tool | Input | Returns |
|---|---|---|
| `tailor_resume` | resume + job description | fit score, matched/missing keywords, truthful rewrites of your existing bullets, honest gaps, a cover note |
| `score_fit` | resume + job description | a 1–5 fit score with a recommendation, plus a separate ghost-job legitimacy read |
| `extract_keywords` | job description | the ATS keywords a posting wants, split into must-have / nice-to-have |

**It won't invent experience.** The system prompt's hard rule is to rephrase and re-emphasize
what's already on the resume and to flag genuine gaps rather than fabricate them. That's the
whole point of the tool.

## Two backends

The server can produce results two ways, selected by the `TAILOR_MODE` env var:

- **`api` (default)** — calls the Anthropic API with your `ANTHROPIC_API_KEY`, using structured
  outputs so the model is *forced* to return the exact schema.
- **`sampling`** — holds no key. It asks the host to run the completion via MCP sampling
  (`createMessage`) and validates the returned text against the same schema itself. Works only
  with hosts that support sampling (Claude Desktop does).

Same tools either way — the backend is swapped behind a small seam. See
[design notes](#design-notes) for the tradeoff.

## Quick start

```bash
git clone https://github.com/mr-martinsosa/resume-tailor-mcp.git
cd resume-tailor-mcp
npm install
npm test          # builds, then runs the test suite (no API key needed)
npm run build     # compile TypeScript to dist/
```

Tests use injected fakes, so the whole suite runs with no API key, no network, and no cost.

### Try it in the MCP Inspector

```bash
npm run inspect   # opens the Inspector against the live server
```

You'll see the tool list and can call `ping` (or the others, if you provide a key).

## Wire it into Claude Desktop

Add this to your `claude_desktop_config.json` (use an absolute path to `dist/server.js`):

```json
{
  "mcpServers": {
    "resume-tailor": {
      "command": "node",
      "args": ["/absolute/path/to/resume-tailor-mcp/dist/server.js"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

Run `npm run build` first so `dist/server.js` exists. To run **key-less** instead, drop the key
and set the mode — the host's own model does the work:

```json
"env": { "TAILOR_MODE": "sampling" }
```

## Project layout

```
src/
  server.ts            boots the stdio server; picks the backend by TAILOR_MODE
  schema.ts            zod schemas + prompts (one schema per tool, reused everywhere)
  tools/               one file per tool — registers it, calls the injected provider
  llm/
    anthropic.ts       the direct-API backend (structured outputs)
    sampling.ts        the key-less backend (MCP sampling + client-side validation)
test/                  smoke + tool + sampling tests, all run without a key
study-materials/       notes on MCP and the design, written to be defended in an interview
```

## Design notes

- **Structured outputs over "return JSON".** The API path uses `messages.parse` +
  `zodOutputFormat`, so the model is constrained to the schema and the SDK hands back a validated,
  typed object — no parse-and-pray.
- **One schema, many jobs.** Each tool's zod schema is the Anthropic output format, the MCP
  `outputSchema`, the prompt instruction (sampling mode), the client-side validator, and the
  TypeScript type.
- **A provider seam.** Tools don't call the LLM directly — they call an injected function
  (`TailorFn`/`ScoreFn`/`ExtractFn`). That's what lets the tests run with fakes (no key), and it's
  why adding the sampling backend required no changes to any tool.
- **Sampling vs. direct-API.** Direct-API enforces the schema server-side but needs a key;
  sampling is key-less (it borrows the host's model) but gives up server-side enforcement, so the
  server validates the returned text itself. Supporting both is deliberate.

## Requirements

Node 20+. The `api` backend additionally needs an `ANTHROPIC_API_KEY`; the `sampling` backend
needs a host that supports MCP sampling.

## License

MIT — see [LICENSE](LICENSE).
