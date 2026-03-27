# lang-llm

An interactive CLI for language-specific code generation using local RAG (Retrieval-Augmented Generation). Search GitHub for reference repos, index them locally, then generate idiomatic code and write it directly to your project files.

No cloud APIs. Everything runs on your machine via [Ollama](https://ollama.com).

## How it works

1. **Search** — Query GitHub for repos relevant to your use case and pick which ones to index
2. **Index** — Repos are shallow-cloned, chunked into 80-line windows with 15-line overlap, embedded via Ollama, and stored in a local vector index at `~/.lang-llm/`
3. **Generate** — Your prompt is embedded, the top-k most similar chunks are retrieved as context, and code is streamed from your local LLM
4. **Save** — Generated code is written to a file in your working directory

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Ollama](https://ollama.com) installed and running
- A generation model and an embedding model pulled

```bash
ollama pull codellama        # or qwen2.5-coder, deepseek-coder, etc.
ollama pull nomic-embed-text
```

## Installation

```bash
npm install
npm run build
```

Optionally link it globally:

```bash
npm link
```

## Usage

Start the interactive session:

```bash
node dist/cli.js
# or, if linked:
lang-llm
```

On startup the app asks for your language and working directory, then drops into a persistent prompt:

```
lang-llm  local RAG code generation via Ollama

Languages: typescript, javascript, python, rust, go, cpp, ...  (help languages)

What language are you working in? typescript
✓ Language: typescript
Working directory? (Enter to skip): ./my-project
✓ Directory: /home/user/my-project

Type "help" for commands, "exit" to quit.

> [typescript] [my-project]
```

## Commands

### `search <query>`

Search GitHub for repos matching your query and the current language. Pick results by number to index them.

```
> [typescript] search http framework
Searching GitHub for "http framework" (typescript)...

   1.  nestjs/nest                          ★ 68.1k  A progressive Node.js framework...
   2.  expressjs/express                    ★ 64.2k  Fast, unopinionated, minimalist...
   3.  fastify/fastify                      ★ 32.1k  Fast and low overhead web frame...

Index repos (e.g. 1 3) or Enter to cancel: 1 2
```

### `gen "<prompt>"`

Generate code using RAG context. If a working directory is set, prompts to save the output to a file.

```
> [typescript] gen "JWT authentication middleware"
```

Include a local file as extra context with `-f`:

```
> [typescript] gen "add rate limiting to this" -f src/middleware/auth.ts
```

Write output directly to a file with `-o` (skips the save prompt):

```
> [typescript] gen "rate limiting middleware" -o src/middleware/rateLimit.ts
```

Control how many context chunks are retrieved (default: 8):

```
> [typescript] gen "binary search tree" -k 15
```

### `open <path>`

Set the working directory for the session. Run with no argument to show the current path.

```
> open ./my-project
```

### `files`

List source files in the working directory filtered by the current language.

```
> [typescript] [my-project] files
Files in my-project (4):
  src/index.ts
  src/middleware/auth.ts
  src/routes/users.ts
  tsconfig.json
```

### `add <repo-url>`

Index a specific repo by URL directly, without a GitHub search.

```
> add https://github.com/expressjs/express -l typescript
```

### `list`

Show all indexed repositories.

### `remove <repo-url>`

Remove all indexed chunks for a given repo.

### `config`

View or update the active model configuration.

```
> config                                   # view current settings
> config --model qwen2.5-coder
> config --embed-model mxbai-embed-large
```

Config is saved to `~/.lang-llm/config.json`. Defaults:

| Setting     | Default             |
|-------------|---------------------|
| LLM model   | `codellama`         |
| Embed model | `nomic-embed-text`  |
| Index path  | `~/.lang-llm/index` |

### `set language <lang>`

Set the default language for the session (overrides the startup prompt).

```
> set language rust
```

### `help [topic]`

Show command reference or detailed help for a specific topic.

```
> help
> help generate
> help languages
> help models
```

## Supported languages

`typescript`, `javascript`, `python`, `rust`, `go`, `java`, `cpp`, `c`, `csharp`, `ruby`, `php`, `swift`, `kotlin`, `scala`, `haskell`, `elixir`, `lua`, `zig`

## Recommended models

| Purpose    | Model                                                      |
|------------|------------------------------------------------------------|
| Generation | `qwen2.5-coder:7b`, `deepseek-coder:6.7b`, `codellama:7b` |
| Embeddings | `nomic-embed-text`, `mxbai-embed-large`                    |

## Project structure

```
src/
├── cli.ts        — Interactive REPL, command dispatch, startup prompts
├── github.ts     — GitHub repo search via REST API
├── config.ts     — Config read/write (~/.lang-llm/config.json)
├── chunk.ts      — Line-based chunker + language→extension map
├── store.ts      — Vectra vector store wrapper
├── ingest.ts     — Clone → filter → chunk → embed → store
└── generate.ts   — Embed query → retrieve → stream generation → return output
```

## Stack

- [`ollama`](https://github.com/ollama/ollama-js) — Local LLM + embeddings
- [`vectra`](https://github.com/Stevenic/vectra) — Pure-TS local vector store (JSON-based, no native binaries)
- [`simple-git`](https://github.com/steveukzx/simple-git) — Repo cloning
- [`fast-glob`](https://github.com/mrmlnc/fast-glob) — File discovery
