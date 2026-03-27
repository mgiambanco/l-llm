import { LocalIndex } from 'vectra'
import { getConfig } from './config.js'

export interface ChunkMeta {
  content: string
  filePath: string
  repoUrl: string
  language: string
  startLine: number
  [key: string]: string | number  // satisfies vectra's MetadataTypes index signature
}

let _index: LocalIndex | null = null

function getIndex(): LocalIndex {
  if (!_index) {
    const config = getConfig()
    _index = new LocalIndex(config.dbPath)
  }
  return _index
}

export async function ensureIndex(): Promise<void> {
  const index = getIndex()
  if (!(await index.isIndexCreated())) {
    await index.createIndex()
  }
}

export async function addChunks(
  chunks: Array<{ vector: number[]; metadata: ChunkMeta }>,
): Promise<void> {
  const index = getIndex()
  for (const chunk of chunks) {
    await index.upsertItem({ vector: chunk.vector, metadata: chunk.metadata })
  }
}

export async function search(vector: number[], k = 8): Promise<ChunkMeta[]> {
  const index = getIndex()
  const results = await index.queryItems(vector, k)
  return results.map((r) => r.item.metadata as unknown as ChunkMeta)
}

export async function getIndexedRepos(): Promise<string[]> {
  const index = getIndex()
  const items = await index.listItems()
  const repos = new Set(items.map((item) => (item.metadata as unknown as ChunkMeta).repoUrl))
  return [...repos]
}

export async function removeRepo(repoUrl: string): Promise<number> {
  const index = getIndex()
  const items = await index.listItems()
  let count = 0
  for (const item of items) {
    if ((item.metadata as unknown as ChunkMeta).repoUrl === repoUrl) {
      await index.deleteItem(item.id)
      count++
    }
  }
  return count
}
