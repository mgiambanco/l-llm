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
