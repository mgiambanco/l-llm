import { getConfig } from './config.js'

export interface GitHubRepo {
  full_name: string
  html_url: string
  clone_url: string
  description: string | null
  stargazers_count: number
  language: string | null
}

export async function searchGitHub(
  query: string,
  language: string,
  limit = 8,
  minStars = 0,
): Promise<GitHubRepo[]> {
  const config = getConfig()
  let q = `${query} language:${language}`
  if (minStars > 0) q += ` stars:>=${minStars}`
  const encoded = encodeURIComponent(q)
  const url = `https://api.github.com/search/repositories?q=${encoded}&sort=stars&order=desc&per_page=${limit}`

  const headers: Record<string, string> = {
    'User-Agent': 'lang-llm',
    'Accept': 'application/vnd.github.v3+json',
  }
  if (config.githubToken) {
    headers['Authorization'] = `Bearer ${config.githubToken}`
  }

  const res = await fetch(url, { headers })

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as { items: GitHubRepo[] }
  return data.items ?? []
}
