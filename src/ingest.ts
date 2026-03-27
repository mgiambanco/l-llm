import { simpleGit } from 'simple-git'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import fg from 'fast-glob'
import { Ollama } from 'ollama'
import { chunkFile, LANG_EXTENSIONS } from './chunk.js'
import { addChunks, ensureIndex } from './store.js'
import { getConfig } from './config.js'

export async function ingestRepo(
  repoUrl: string,
  language: string,
  onProgress?: (msg: string) => void,
): Promise<number> {
  const config = getConfig()
  const lang = language.toLowerCase()
  const extensions = LANG_EXTENSIONS[lang]

  if (!extensions) {
    const supported = Object.keys(LANG_EXTENSIONS).join(', ')
    throw new Error(`Unknown language "${language}". Supported: ${supported}`)
  }

  await ensureIndex()

  const tmpDir = mkdtempSync(join(tmpdir(), 'lang-llm-'))

  try {
    onProgress?.(`Cloning ${repoUrl} (shallow)...`)
    await simpleGit().clone(repoUrl, tmpDir, ['--depth', '1'])

    const patterns = extensions.map((ext) => `**/*${ext}`)
    const files = await fg(patterns, {
      cwd: tmpDir,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/vendor/**', '**/target/**'],
      absolute: true,
    })

    onProgress?.(`Found ${files.length} ${lang} files — embedding...`)

    const ollama = new Ollama()
    let totalChunks = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      // Normalize path separators and strip temp dir prefix
      const relativePath = file.replace(tmpDir, '').replace(/\\/g, '/').replace(/^\//, '')
      onProgress?.(`[${i + 1}/${files.length}] ${relativePath}`)

      let content: string
      try {
        content = readFileSync(file, 'utf-8')
      } catch {
        continue
      }

      const chunks = chunkFile(content, relativePath, repoUrl, lang)
      const embedded: Array<{ vector: number[]; metadata: typeof chunks[0] }> = []

      for (const chunk of chunks) {
        try {
          const { embedding } = await ollama.embeddings({
            model: config.embedModel,
            prompt: chunk.content,
          })
          embedded.push({ vector: embedding, metadata: chunk })
        } catch {
          // skip chunks that fail to embed
        }
      }

      await addChunks(embedded)
      totalChunks += embedded.length
    }

    return totalChunks
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
