#!/usr/bin/env node
import { createInterface, Interface } from 'readline/promises'
import { resolve, join, relative, basename } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'fs'
import chalk from 'chalk'
import ora from 'ora'
import fg from 'fast-glob'
import { ingestRepo } from './ingest.js'
import { generateCode, generateTests, generateDepsFile, DEP_FILES } from './generate.js'
import { lintFile, buildCheck, testFilename } from './runner.js'
import { getIndexedRepos, removeRepo } from './store.js'
import { getConfig, saveConfig, ensureDirs, loadSession, saveSession } from './config.js'
import { supportedLanguages, languageExtensions } from './chunk.js'
import { searchGitHub } from './github.js'

// Module-level readline interface so commands can ask follow-up questions
let iface: Interface

// ── tokenizer ──────────────────────────────────────────────────────────────
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i++
    if (i >= input.length) break

    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i++]
      let token = ''
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) token += input[++i]
        else token += input[i]
        i++
      }
      i++
      tokens.push(token)
    } else {
      let token = ''
      while (i < input.length && !/\s/.test(input[i])) token += input[i++]
      tokens.push(token)
    }
  }
  return tokens
}

// ── options parser ─────────────────────────────────────────────────────────
function parseArgs(args: string[]): { positional: string[]; opts: Record<string, string> } {
  const positional: string[] = []
  const opts: Record<string, string> = {}
  let i = 0
  while (i < args.length) {
    if (args[i].startsWith('-')) {
      const key = args[i].replace(/^-+/, '')
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        opts[key] = args[++i]
      } else {
        opts[key] = 'true'
      }
    } else {
      positional.push(args[i])
    }
    i++
  }
  return { positional, opts }
}

// ── session state ──────────────────────────────────────────────────────────
let defaultLanguage: string | null = null
let workingDir: string | null = null

function persistSession(): void {
  saveSession({
    workingDir: workingDir ?? undefined,
    defaultLanguage: defaultLanguage ?? undefined,
  })
}

// ── helpers ────────────────────────────────────────────────────────────────
function suggestFilename(prompt: string, language: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 5)
    .join('-')
  const extMap: Record<string, string> = {
    typescript: '.ts', javascript: '.js', python: '.py', rust: '.rs',
    go: '.go', java: '.java', cpp: '.cpp', c: '.c', csharp: '.cs',
    ruby: '.rb', php: '.php', swift: '.swift', kotlin: '.kt',
    scala: '.scala', haskell: '.hs', elixir: '.ex', lua: '.lua', zig: '.zig',
  }
  return slug + (extMap[language] ?? '.txt')
}

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function promptStr(): string {
  const lang = defaultLanguage ? chalk.dim(`[${defaultLanguage}]`) : ''
  const dir  = workingDir     ? chalk.dim(`[${basename(workingDir)}]`) : ''
  const parts = [lang, dir].filter(Boolean).join(' ')
  return chalk.bold.green('> ') + (parts ? parts + ' ' : '')
}

// Resolve a path relative to workingDir if set, else cwd
function resolvePath(p: string): string {
  return workingDir ? resolve(workingDir, p) : resolve(p)
}

// ── command handlers ───────────────────────────────────────────────────────
async function cmdOpen(args: string[]): Promise<void> {
  const p = args[0]
  if (!p) {
    if (workingDir) {
      console.log(chalk.bold('Working directory: ') + chalk.cyan(workingDir))
    } else {
      console.log(chalk.dim('No working directory set.'))
      console.log(chalk.dim('  open <path>'))
    }
    return
  }

  const resolved = resolve(p)
  if (!existsSync(resolved)) {
    console.log(chalk.red(`Path does not exist: ${resolved}`))
    return
  }

  workingDir = resolved
  persistSession()
  console.log(chalk.green(`Working directory: ${workingDir}`))
}

async function cmdFiles(): Promise<void> {
  if (!workingDir) {
    console.log(chalk.red('No working directory set. Run: open <path>'))
    return
  }

  const exts = defaultLanguage ? languageExtensions(defaultLanguage) : []
  const pattern = exts.length > 0
    ? `**/*.{${exts.map((e) => e.replace(/^\./, '')).join(',')}}`
    : '**/*'

  const files = await fg(pattern, {
    cwd: workingDir,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
    onlyFiles: true,
  })

  if (files.length === 0) {
    console.log(chalk.dim(`No ${defaultLanguage ?? ''} files found in ${workingDir}`))
    return
  }

  console.log(chalk.bold(`Files in ${basename(workingDir)} (${files.length}):`))
  files.forEach((f) => console.log(chalk.cyan('  ' + f)))
}

async function cmdAdd(args: string[]): Promise<void> {
  const { positional, opts } = parseArgs(args)
  const repoUrl = positional[0]
  const language = opts.l ?? opts.language ?? defaultLanguage ?? undefined

  if (!repoUrl) {
    console.log(chalk.red('Usage: add <repo-url> [-l <language>]'))
    return
  }
  if (!language) {
    console.log(chalk.red('Specify a language: add <repo-url> -l <language>'))
    return
  }

  const cacheDir = workingDir ? join(workingDir, '.l-llm') : undefined
  const spinner = ora('Preparing...').start()
  try {
    const total = await ingestRepo(repoUrl, language, (msg) => { spinner.text = msg }, cacheDir)
    spinner.succeed(chalk.green(`Done — ${total} chunks indexed from ${repoUrl}`))
  } catch (e: any) {
    spinner.fail(chalk.red(String(e.message ?? e)))
  }
}

async function cmdSearch(args: string[]): Promise<void> {
  const { positional, opts } = parseArgs(args)
  const query = positional.join(' ')
  const language = opts.l ?? opts.language ?? defaultLanguage ?? undefined

  if (!query) {
    console.log(chalk.red('Usage: search <query> [-l <language>]'))
    return
  }
  if (!language) {
    console.log(chalk.red('Specify a language: search <query> -l <language>'))
    console.log(chalk.dim('  Or set a session default: set language <lang>'))
    return
  }

  const spinner = ora(`Searching GitHub for "${query}" (${language})...`).start()
  let repos
  try {
    repos = await searchGitHub(query, language)
    spinner.stop()
    process.stdin.resume()
  } catch (e: any) {
    spinner.fail(chalk.red(String(e.message ?? e)))
    return
  }

  if (repos.length === 0) {
    console.log(chalk.yellow('No repositories found.'))
    return
  }

  console.log()
  repos.forEach((r, i) => {
    const stars = chalk.yellow(`★ ${formatStars(r.stargazers_count)}`)
    const name = chalk.cyan(r.full_name.padEnd(40))
    const desc = chalk.dim((r.description ?? '').slice(0, 60))
    console.log(`  ${chalk.bold(String(i + 1).padStart(2))}.  ${name} ${stars}  ${desc}`)
  })
  console.log()

  let raw: string
  try {
    raw = await iface.question(chalk.dim('Index repos (e.g. 1 3) or Enter to cancel: '))
  } catch {
    return
  }

  const indices = raw
    .trim()
    .split(/\s+/)
    .map((s) => parseInt(s, 10) - 1)
    .filter((n) => n >= 0 && n < repos.length)

  if (indices.length === 0) {
    console.log(chalk.dim('Nothing selected.'))
    return
  }

  for (const idx of indices) {
    const repo = repos[idx]
    const cacheDir2 = workingDir ? join(workingDir, '.l-llm') : undefined
    const spinner2 = ora(`Indexing ${repo.full_name}...`).start()
    try {
      const total = await ingestRepo(repo.clone_url, language, (msg) => { spinner2.text = msg }, cacheDir2)
      spinner2.succeed(chalk.green(`Done — ${total} chunks indexed from ${repo.full_name}`))
    } catch (e: any) {
      spinner2.fail(chalk.red(String(e.message ?? e)))
    }
  }
}

async function cmdGenerate(args: string[]): Promise<void> {
  const { positional, opts } = parseArgs(args)
  const prompt = positional[0]
  const language = opts.l ?? opts.language ?? defaultLanguage ?? undefined
  const topK = parseInt(opts.k ?? opts['top-k'] ?? '8', 10)
  const outputFlag = opts.o ?? opts.output ?? undefined
  const fileFlag = opts.f ?? opts.file ?? undefined

  if (!prompt) {
    console.log(chalk.red('Usage: gen "<prompt>" [-l <language>] [-f <file>] [-o <output>]'))
    return
  }
  if (!language) {
    console.log(chalk.red('Specify a language: gen "<prompt>" -l <language>'))
    console.log(chalk.dim('  Or set a session default: set language <lang>'))
    return
  }

  // Read file context if -f was given
  let fileContext: string | undefined
  if (fileFlag) {
    const filePath = resolvePath(fileFlag)
    if (!existsSync(filePath)) {
      console.log(chalk.red(`File not found: ${filePath}`))
      return
    }
    fileContext = readFileSync(filePath, 'utf-8')
    console.log(chalk.dim(`Using context from: ${relative(workingDir ?? process.cwd(), filePath)}`))
  }

  console.log(chalk.dim('\n--- Generated Code ---\n'))
  let output = ''
  try {
    output = await generateCode(prompt, language, topK, fileContext)
    console.log(chalk.dim('\n--- End ---\n'))
  } catch (e: any) {
    console.log(chalk.red(String(e.message ?? e)))
    return
  }

  // Determine output path
  let savePath = outputFlag ? resolvePath(outputFlag) : undefined

  if (!savePath && workingDir) {
    const suggestion = suggestFilename(prompt, language)
    let answer: string
    try {
      answer = await iface.question(
        chalk.dim('Save to file? ') + chalk.dim(`[${suggestion}] `) + chalk.dim('(path, Enter to accept, - to skip): '),
      )
    } catch {
      return
    }
    const trimmed = answer.trim()
    if (trimmed !== '-') {
      savePath = resolvePath(trimmed || suggestion)
    }
  }

  if (savePath) {
    // Strip markdown code fences if present
    const cleaned = output
      .replace(/^```[^\n]*\n/, '')
      .replace(/\n```\s*$/, '')
      .trimEnd()

    mkdirSync(resolve(savePath, '..'), { recursive: true })
    writeFileSync(savePath, cleaned + '\n', 'utf-8')

    const display = workingDir ? relative(workingDir, savePath) : savePath
    console.log(chalk.green(`✓ Written to ${display}`))

    const checkCwd = workingDir ?? resolve(savePath, '..')

    // Lint
    const lintResult = lintFile(savePath, language, checkCwd)
    if (lintResult) {
      const label = lintResult.success ? chalk.green('✓ Lint passed') : chalk.red('✗ Lint errors')
      console.log(`${label}  ${chalk.dim(`(${lintResult.tool})`)}`)
      if (!lintResult.success && lintResult.output) {
        console.log(chalk.dim(lintResult.output.split('\n').map(l => '  ' + l).join('\n')))
      }
    }

    // Build / syntax check
    const buildResult = buildCheck(savePath, language, checkCwd)
    if (buildResult) {
      const label = buildResult.success ? chalk.green('✓ Build passed') : chalk.red('✗ Build errors')
      console.log(`${label}  ${chalk.dim(`(${buildResult.tool})`)}`)
      if (!buildResult.success && buildResult.output) {
        console.log(chalk.dim(buildResult.output.split('\n').map(l => '  ' + l).join('\n')))
      }
    }

    // Generate test file
    const testFile = testFilename(savePath, language)
    const testPath = join(resolve(savePath, '..'), testFile)
    console.log(chalk.dim(`\n--- ${testFile} ---\n`))
    let testContent = ''
    try {
      testContent = await generateTests(cleaned, language, testFile)
      console.log(chalk.dim('\n--- End ---\n'))
      const testCleaned = testContent
        .replace(/^```[^\n]*\n/, '')
        .replace(/\n```\s*$/, '')
        .trimEnd()
      writeFileSync(testPath, testCleaned + '\n', 'utf-8')
      const testDisplay = workingDir ? relative(workingDir, testPath) : testPath
      console.log(chalk.green(`✓ Tests written to ${testDisplay}`))
    } catch (e: any) {
      console.log(chalk.red(`Tests failed: ${String(e.message ?? e)}`))
    }

    // Offer to generate a dependency file if the language has one
    const depFileName = DEP_FILES[language]
    if (depFileName && workingDir) {
      const depPath = join(workingDir, depFileName)
      const depExists = existsSync(depPath)
      const depLabel = depExists ? chalk.yellow(`Update ${depFileName}?`) : chalk.bold(`Generate ${depFileName}?`)
      let depAnswer: string
      try {
        depAnswer = await iface.question(depLabel + chalk.dim(' [y/N] '))
      } catch {
        return
      }
      if (depAnswer.trim().toLowerCase() === 'y') {
        console.log(chalk.dim(`\n--- ${depFileName} ---\n`))
        let depContent = ''
        try {
          depContent = await generateDepsFile(cleaned, language, depFileName)
          console.log(chalk.dim('\n--- End ---\n'))
        } catch (e: any) {
          console.log(chalk.red(String(e.message ?? e)))
          return
        }
        const depCleaned = depContent
          .replace(/^```[^\n]*\n/, '')
          .replace(/\n```\s*$/, '')
          .trimEnd()
        writeFileSync(depPath, depCleaned + '\n', 'utf-8')
        console.log(chalk.green(`✓ Written to ${depFileName}`))
      }
    }
  }
}

async function cmdList(): Promise<void> {
  try {
    const repos = await getIndexedRepos()
    if (repos.length === 0) {
      console.log(chalk.dim('No repos indexed yet.'))
      console.log(chalk.dim('  search <query>  or  add <repo-url>'))
    } else {
      console.log(chalk.bold(`Indexed repos (${repos.length}):`))
      repos.forEach((r) => console.log(chalk.cyan('  •'), r))
    }
  } catch (e: any) {
    console.log(chalk.red(String(e.message ?? e)))
  }
}

async function cmdRemove(args: string[]): Promise<void> {
  const repoUrl = args[0]
  if (!repoUrl) {
    console.log(chalk.red('Usage: remove <repo-url>'))
    return
  }

  const spinner = ora('Removing...').start()
  try {
    const count = await removeRepo(repoUrl)
    if (count === 0) {
      spinner.warn(chalk.yellow(`No chunks found for ${repoUrl}`))
    } else {
      spinner.succeed(chalk.green(`Removed ${count} chunks for ${repoUrl}`))
    }
  } catch (e: any) {
    spinner.fail(chalk.red(String(e.message ?? e)))
  }
}

async function cmdClearCache(): Promise<void> {
  if (!workingDir) {
    console.log(chalk.red('No working directory set. Run: open <path>'))
    return
  }

  const cacheDir = join(workingDir, '.l-llm')
  if (!existsSync(cacheDir)) {
    console.log(chalk.dim('Cache is already empty.'))
    return
  }

  const entries = readdirSync(cacheDir)
  if (entries.length === 0) {
    console.log(chalk.dim('Cache is already empty.'))
    return
  }

  let answer: string
  try {
    answer = await iface.question(
      chalk.bold(`Delete ${entries.length} cached repo(s) in .l-llm? `) + chalk.dim('[y/N] '),
    )
  } catch {
    return
  }

  if (answer.trim().toLowerCase() !== 'y') {
    console.log(chalk.dim('Cancelled.'))
    return
  }

  const spinner = ora('Clearing cache...').start()
  try {
    rmSync(cacheDir, { recursive: true, force: true })
    spinner.succeed(chalk.green(`Cleared ${entries.length} cached repo(s) from .l-llm`))
  } catch (e: any) {
    spinner.fail(chalk.red(String(e.message ?? e)))
  }
}

function cmdConfig(args: string[]): void {
  const { opts } = parseArgs(args)
  if (opts.model) saveConfig({ llmModel: opts.model })
  if (opts['embed-model']) saveConfig({ embedModel: opts['embed-model'] })

  const config = getConfig()
  console.log(chalk.bold('Current config:'))
  console.log(chalk.dim('  LLM model:   ') + chalk.cyan(config.llmModel))
  console.log(chalk.dim('  Embed model: ') + chalk.cyan(config.embedModel))
  console.log(chalk.dim('  Index path:  ') + chalk.cyan(config.dbPath))
  if (defaultLanguage) {
    console.log(chalk.dim('  Language:    ') + chalk.cyan(defaultLanguage) + chalk.dim('  (session)'))
  }
  if (workingDir) {
    console.log(chalk.dim('  Directory:   ') + chalk.cyan(workingDir) + chalk.dim('  (session)'))
  }
}

function cmdSet(args: string[]): void {
  const [key, value] = args
  if (key === 'language' || key === 'lang') {
    if (!value) { console.log(chalk.red('Usage: set language <lang>')); return }
    defaultLanguage = value
    persistSession()
    console.log(chalk.green(`Default language set to: ${defaultLanguage}`))
  } else if (!key) {
    console.log(chalk.red('Usage: set language <lang>'))
  } else {
    console.log(chalk.red(`Unknown setting: ${key}`))
  }
}

function cmdHelp(args: string[]): void {
  const topic = args[0]

  const topics: Record<string, () => void> = {
    open: () => {
      console.log(chalk.bold.underline('open'))
      console.log('  Set the working directory for reading and writing files.')
      console.log('  Run with no argument to show the current working directory.')
      console.log()
      console.log(chalk.bold('Usage:'))
      console.log('  open <path>')
      console.log()
      console.log(chalk.bold('Examples:'))
      console.log('  open ./my-project')
      console.log('  open /home/user/projects/api')
    },

    files: () => {
      console.log(chalk.bold.underline('files'))
      console.log('  List source files in the working directory for the current language.')
      console.log()
      console.log(chalk.bold('Usage:'))
      console.log('  files')
    },

    search: () => {
      console.log(chalk.bold.underline('search'))
      console.log('  Searches GitHub for repos matching your query and lets you pick ones to index.')
      console.log()
      console.log(chalk.bold('Usage:'))
      console.log('  search <query> [-l <language>]')
      console.log()
      console.log(chalk.bold('Examples:'))
      console.log('  search http framework')
      console.log('  search async task queue -l python')
    },

    generate: () => {
      console.log(chalk.bold.underline('gen / generate'))
      console.log('  Generates code using RAG context and optionally writes it to a file.')
      console.log()
      console.log(chalk.bold('Usage:'))
      console.log('  gen "<prompt>" [-l <lang>] [-f <file>] [-o <output>] [-k <n>]')
      console.log()
      console.log(chalk.bold('Options:'))
      console.log('  -l, --language <lang>   target language')
      console.log('  -f, --file <path>       include a local file as extra context')
      console.log('  -o, --output <path>     write output directly to this file (skips prompt)')
      console.log('  -k, --top-k <n>         context chunks from index (default: 8)')
      console.log()
      console.log(chalk.bold('Examples:'))
      console.log('  gen "JWT auth middleware"')
      console.log('  gen "add rate limiting" -f src/middleware/auth.ts -o src/middleware/rateLimit.ts')
    },

    add: () => {
      console.log(chalk.bold.underline('add'))
      console.log('  Clones a GitHub repo, chunks files, embeds them, and stores in the local index.')
      console.log()
      console.log(chalk.bold('Usage:'))
      console.log('  add <repo-url> [-l <language>]')
      console.log()
      console.log(chalk.bold('Examples:'))
      console.log('  add https://github.com/expressjs/express')
      console.log('  add https://github.com/tokio-rs/tokio -l rust')
    },

    list: () => {
      console.log(chalk.bold.underline('list'))
      console.log('  Prints all currently indexed repositories.')
    },

    remove: () => {
      console.log(chalk.bold.underline('remove'))
      console.log('  Removes all indexed chunks for a given repo URL.')
      console.log()
      console.log(chalk.bold('Usage:'))
      console.log('  remove <repo-url>')
    },

    config: () => {
      console.log(chalk.bold.underline('config'))
      console.log('  View or update model configuration.')
      console.log()
      console.log(chalk.bold('Usage:'))
      console.log('  config [--model <name>] [--embed-model <name>]')
    },

    set: () => {
      console.log(chalk.bold.underline('set'))
      console.log('  Set session-level defaults (not persisted).')
      console.log()
      console.log(chalk.bold('Usage:'))
      console.log('  set language <lang>')
    },

    languages: () => {
      console.log(chalk.bold.underline('Supported languages'))
      console.log()
      const langs = supportedLanguages()
      const cols = 4
      for (let i = 0; i < langs.length; i += cols) {
        const row = langs.slice(i, i + cols).map((l) => l.padEnd(16)).join('')
        console.log('  ' + chalk.cyan(row))
      }
    },

    models: () => {
      console.log(chalk.bold.underline('Recommended Ollama models'))
      console.log()
      console.log(chalk.bold('Generation:'))
      console.log('  ' + chalk.cyan('qwen2.5-coder:7b') + '     — best overall code quality')
      console.log('  ' + chalk.cyan('deepseek-coder:6.7b') + '  — fast, strong on algorithms')
      console.log('  ' + chalk.cyan('codellama:7b') + '         — default, widely compatible')
      console.log()
      console.log(chalk.bold('Embeddings:'))
      console.log('  ' + chalk.cyan('nomic-embed-text') + '     — default, balanced speed/quality')
      console.log('  ' + chalk.cyan('mxbai-embed-large') + '   — higher quality, slower')
      console.log()
      console.log(chalk.dim('Pull a model:  ollama pull <model-name>'))
    },
  }

  if (topic && topics[topic]) {
    console.log()
    topics[topic]()
    console.log()
    return
  }

  if (topic) {
    console.log(chalk.red(`Unknown help topic: "${topic}"`))
    console.log(chalk.dim(`Available: ${Object.keys(topics).join(', ')}`))
    return
  }

  console.log()
  console.log(chalk.bold('Commands:'))
  console.log(`  ${chalk.cyan('open')} <path>                      Set working directory`)
  console.log(`  ${chalk.cyan('files')}                             List source files in working dir`)
  console.log(`  ${chalk.cyan('search')} <query>                    Search GitHub and index repos`)
  console.log(`  ${chalk.cyan('gen')} "<prompt>" ${chalk.dim('[-f <file>] [-o <out>]')}  Generate and save code`)
  console.log(`  ${chalk.cyan('add')} <repo-url>                    Index a specific repo`)
  console.log(`  ${chalk.cyan('list')}                              Show indexed repos`)
  console.log(`  ${chalk.cyan('remove')} <repo-url>                 Remove a repo from the index`)
  console.log(`  ${chalk.cyan('clear-cache')}                       Delete all cached repos in .l-llm`)
  console.log(`  ${chalk.cyan('config')} ${chalk.dim('[--model] [--embed-model]')}     View/change models`)
  console.log(`  ${chalk.cyan('set')} language <lang>               Set session language`)
  console.log(`  ${chalk.cyan('help')} [topic]                      Show help`)
  console.log(`  ${chalk.cyan('exit')}                              Quit`)
  console.log()
  console.log(chalk.bold('Help topics:'))
  console.log(chalk.dim('  help open | files | search | generate | add | list | remove | config | languages | models'))
  console.log()
}

// ── dispatcher ─────────────────────────────────────────────────────────────
async function dispatch(args: string[]): Promise<boolean> {
  const cmd = args[0].toLowerCase()
  const rest = args.slice(1)

  switch (cmd) {
    case 'open':     await cmdOpen(rest); break
    case 'files':    await cmdFiles(); break
    case 'search':   await cmdSearch(rest); break
    case 'add':      await cmdAdd(rest); break
    case 'gen':
    case 'generate': await cmdGenerate(rest); break
    case 'list':     await cmdList(); break
    case 'remove':      await cmdRemove(rest); break
    case 'clear-cache': await cmdClearCache(); break
    case 'config':      cmdConfig(rest); break
    case 'set':      cmdSet(rest); break
    case 'help':     cmdHelp(rest); break
    case 'exit':
    case 'quit':
    case 'q':        return false
    default:
      console.log(chalk.red(`Unknown command: ${cmd}`))
      console.log(chalk.dim('  Type "help" to see available commands.'))
  }
  return true
}

// ── startup prompts ────────────────────────────────────────────────────────
async function promptLanguage(): Promise<void> {
  const langs = supportedLanguages()
  const preview = langs.slice(0, 6).join(chalk.dim(', ')) + chalk.dim(', ...')
  console.log(chalk.dim(`Languages: ${preview}  (help languages)`))
  console.log()

  let answer: string
  try {
    answer = await iface.question(chalk.bold('What language are you working in? '))
  } catch {
    return
  }

  const lang = answer.trim().toLowerCase()
  if (lang && langs.includes(lang)) {
    defaultLanguage = lang
    persistSession()
    console.log(chalk.green(`✓ Language: ${defaultLanguage}`))
  } else if (lang) {
    console.log(chalk.yellow(`"${lang}" not recognised — you can still use: set language <lang>`))
  }
}

async function promptWorkingDir(): Promise<void> {
  let answer: string
  try {
    answer = await iface.question(chalk.bold('Working directory? ') + chalk.dim('(Enter to skip): '))
  } catch {
    return
  }

  const p = answer.trim()
  if (!p) return

  const resolved = resolve(p)
  if (!existsSync(resolved)) {
    console.log(chalk.yellow(`Path not found: ${resolved}`))
    return
  }

  workingDir = resolved
  persistSession()
  console.log(chalk.green(`✓ Directory: ${workingDir}`))
}

// ── main loop ──────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  ensureDirs()

  console.log()
  console.log(chalk.bold('lang-llm') + chalk.dim('  local RAG code generation via Ollama'))
  console.log()

  iface = createInterface({ input: process.stdin, output: process.stdout })

  let sigintPending = false
  iface.on('SIGINT', () => {
    if (sigintPending) {
      console.log('\nGoodbye!')
      process.exit(0)
    }
    sigintPending = true
    console.log(chalk.dim('\n(Press Ctrl+C again to exit)'))
    setTimeout(() => { sigintPending = false }, 2000)
  })

  const saved = loadSession()
  if (saved.workingDir || saved.defaultLanguage) {
    const parts = [
      saved.workingDir  ? chalk.cyan(basename(saved.workingDir)) : null,
      saved.defaultLanguage ? chalk.cyan(saved.defaultLanguage) : null,
    ].filter(Boolean).join(chalk.dim(' / '))
    console.log(chalk.dim(`Last session: ${parts}`))
    let resume: string
    try {
      resume = await iface.question(chalk.bold('Resume? ') + chalk.dim('[Y/n] '))
    } catch {
      resume = 'y'
    }
    if (resume.trim().toLowerCase() !== 'n') {
      if (saved.workingDir && existsSync(saved.workingDir)) {
        workingDir = saved.workingDir
        console.log(chalk.green(`✓ Directory: ${workingDir}`))
      } else if (saved.workingDir) {
        console.log(chalk.yellow(`Saved directory not found: ${saved.workingDir}`))
      }
      if (saved.defaultLanguage) {
        defaultLanguage = saved.defaultLanguage
        console.log(chalk.green(`✓ Language: ${defaultLanguage}`))
      }
      console.log()
    } else {
      await promptWorkingDir()
      await promptLanguage()
    }
  } else {
    await promptWorkingDir()
    await promptLanguage()
  }

  console.log()
  console.log(chalk.dim('Type "help" for commands, "exit" to quit.'))
  console.log()

  while (true) {
    process.stdin.resume()
    let line: string
    try {
      line = await iface.question(promptStr())
    } catch {
      break
    }

    const trimmed = line.trim()
    if (!trimmed) continue

    const args = tokenize(trimmed)
    if (args.length === 0) continue

    const keepGoing = await dispatch(args)
    if (!keepGoing) break
  }

  iface.close()
  console.log('\nGoodbye!')
}

main().catch((e) => {
  console.error(chalk.red('Fatal:', e.message ?? e))
  process.exit(1)
})
