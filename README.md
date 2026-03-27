# lang-llm

An interactive CLI for language-specific code generation using local RAG (Retrieval-Augmented Generation). Search GitHub for reference repos, index them locally, then generate idiomatic code — complete with comments, tests, and a dependency file — and write it directly to your project.

No cloud APIs. Everything runs on your machine via [Ollama](https://ollama.com).

## How it works

1. **Search** — Query GitHub for repos relevant to your use case and pick which ones to index
2. **Index** — Repos are shallow-cloned into `.l-llm/` in your project folder, chunked into 80-line windows with 15-line overlap, embedded via Ollama, and stored in a local vector index at `~/.lang-llm/`
3. **Generate** — Your prompt is embedded, the top-k most similar chunks are retrieved as context, and commented code is streamed from your local LLM
4. **Check** — The file is linted and compiled automatically; errors are shown inline
5. **Test** — A test file is generated and saved alongside the source
6. **Save** — Code, tests, and optionally a dependency file are written to your working directory

Session state (working directory and language) is remembered between runs.

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

On first run the app asks for your project folder and language, then drops into a persistent prompt. On subsequent runs it offers to resume the last session:

```
lang-llm  local RAG code generation via Ollama

Last session: my-project / typescript
Resume? [Y/n]
✓ Directory: /home/user/my-project
✓ Language: typescript

Type "help" for commands, "exit" to quit.

> [typescript] [my-project]
```

## Commands

### `search <query>`

Search GitHub for repos matching your query and the current language. Pick results by number to index them. Clones are cached in `.l-llm/` inside your project folder.

```
> [typescript] search http framework
Searching GitHub for "http framework" (typescript)...

   1.  nestjs/nest                          ★ 68.1k  A progressive Node.js framework...
   2.  expressjs/express                    ★ 64.2k  Fast, unopinionated, minimalist...
   3.  fastify/fastify                      ★ 32.1k  Fast and low overhead web frame...

Index repos (e.g. 1 3) or Enter to cancel: 1 2
```

### `gen "<prompt>"`

Generate code using RAG context. The output includes inline comments and a top-level doc comment. After saving, the app automatically:

- Lints the file (using `tsc`, `ruff`, `go vet`, etc. — whichever is available)
- Runs a build/syntax check (`python -m py_compile`, `cargo check`, `javac`, etc.)
- Generates a test file and saves it next to the source
- Offers to generate or update the project's dependency file

The save prompt suggests a filename derived from your prompt:

```
Save to file? [jwt-auth-middleware.ts] (path, Enter to accept, - to skip):
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

Remove all indexed chunks for a given repo from the vector store.

### `clear-cache`

Delete all cached repo clones from `.l-llm/` in the current working directory. Prompts for confirmation before deleting.

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

## Repo cache

When a working directory is set, cloned repos are stored in `.l-llm/` inside that directory instead of a temporary folder. This means:

- Re-indexing a repo reuses the existing clone (faster)
- Clones persist between sessions
- `clear-cache` removes them when no longer needed

Add `.l-llm/` to your `.gitignore` to avoid committing cloned repos.

## Session persistence

The last working directory and language are saved to `~/.lang-llm/session.json`. On startup, the app offers to resume where you left off.

## Lint and build checks

After saving generated code, the app runs available tools automatically:

| Language | Lint | Build check |
|---|---|---|
| TypeScript / JavaScript | `tsc --noEmit` (or `eslint` if config present) | `tsc --noEmit` |
| Python | `ruff check` → `flake8` → `pylint` | `python -m py_compile` |
| Rust | `cargo clippy` (if `Cargo.toml` present) | `cargo check` |
| Go | `go vet` | `go build` |
| Java | — | `javac` |
| Swift | — | `swift -typecheck` |
| Elixir | — | `elixirc` |
| Haskell | — | `ghc -fno-code` |
| Zig | — | `zig build-obj` |

Tools that are not installed are skipped silently.

## Test file generation

A test file is always generated alongside the source using the language's conventional naming:

| Language | Convention |
|---|---|
| TypeScript / JavaScript | `<name>.test.ts` / `<name>.test.js` |
| Python | `test_<name>.py` |
| Go | `<name>_test.go` |
| Java / Kotlin / C# | `<Name>Test.java` / `<Name>Test.kt` / `<Name>Tests.cs` |
| Ruby | `<name>_spec.rb` |
| Elixir | `<name>_test.exs` |
| Scala | `<Name>Spec.scala` |

## Dependency file generation

After saving, the app offers to generate or update the project's dependency file using the LLM:

| Language | File |
|---|---|
| TypeScript / JavaScript | `package.json` |
| Python | `requirements.txt` |
| Rust | `Cargo.toml` |
| Go | `go.mod` |
| Java | `pom.xml` |
| Ruby | `Gemfile` |
| PHP | `composer.json` |
| Swift | `Package.swift` |
| Elixir | `mix.exs` |
| Zig | `build.zig.zon` |

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
├── config.ts     — Config + session persistence (~/.lang-llm/)
├── chunk.ts      — Line-based chunker + language→extension map
├── store.ts      — Vectra vector store wrapper
├── ingest.ts     — Clone → filter → chunk → embed → store (with .l-llm cache)
├── generate.ts   — RAG code generation, test generation, dep file generation
└── runner.ts     — Per-language lint and build check commands
```

## Stack

- [`ollama`](https://github.com/ollama/ollama-js) — Local LLM + embeddings
- [`vectra`](https://github.com/Stevenic/vectra) — Pure-TS local vector store (JSON-based, no native binaries)
- [`simple-git`](https://github.com/steveukzx/simple-git) — Repo cloning
- [`fast-glob`](https://github.com/mrmlnc/fast-glob) — File discovery
