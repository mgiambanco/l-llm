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
): Promise<GitHubRepo[]> {
  const q = encodeURIComponent(`${query} language:${language}`)
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'lang-llm',
      'Accept': 'application/vnd.github.v3+json',
    },
  })

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as { items: GitHubRepo[] }
  return data.items ?? []
}
