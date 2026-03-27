import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'

const CONFIG_DIR = join(homedir(), '.lang-llm')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export interface Config {
  llmModel: string
  embedModel: string
  dbPath: string
}

const DEFAULT_CONFIG: Config = {
  llmModel: 'codellama',
  embedModel: 'nomic-embed-text',
  dbPath: join(CONFIG_DIR, 'index'),
}

export function getConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG }
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(updates: Partial<Config>): void {
  ensureDirs()
  const current = getConfig()
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...updates }, null, 2))
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
