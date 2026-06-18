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

## M1 — `tailor_resume` (the real tool)

Goal: a tool that takes a resume + a job description and returns a structured tailoring result
(fit score, matched/missing keywords, truthful bullet rewrites, honest gaps, cover note),
backed by the Anthropic API. Ported from the toolkit's `tailor.py`, with two upgrades.

### Upgrade 1 — the official SDK, not raw HTTP
`tailor.py` calls the API with raw `urllib` because it was constrained to Python's standard
library. This project already has dependencies, so the right choice is the official
**`@anthropic-ai/sdk`**. It's idiomatic, less error-prone, and a portfolio signal (you know the
real SDK). Rule of thumb: in a TypeScript/Python project, use the official SDK; only hand-roll
HTTP when the project genuinely forbids dependencies.

### Upgrade 2 — structured outputs, not "return JSON" + parse
`tailor.py` asks the model to "return JSON matching this schema" and then `JSON.parse`s it,
hoping the model complied. We instead use **structured outputs**: `client.messages.parse()` with
`output_config: { format: zodOutputFormat(TailoringResultSchema) }`. The API *enforces* the
schema and the SDK hands back a typed, validated `parsed_output`. No parsing, no "what if it
returns prose around the JSON" failure mode.

The same zod schema (`TailoringResultSchema`) is reused three ways — this is the elegant part:
1. as the **Anthropic structured-output format** (forces the model's shape),
2. as the **MCP tool `outputSchema`** (so MCP clients get validated `structuredContent`), and
3. as the **TypeScript type** via `z.infer`.

### The dependency seam (why this is testable without a key) — dependency injection

This is **dependency injection**, and it's worth understanding deeply because it's the answer
to "how did you test an LLM-calling tool without spending money?"

Think about what the tool *needs*: "something that turns a resume + JD into a result." The naive
design has the tool reach out to Anthropic itself. Instead, the tool **receives that capability
as a parameter** — a function, the `TailorFn` (`(input) => Promise<TailoringResult>`).

```
buildServer(providers)   ←  tools call whatever functions they're handed
   │
   ├── production:  main() hands them the real createAnthropic*()  → calls the API ($)
   └── test:        the test hands them fakes  → return canned data instantly (free)
```

The tool just does `await tailor(input)` and wraps the result. **It cannot tell whether it got
the real API or a fake.** So the test hands it a fake returning hardcoded data, and still
exercises *all the tool's real logic* — MCP registration, input validation, wrapping into
`structuredContent` + text — while the one piece that would cost money (the API call) is swapped
out.

Analogy: to test a coffee machine's buttons and water flow, plug in a fake grinder that spits
out pre-ground coffee. You test everything except the grinding. The seam is the socket the
grinder plugs into.

That single choice is why `test/tools.test.mjs` runs with **no key, no network, and $0** — and
it's exactly where M3's MCP-sampling path will plug in: just another implementation of the same
`*Fn` type. The fake also makes the test deterministic (the real model would vary run to run).

### Files
- `src/schema.ts` — the zod schemas (input + result), the system prompt, the user-prompt builder.
- `src/llm/anthropic.ts` — `createAnthropicTailor()` returns a `TailorFn` using `messages.parse`.
  The client is built lazily, so the server still boots and lists tools without a key.
- `src/tools/tailorResume.ts` — registers the tool; returns `structuredContent` + a text mirror.
- `src/server.ts` — now `buildServer(tailor)` (testable) + a guarded `main()` that only runs the
  stdio server when the file is executed directly (so importing it in a test doesn't start it).

### Two things that bit us (worth understanding)
- **zod v3 vs v4.** The SDK's `zodOutputFormat` helper is typed for **zod v4**. With zod v3 the
  build threw `TS2345` and `parsed_output` inferred as `{}`. Fix: move the project to zod v4 (the
  MCP SDK accepts `^3.25 || ^4.0`, and our zod usage is identical across both). Lesson: when two
  libraries share a schema library, their major versions have to line up.
- **`max_tokens` / refusal handling.** We set `max_tokens: 4096` (the result is small) and check
  `stop_reason === "refusal"` and a null `parsed_output` before trusting the output. On Opus 4.8
  a refusal is a successful HTTP 200 with empty content — reading it blindly would crash.

### Cost note (important)
Building, `tsc`, and the tests cost **nothing** — the tests use the injected fake. The tool only
calls the API (and bills) when actually invoked with a real `ANTHROPIC_API_KEY`, which is a
deliberate, user-initiated action. The cheaper-still design is M3 (sampling), where the server
borrows the host's model and holds no key of its own.

**Be ready to answer:**
- Why structured outputs over "return JSON"? (API enforces the schema; no parse-and-pray)
- Why the official SDK over `fetch`? (idiomatic, typed, handles retries/errors; raw HTTP only when deps are forbidden)
- How did you test an API-calling tool for free? (the `TailorFn` seam + an injected fake over an in-memory transport)
- What does `messages.parse` return and what do you check? (`parsed_output`, plus `stop_reason` for refusals)

---

---

## M2 — `score_fit` + `extract_keywords` (two more tools)

Goal: round out the tool surface. `score_fit` gives a 1-5 fit score + a ghost-job legitimacy
read (ported from the toolkit's `scoring_rubric.md`); `extract_keywords` pulls the ATS keywords a
posting wants, grouped into must-have / nice-to-have. Both follow the exact pattern M1
established — which is the point: once the shape is right, new tools are cheap.

### The DRY refactor (a small but real design improvement)
M1's `createAnthropicTailor` had the whole `messages.parse` call inline. Adding two more tools
that do the same thing — system prompt + user prompt + structured output — would mean copying
that boilerplate three times. So `anthropic.ts` now has one private helper:

```
runStructured(schema, system, user)  →  Promise<z.infer<schema>>
```

Each tool's provider is then a one-liner: `runStructured(<its schema>, <its system prompt>,
<its user prompt>)`. The generic `<S extends z.ZodType>` means the return type is inferred from
whichever schema you pass — `runStructured(ScoreResultSchema, ...)` returns a `ScoreResult`,
`runStructured(ExtractResultSchema, ...)` returns an `ExtractResult`, all type-checked. One place
to change if the API call ever needs to change (retries, caching, a different model).

### `buildServer` now takes a `Providers` object
M1 passed a single `tailor` function. With three tools, `buildServer({ tailor, score, extract })`
takes a small object instead of three positional args — clearer at the call site and easy to
extend. `main()` fills it with the real `createAnthropic*()` implementations; the test fills it
with three fakes. Same seam, three sockets.

### Anatomy of a tool (now a repeatable recipe)
Each tool is four small pieces, and adding one is mechanical:
1. **Schema(s)** in `schema.ts` — a zod input shape (if different) and a zod result object.
2. **Prompt(s)** in `schema.ts` — a system prompt (the rules) and a user-prompt builder.
3. **A provider** in `anthropic.ts` — one line over `runStructured`, returning a typed `*Fn`.
4. **A registration** in `tools/<name>.ts` — `registerTool(name, {description, inputSchema,
   outputSchema}, handler)` where the handler calls the injected `*Fn` and returns
   `structuredContent` + a text mirror.

That repeatability is itself a design signal: the abstraction is at the right altitude when the
Nth instance is boring to add.

### Tests
`test/tools.test.mjs` (renamed from `tailor.test.mjs`) now drives all three tools over the
in-memory transport with three fakes — still no key, no network, no cost. 14 checks: each tool is
listed, input is forwarded, structured output validates, and bad input is rejected.

**Be ready to answer:**
- Why factor out `runStructured`? (DRY — one place owns the API-call mechanics; tools differ only by schema + prompts)
- How does the generic keep types? (`<S extends z.ZodType>` infers the result type from the schema you pass)
- Why a `Providers` object instead of positional args? (clearer, order-independent, easy to extend as tools grow)

---

---

## M3 — the sampling path (the key-less design)

This is the most distinctive part of the project, and the best interview talking point.

### The idea
So far the server holds its own `ANTHROPIC_API_KEY` and calls the API directly (Option B). With
MCP **sampling**, the server instead asks the *client's host* to run the completion — the host
already has a model and a key, so we borrow it. `server.createMessage(...)` sends a
`sampling/createMessage` request **back up to the client**, the host runs it, and the text comes
back. **The server needs no secret of its own.** That's a genuinely MCP-native design.

Note the direction flip: normally the client calls the server's tools. Sampling is the server
calling *back* to the client. That's why the host has to **declare the `sampling` capability**
during the handshake — a server can only sample if the host opted in. (Not every host supports it
— Claude Desktop does; some IDEs don't. That's the documented limitation, and the reason we kept
the direct-API path too.)

### The tradeoff (this is the whole interview answer)
The direct-API path (M1/M2) used structured outputs, so the API *enforced* our schema. Sampling
is a generic text completion — **no schema enforcement.** So the sampling path:
1. embeds the schema in the prompt (`z.toJSONSchema(schema)` → "return JSON matching this"), and
2. validates the returned text itself with the same zod schema (`schema.parse(...)`).

So: **direct-API = schema enforced server-side but needs a key; sampling = key-less but we own
the parsing/validation.** Being able to explain *both* and why you'd pick each is the win. The
same zod schema now serves four roles — Anthropic output format, MCP outputSchema, the prompt
instruction, and client-side validation.

### How it plugs in (the seam pays off)
Because the tools depend on the `*Fn` seam, M3 added **zero changes to any tool**. `sampling.ts`
just provides another implementation of `TailorFn` / `ScoreFn` / `ExtractFn`. `TAILOR_MODE=sampling`
switches `main()` to wire those instead of the Anthropic ones. This is the payoff of the
dependency-injection design from M1 — a whole alternate backend with no tool edits.

### One wiring wrinkle: the chicken-and-egg
The sampling providers need the server (to call `server.createMessage`), but the server needs the
providers (to register the tools). Resolved with a **thunk**: `makeSamplingProviders(() => server)`
takes a function that returns the server, and only calls it when a tool actually runs — by which
point the server exists. `let server; server = buildServer(makeSamplingProviders(() => server));`

### Testing it without a key (or a real host)
`test/sampling.test.mjs` stands up a fake host: a `Client` that **declares the sampling
capability** and registers a `CreateMessageRequestSchema` handler returning canned JSON. So the
full round-trip runs — tool call → server samples → fake host returns text → server parses +
validates → `structuredContent` — with no key, no network, no cost. It also asserts the prompt we
send embeds the JSON schema.

**Be ready to answer:**
- What is MCP sampling and which way does the request flow? (server → host; the host runs the model. The host must declare the `sampling` capability.)
- Why would a server use sampling instead of its own API key? (no secret to manage; works with whatever model the host runs; nothing for the server to bill)
- What do you give up? (no server-side structured-output enforcement — you must validate the returned text yourself)
- How did you support both without rewriting the tools? (the `*Fn` seam — sampling is just another provider implementation, selected by `TAILOR_MODE`)

---

_Next: M4 — README (with a "what is MCP" intro, a `claude_desktop_config.json` snippet, and a
demo), CI that runs `tsc --noEmit` + the tests, and push to GitHub. This file grows a section per
milestone._
