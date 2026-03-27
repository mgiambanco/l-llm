import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'

export const CONFIG_DIR = join(homedir(), '.lang-llm')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export interface Config {
  llmModel: string
  embedModel: string
  dbPath: string
  githubToken?: string
}

const DEFAULT_CONFIG: Config = {
  llmModel: 'codellama',
  embedModel: 'nomic-embed-text',
  dbPath: join(CONFIG_DIR, 'index'),
  githubToken: undefined,
}

let _projectDir: string | null = null

export function setProjectConfigDir(dir: string | null): void {
  _projectDir = dir
}

export function getConfig(): Config {
  let config: Config = { ...DEFAULT_CONFIG }
  if (existsSync(CONFIG_FILE)) {
    try {
      config = { ...config, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) }
    } catch {
      // use defaults
    }
  }
  if (_projectDir) {
    const projectFile = join(_projectDir, '.l-llm', 'config.json')
    if (existsSync(projectFile)) {
      try {
        config = { ...config, ...JSON.parse(readFileSync(projectFile, 'utf-8')) }
      } catch {
        // ignore
      }
    }
  }
  return config
}

export function saveConfig(updates: Partial<Config>): void {
  ensureDirs()
  const current = getConfig()
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...updates }, null, 2))
}

export function saveProjectConfig(dir: string, updates: Partial<Config>): void {
  const projectDir = join(dir, '.l-llm')
  mkdirSync(projectDir, { recursive: true })
  const projectFile = join(projectDir, 'config.json')
  let current: Partial<Config> = {}
  if (existsSync(projectFile)) {
    try {
      current = JSON.parse(readFileSync(projectFile, 'utf-8'))
    } catch {
      // ignore
    }
  }
  writeFileSync(projectFile, JSON.stringify({ ...current, ...updates }, null, 2))
}

export function ensureDirs(): void {
  const config = getConfig()
  mkdirSync(CONFIG_DIR, { recursive: true })
  mkdirSync(config.dbPath, { recursive: true })
}

export interface Session {
  workingDir?: string
  defaultLanguage?: string
}

const SESSION_FILE = join(CONFIG_DIR, 'session.json')

export function loadSession(): Session {
  if (!existsSync(SESSION_FILE)) return {}
  try {
    return JSON.parse(readFileSync(SESSION_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

export function saveSession(session: Session): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2))
}
