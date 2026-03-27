const CHUNK_LINES = 80
const OVERLAP_LINES = 15

export interface Chunk {
  content: string
  filePath: string
  repoUrl: string
  language: string
  startLine: number
  [key: string]: string | number
}

export function chunkFile(
  content: string,
  filePath: string,
  repoUrl: string,
  language: string,
): Chunk[] {
  const lines = content.split('\n')
  const chunks: Chunk[] = []
  const step = CHUNK_LINES - OVERLAP_LINES

  for (let i = 0; i < lines.length; i += step) {
    const end = Math.min(i + CHUNK_LINES, lines.length)
    const body = lines.slice(i, end).join('\n')

    // Skip near-empty chunks (whitespace/comments only)
    if (body.replace(/\s|\/\/.*/g, '').length < 30) {
      if (end === lines.length) break
      continue
    }

    chunks.push({
      content: `// File: ${filePath}\n${body}`,
      filePath,
      repoUrl,
      language,
      startLine: i + 1,
    })

    if (end === lines.length) break
  }

  return chunks
}

// Language → file extensions
export const LANG_EXTENSIONS: Record<string, string[]> = {
  typescript:  ['.ts', '.tsx'],
  javascript:  ['.js', '.jsx', '.mjs', '.cjs'],
  python:      ['.py'],
  rust:        ['.rs'],
  go:          ['.go'],
  java:        ['.java'],
  cpp:         ['.cpp', '.cc', '.cxx', '.hpp', '.h'],
  c:           ['.c', '.h'],
  csharp:      ['.cs'],
  ruby:        ['.rb'],
  php:         ['.php'],
  swift:       ['.swift'],
  kotlin:      ['.kt'],
  scala:       ['.scala'],
  haskell:     ['.hs'],
  elixir:      ['.ex', '.exs'],
  lua:         ['.lua'],
  zig:         ['.zig'],
}

export function supportedLanguages(): string[] {
  return Object.keys(LANG_EXTENSIONS)
}

export function languageExtensions(language: string): string[] {
  return LANG_EXTENSIONS[language] ?? []
}
