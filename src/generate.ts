import { Ollama } from 'ollama'
import { search } from './store.js'
import { getConfig } from './config.js'

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

Write idiomatic ${language} code to accomplish the task above. Output only the code, no explanation.`

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
