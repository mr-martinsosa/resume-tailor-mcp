# resume-tailor-mcp — study notes

Running notes on what this project does and the concepts behind it, written so you can
defend every part in an interview. Updated as we build. Newest milestone at the bottom.

> How to use this: read a section, then close it and try to explain it out loud. The
> **"be ready to answer"** prompts at the end of each section are the questions an
> interviewer actually asks.

---

## What MCP is (the 30-second version)

MCP (Model Context Protocol) is a standard way to give an LLM access to tools and data.
Instead of every app inventing its own plugin format, MCP defines one protocol so any
**host** can talk to any **server** the same way.

Three roles:
- **Host** — the app the user runs (Claude Desktop, an IDE, the MCP Inspector). It embeds the model.
- **Client** — the connector inside the host; one client per server connection.
- **Server** — our process. It exposes capabilities and has *no model of its own*. It just
  answers requests.

The wire format is **JSON-RPC 2.0**: request/response messages like `initialize`,
`tools/list`, `tools/call`. The SDK writes that JSON for you, but knowing it's JSON-RPC
underneath is the kind of detail interviewers poke at.

A server can expose three kinds of capability (we use the first so far):
- **Tools** — functions the model can call (our `ping`, later `tailor_resume`).
- **Resources** — readable data the client can load (like files); think GET, not POST.
- **Prompts** — reusable prompt templates the user can invoke.

**Be ready to answer:**
- What problem does MCP solve? (one protocol instead of N bespoke plugin formats)
- Host vs. client vs. server? (host runs the model; client is the per-connection connector; server is a model-less capability provider)
- Tools vs. resources? (tools *do* things / have side effects; resources are read-only data)

---

## M0 — the scaffold that handshakes

Goal: prove the protocol plumbing works before adding real logic. One `ping` tool, nothing else.

### `src/server.ts` — three moves
1. `new McpServer({ name, version })` — creates the server and its identity. The name/version
   are sent to the client during the handshake.
2. `server.registerTool(name, config, handler)` — declares one tool. The `inputSchema`
   (a zod shape) does double duty: the SDK converts it into the JSON Schema the client sees in
   `tools/list`, **and** it validates incoming arguments before the handler runs. So inside the
   `async ({ message }) => ...` callback, `message` is already validated and typed. The handler
   returns `{ content: [...] }`, which is what lands back in the model's context.
3. `server.connect(new StdioServerTransport())` — picks the **transport** (how bytes move) and
   starts listening.

### The one trap to memorize: stdout is sacred
With the **stdio transport**, the host launches the server as a subprocess and uses its
**stdout as the JSON-RPC channel**. Any `console.log` injects garbage into the protocol stream
and breaks the connection. That's why every log goes to `console.error` (stderr). This is the
#1 gotcha for stdio MCP servers — mention it unprompted and you look like you've actually
shipped one.

### `tsconfig.json` — why imports end in `.js`
`module: Node16` uses ESM resolution, which requires a file extension on relative/subpath
imports, and TypeScript wants the *output* name. So you import `.../server/stdio.js` even though
the source is `.ts`. Not a typo.

### `test/smoke.mjs` — testing without the GUI
Uses the SDK's **client** side to launch the server, run the handshake, call `tools/list`, then
call `ping`. Proves the round trip and serves as a regression test. Note the symmetry: the same
SDK package gives you both `McpServer` and `Client`.

What the test proves:
```
PASS  handshake / connect          ← initialize succeeded
PASS  tools/list returns ping      ← the client can discover our tool
PASS  ping echoes the message      ← tools/call round-trips correctly
```

### Run it yourself
```bash
npm test          # automated smoke test (builds, then runs test/smoke.mjs)
npm run inspect   # opens the MCP Inspector GUI against the live server
```

**Be ready to answer:**
- Walk me through what happens from the host starting your server to a tool result coming back.
  (launch subprocess → `initialize` handshake → client calls `tools/list` → client calls
  `tools/call` with args → SDK validates args against the zod schema → handler runs → returns
  `content` → client hands it to the model)
- Why log to stderr? (stdout is the JSON-RPC channel on the stdio transport)
- What does the zod `inputSchema` give you? (client-visible JSON Schema + server-side validation
  + TypeScript types on the handler args, all from one definition)

---

## Glossary (quick reference)
- **MCP** — Model Context Protocol.
- **Host** — app embedding the model.
- **Client** — per-connection connector inside the host.
- **Server** — model-less provider of tools/resources/prompts (this project).
- **Transport** — how bytes move between client and server (`stdio` = subprocess over
  stdin/stdout; the other common one is streamable HTTP, for remote/hosted servers).
- **Tool** — a callable function the model can invoke.
- **JSON-RPC 2.0** — the request/response message format MCP rides on.
- **zod** — TypeScript-first schema library; we use it to define + validate tool inputs.

---

_Next: M1 — `tailor_resume`, porting the `tailor.py` prompt into a real tool with validated
structured output. This file will grow a new section when we get there._
