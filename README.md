# lang-llm

An interactive CLI for language-specific code generation using local RAG (Retrieval-Augmented Generation). Search GitHub for reference repos, index them locally, then generate idiomatic commented code — complete with auto-fix, tests, and a dependency file — and write it directly to your project.

No cloud APIs. Everything runs on your machine via [Ollama](https://ollama.com).

## How it works

1. **Search** — Query GitHub for repos relevant to your use case and pick which ones to index
2. **Index** — Repos are shallow-cloned into `.l-llm/` in your project folder, chunked into 80-line windows with 15-line overlap, embedded via Ollama, and stored in a local vector index at `~/.lang-llm/`
3. **Generate** — Your prompt is embedded, the top-k most similar language-matched chunks are retrieved as context, and commented code is streamed from your local LLM
4. **Auto-fix** — If lint or build checks fail, errors are fed back to the LLM and the file is rewritten automatically (up to 3 attempts)
5. **Test** — A test file is generated, saved alongside the source, and executed immediately
6. **Save** — Code, tests, and optionally a dependency file are written to your working directory; every write is undoable

Session state (working directory and language) is remembered between runs, as is your command history.

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

Command history is available with the up/down arrow keys and persists across sessions.

## Commands

### `search <query>`

Search GitHub for repos matching your query and the current language. Pick results by number to index them. Clones are cached in `.l-llm/` inside your project folder.

```
> [typescript] search http framework
> [typescript] search web framework --min-stars 1000
```

`--min-stars <n>` filters results to repos with at least that many stars.

### `gen "<prompt>"`

Generate code using RAG context. Retrieval is filtered to chunks matching the current language. The output includes a top-level doc comment and inline comments. After saving, the app automatically:

1. Lints the file (using `tsc`, `ruff`, `go vet`, etc.)
2. Runs a build/syntax check (`python -m py_compile`, `cargo check`, `javac`, etc.)
3. If either check fails, feeds the errors back to the LLM and rewrites the file (up to 3 attempts)
4. Generates a test file and saves it next to the source
5. Runs the tests immediately
6. Offers to generate or update the project's dependency file

The save prompt suggests a filename derived from your prompt:

```
Save to file? [jwt-auth-middleware.ts] (path, Enter to accept, - to skip):
```

**Options:**

| Flag | Description |
|---|---|
| `-l <lang>` | Target language (overrides session default) |
| `-f <path>` | Local file, directory, or glob as extra context |
| `-o <path>` | Write output directly to this path (skips save prompt) |
| `-k <n>` | Number of context chunks to retrieve (default: 8) |
| `--temp <n>` | Sampling temperature (e.g. `0.2` for focused, `0.9` for creative) |

```
> [typescript] gen "JWT authentication middleware"
> [typescript] gen "add rate limiting" -f src/middleware/auth.ts -o src/middleware/rateLimit.ts
> [python] gen "async task queue" -f src/ --temp 0.3
> [rust] gen "binary search tree" -k 15
```

### `refine "<instruction>"`

Iterate on the last generated code without re-running RAG. Re-lints and re-builds after refinement.

```
> refine "add pagination support"
> refine "use dependency injection instead of globals"
```

### `explain <file>`

Ask the LLM to explain what a file does — its purpose, inputs/outputs, and notable patterns.

```
> explain src/middleware/auth.ts
```

### `fix <file>`

Run lint and build checks on an existing file. If errors are found, send them to the LLM and write the fixed version back.

```
> fix src/middleware/auth.ts
```

### `refactor <file> "<instruction>"`

Rewrite an existing file in-place following an instruction. Preserves behaviour; updates comments.

```
> refactor src/db.ts "extract connection pooling into a separate class"
```

### `edit [file]`

Open the last generated file (or a specified file) in `$EDITOR`. Falls back to `notepad` on Windows, `vi` elsewhere.

```
> edit
> edit src/middleware/auth.ts
```

### `undo`

Restore the previously written version of the last-touched file. If the file was newly created, it is deleted.

```
> undo
```

### `index [path]`

Embed your own local project files into the vector store so `gen` can use them as context. Defaults to the current working directory.

```
> index
> index ./src
```

Local indexed paths appear in `list` prefixed with `local:`.

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

Show all indexed repositories and local directories.

### `remove <repo-url>`

Remove all indexed chunks for a given repo or local path from the vector store.

### `clear-cache`

Delete all cached repo clones from `.l-llm/` in the current working directory. Prompts for confirmation before deleting.

### `config`

View or update configuration. Changes are saved to `~/.lang-llm/config.json` by default.

```
> config                                          # view current settings
> config --model qwen2.5-coder                   # change generation model globally
> config --embed-model mxbai-embed-large
> config --github-token ghp_xxxx                 # set GitHub token (raises API rate limit)
> config --model deepseek-coder --project        # save model override for this project only
```

With `--project`, model settings are written to `.l-llm/config.json` in the working directory and take precedence over global config for that project.

Config defaults:

| Setting      | Default              |
|--------------|----------------------|
| LLM model    | `codellama`          |
| Embed model  | `nomic-embed-text`   |
| Index path   | `~/.lang-llm/index`  |
| GitHub token | *(not set)*          |

### `set language <lang>`

Set the default language for the session.

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

When a working directory is set, cloned repos are stored in `.l-llm/` inside that directory instead of a temporary folder:

- Re-indexing a repo reuses the existing clone (faster)
- Clones persist between sessions
- `clear-cache` removes them when no longer needed

Add `.l-llm/` to your `.gitignore` to avoid committing cloned repos.

## Session persistence

| What | Where |
|---|---|
| Working directory + language | `~/.lang-llm/session.json` |
| Command history (500 entries) | `~/.lang-llm/history` |
| Global config | `~/.lang-llm/config.json` |
| Per-project config | `<project>/.l-llm/config.json` |

## Lint, build, and auto-fix

After saving, available tools run automatically. If any fail, the LLM is asked to fix the errors and the file is rewritten — up to 3 times until all checks pass.

| Language | Lint | Build check |
|---|---|---|
| TypeScript / JavaScript | `tsc --noEmit` (or eslint if config present) | `tsc --noEmit` |
| Python | `ruff check` → `flake8` → `pylint` | `python -m py_compile` |
| Rust | `cargo clippy` (if `Cargo.toml` present) | `cargo check` |
| Go | `go vet` | `go build` |
| Java | — | `javac` |
| Swift | — | `swift -typecheck` |
| Elixir | — | `elixirc` |
| Haskell | — | `ghc -fno-code` |
| Zig | — | `zig build-obj` |
| PHP | `php -l` | — |
| Ruby | `ruby -wc` | — |

Tools that are not installed are skipped silently.

## Test generation and execution

A test file is always generated alongside the source using the language's conventional naming, then executed immediately with the standard test runner.

| Language | Test file | Runner |
|---|---|---|
| TypeScript / JavaScript | `<name>.test.ts` / `.test.js` | jest → vitest → `node --test` |
| Python | `test_<name>.py` | pytest → `python -m pytest` |
| Go | `<name>_test.go` | `go test` |
| Rust | `<name>_test.rs` | `cargo test` |
| Java | `<Name>Test.java` | mvn → gradle |
| Kotlin / Scala | `<Name>Test.kt` / `<Name>Spec.scala` | gradle |
| Ruby | `<name>_spec.rb` | rspec → ruby |
| Elixir | `<name>_test.exs` | `mix test` |
| Swift | `<Name>Tests.swift` | `swift test` |
| C# | `<Name>Tests.cs` | `dotnet build` |

## Dependency file generation

After saving, the app offers to generate or update the project's dependency file:

| Language | File |
|---|---|
| TypeScript / JavaScript | `package.json` |
| Python | `requirements.txt` |
| Rust | `Cargo.toml` |
| Go | `go.mod` |
| Java | `pom.xml` |
| Kotlin | `build.gradle.kts` |
| Scala | `build.sbt` |
| Ruby | `Gemfile` |
| PHP | `composer.json` |
| Swift | `Package.swift` |
| C# | `project.csproj` |
| Haskell | `package.yaml` |
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
├── cli.ts        — REPL, all commands, session state, history, undo stack
├── github.ts     — GitHub repo search (token + star filter support)
├── config.ts     — Global + per-project config, session persistence
├── chunk.ts      — Line-based chunker + language→extension map
├── store.ts      — Vectra vector store wrapper (with language filter)
├── ingest.ts     — Clone/embed remote repos and local directories
├── generate.ts   — Code gen, fix, refine, explain, refactor, tests, dep files
└── runner.ts     — Per-language lint, build, and test runner commands
```

## Stack

- [`ollama`](https://github.com/ollama/ollama-js) — Local LLM + embeddings
- [`vectra`](https://github.com/Stevenic/vectra) — Pure-TS local vector store (JSON-based, no native binaries)
- [`simple-git`](https://github.com/steveukzx/simple-git) — Repo cloning
- [`fast-glob`](https://github.com/mrmlnc/fast-glob) — File discovery
