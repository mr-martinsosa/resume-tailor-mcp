# resume-tailor-mcp

An [MCP](https://modelcontextprotocol.io) server that tailors a resume to a job posting without
making anything up. It gives any MCP client (Claude Desktop, an IDE, the MCP Inspector) three
tools, and it can run two ways: against the Anthropic API with your own key, or with no key at
all by borrowing the host's model through MCP sampling.

I wrote it from scratch to learn the protocol properly. Every line is mine, and there's a
walkthrough of the design and the MCP concepts in [`study-materials/`](study-materials/) if you
want the reasoning behind it.

## What MCP is

MCP (Model Context Protocol) is a standard way to give an LLM access to tools and data. A host
(like Claude Desktop) embeds the model, a server (this project) exposes capabilities, and the two
talk over JSON-RPC. The server has no model of its own; it just answers requests.

## What it does

Three tools, plus a `ping` health check:

| Tool | Input | Returns |
|---|---|---|
| `tailor_resume` | resume + job description | fit score, matched/missing keywords, truthful rewrites of your existing bullets, honest gaps, a cover note |
| `score_fit` | resume + job description | a 1–5 fit score with a recommendation, plus a separate ghost-job legitimacy read |
| `extract_keywords` | job description | the ATS keywords a posting wants, split into must-have and nice-to-have |

The system prompt's hard rule is that it rephrases and re-emphasizes what's already on the resume
and flags real gaps instead of inventing experience to fill them. That constraint is the point of
the tool, not a disclaimer on it.

## Two backends

You pick the backend with the `TAILOR_MODE` env var:

- `api` (default) calls the Anthropic API with your `ANTHROPIC_API_KEY`. It uses structured
  outputs, so the model is constrained to return the exact schema.
- `sampling` holds no key. It asks the host to run the completion via MCP sampling
  (`createMessage`), then validates the returned text against the same schema itself. This only
  works with hosts that support sampling (Claude Desktop does).

The tools are identical either way; the backend is swapped behind a small seam. The tradeoff
between the two is in [Design notes](#design-notes) below.

## Quick start

```bash
git clone https://github.com/mr-martinsosa/resume-tailor-mcp.git
cd resume-tailor-mcp
npm install
npm test          # builds, then runs the test suite (no API key needed)
npm run build     # compile TypeScript to dist/
```

The tests use injected fakes, so the whole suite runs with no API key, no network, and no cost.

### Try it in the MCP Inspector

```bash
npm run inspect   # opens the Inspector against the live server
```

You'll see the tool list and can call `ping` (or the others, once you provide a key).

## Wire it into Claude Desktop

Run `npm run build` first so `dist/server.js` exists, then add this to your
`claude_desktop_config.json` using an absolute path:

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

To run it without a key, drop the `ANTHROPIC_API_KEY` and set the mode instead. The host's own
model does the work:

```json
"env": { "TAILOR_MODE": "sampling" }
```

## Project layout

```
src/
  server.ts            boots the stdio server; picks the backend by TAILOR_MODE
  schema.ts            zod schemas + prompts (one schema per tool, reused everywhere)
  tools/               one file per tool: registers it, calls the injected provider
  llm/
    anthropic.ts       the direct-API backend (structured outputs)
    sampling.ts        the key-less backend (MCP sampling + client-side validation)
test/                  smoke + tool + sampling tests, all run without a key
study-materials/       notes on MCP and the design
```

## Design notes

A few decisions worth calling out:

Structured outputs instead of "return JSON". The API backend uses `messages.parse` with
`zodOutputFormat`, so the model is constrained to the schema and the SDK hands back a validated,
typed object. There's no string-parsing step that might fail on malformed output.

One schema per tool, reused everywhere. Each tool's zod schema is the Anthropic output format,
the MCP `outputSchema`, the prompt instruction in sampling mode, the client-side validator, and
the TypeScript type. Define it once, use it five ways.

A provider seam. The tools don't call the LLM directly. They call an injected function
(`TailorFn` / `ScoreFn` / `ExtractFn`). That's what lets the tests run with fakes and no key, and
it's why adding the sampling backend didn't require touching any tool.

Sampling vs. direct-API. The direct path enforces the schema on the server side but needs a key.
Sampling needs no key because it borrows the host's model, but it gives up that server-side
enforcement, so the server validates the returned text itself. Both are supported on purpose.

## Requirements

Node 20+. The `api` backend also needs an `ANTHROPIC_API_KEY`. The `sampling` backend needs a
host that supports MCP sampling.

## License

MIT, see [LICENSE](LICENSE).
