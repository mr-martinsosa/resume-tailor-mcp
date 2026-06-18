# resume-tailor-mcp

An [MCP](https://modelcontextprotocol.io) server that tailors a resume to a job posting. It
exposes three tools to any MCP client (Claude Desktop, an IDE, the MCP Inspector) and supports
two backends: the Anthropic API with an API key, or key-less operation using MCP sampling to
borrow the host's model.

## What MCP is

MCP (Model Context Protocol) is a standard for giving an LLM access to tools and data. A host
(such as Claude Desktop) embeds the model, a server such as this one exposes capabilities, and
the two communicate over JSON-RPC. The server has no model of its own and only answers requests.

## Tools

A `ping` health check, plus three tools:

| Tool | Input | Returns |
|---|---|---|
| `tailor_resume` | resume + job description | fit score, matched/missing keywords, rewrites of existing bullets, gaps, a cover note |
| `score_fit` | resume + job description | a 1-5 fit score with a recommendation, plus a separate ghost-job legitimacy read |
| `extract_keywords` | job description | the ATS keywords a posting wants, split into must-have and nice-to-have |

The system prompt constrains the model to rephrase and re-emphasize existing resume content and
to flag genuine gaps rather than fabricate experience.

## Backends

The backend is selected with the `TAILOR_MODE` environment variable:

- `api` (default): calls the Anthropic API with an `ANTHROPIC_API_KEY`, using structured outputs
  so the model is constrained to the response schema.
- `sampling`: holds no key. It requests a completion from the host via MCP sampling
  (`createMessage`) and validates the returned text against the same schema. Requires a host that
  supports sampling, such as Claude Desktop.

The tools are identical across both backends. See [Design notes](#design-notes) for the tradeoff.

## Requirements

- Node 20 or newer.
- The `api` backend requires an `ANTHROPIC_API_KEY`.
- The `sampling` backend requires a host that supports MCP sampling.

## Installation

```bash
git clone https://github.com/mr-martinsosa/resume-tailor-mcp.git
cd resume-tailor-mcp
npm install
npm run build     # compile TypeScript to dist/
```

## Usage

Run the test suite (uses injected fakes, so no API key, network, or cost):

```bash
npm test
```

Inspect the live server with the MCP Inspector:

```bash
npm run inspect
```

### Claude Desktop

After `npm run build`, add the following to `claude_desktop_config.json`, using an absolute path:

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

For key-less operation, omit `ANTHROPIC_API_KEY` and set the mode instead:

```json
"env": { "TAILOR_MODE": "sampling" }
```

## Project layout

```
src/
  server.ts            boots the stdio server; selects the backend by TAILOR_MODE
  schema.ts            zod schemas and prompts (one schema per tool)
  tools/               one file per tool: registration and provider call
  llm/
    anthropic.ts       direct-API backend (structured outputs)
    sampling.ts        key-less backend (MCP sampling + client-side validation)
test/                  smoke, tool, and sampling tests, all run without a key
study-materials/       notes on MCP and the design
```

## Design notes

- Structured outputs: the API backend uses `messages.parse` with `zodOutputFormat`, so the model
  is constrained to the schema and the SDK returns a validated, typed object with no manual
  parsing step.
- Single schema per tool: each tool's zod schema serves as the Anthropic output format, the MCP
  `outputSchema`, the prompt instruction in sampling mode, the client-side validator, and the
  TypeScript type.
- Provider seam: tools call an injected function (`TailorFn`, `ScoreFn`, `ExtractFn`) rather than
  the LLM directly. Tests inject fakes (so no key is needed), and the sampling backend was added
  without changing any tool.
- Backend tradeoff: the direct-API backend enforces the schema server-side but requires a key;
  the sampling backend is key-less but gives up server-side enforcement, so it validates the
  returned text itself.

## License

MIT. See [LICENSE](LICENSE).
