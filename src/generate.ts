import { Ollama } from 'ollama'
import { search } from './store.js'
import { getConfig } from './config.js'

export const DEP_FILES: Record<string, string> = {
  typescript: 'package.json',
  javascript: 'package.json',
  python:     'requirements.txt',
  rust:       'Cargo.toml',
  go:         'go.mod',
  java:       'pom.xml',
  kotlin:     'build.gradle.kts',
  scala:      'build.sbt',
  csharp:     'project.csproj',
  ruby:       'Gemfile',
  php:        'composer.json',
  swift:      'Package.swift',
  haskell:    'package.yaml',
  elixir:     'mix.exs',
  zig:        'build.zig.zon',
}

export async function generateCode(
  prompt: string,
  language: string,
  topK = 8,
  fileContext?: string,   // content of local files to include as extra context
): Promise<string> {
  const config = getConfig()
  const ollama = new Ollama()

  // Embed the user's prompt
  const { embedding } = await ollama.embeddings({
    model: config.embedModel,
    prompt,
  })

  // Retrieve most relevant code chunks from the index
  const chunks = await search(embedding, topK)

  if (chunks.length === 0 && !fileContext) {
    throw new Error(`No indexed code found. Run: add <repo-url> -l ${language}`)
  }

  // Build RAG context block
  const ragContext = chunks
    .map((c, i) => `### Example ${i + 1} — ${c.filePath}\n\`\`\`${language}\n${c.content}\n\`\`\``)
    .join('\n\n')

  const fileSection = fileContext
    ? `### Existing project code\n\`\`\`${language}\n${fileContext}\n\`\`\`\n\n`
    : ''

  const fullPrompt = `You are an expert ${language} programmer. Below are ${language} code examples to guide your style and patterns.

${fileSection}${ragContext}

---
Task: ${prompt}

Write idiomatic ${language} code to accomplish the task above. Include concise inline comments explaining non-obvious logic, and a brief top-level doc comment describing what the code does. Output only the code, no explanation outside of comments.`

  // Stream and collect
  const stream = await ollama.generate({
    model: config.llmModel,
    prompt: fullPrompt,
    stream: true,
  })

  let output = ''
  for await (const chunk of stream) {
    process.stdout.write(chunk.response)
    output += chunk.response
  }

  return output
}

export async function generateTests(
  code: string,
  language: string,
  testFileName: string,
): Promise<string> {
  const config = getConfig()
  const ollama = new Ollama()

  const prompt = `You are an expert ${language} developer. Write a complete test file named "${testFileName}" for the following ${language} code. Use the standard testing framework for ${language}. Cover the main logic paths with clear, well-commented tests. Output only the test file content, no explanation outside of comments.

\`\`\`${language}
${code}
\`\`\``

  const stream = await ollama.generate({
    model: config.llmModel,
    prompt,
    stream: true,
  })

  let output = ''
  for await (const chunk of stream) {
    process.stdout.write(chunk.response)
    output += chunk.response
  }

  return output
}

export async function generateDepsFile(
  code: string,
  language: string,
  depFileName: string,
): Promise<string> {
  const config = getConfig()
  const ollama = new Ollama()

  const prompt = `You are an expert ${language} developer. Analyze the following ${language} code and generate a minimal, valid ${depFileName} that declares only the external dependencies actually used. Output only the file content, no explanation or markdown fences.

\`\`\`${language}
${code}
\`\`\``

  const stream = await ollama.generate({
    model: config.llmModel,
    prompt,
    stream: true,
  })

  let output = ''
  for await (const chunk of stream) {
    process.stdout.write(chunk.response)
    output += chunk.response
  }

  return output
}
