import type { ExtractedUrlInfo } from '../types';
import { parseGitHubUrl } from '../url-classifier';

export async function fetchGitHubInfo(url: string): Promise<ExtractedUrlInfo> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    return { url, type: 'github', title: url };
  }

  const { owner, repo } = parsed;

  const [repoRes, readmeRes] = await Promise.allSettled([
    fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(10000),
    }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(10000),
    }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repoData: any = {};
  if (repoRes.status === 'fulfilled' && repoRes.value.ok) {
    repoData = await repoRes.value.json();
  }

  let readmeSnippet = '';
  if (readmeRes.status === 'fulfilled' && readmeRes.value.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const readmeData: any = await readmeRes.value.json();
    try {
      const content = Buffer.from(readmeData.content, 'base64').toString('utf-8');
      readmeSnippet = content.slice(0, 1500);
    } catch {
      // ignore decode errors
    }
  }

  return {
    url,
    type: 'github',
    title: repoData.full_name || `${owner}/${repo}`,
    repoName: repoData.name || repo,
    repoDescription: repoData.description || undefined,
    readmeSnippet: readmeSnippet || undefined,
    topics: repoData.topics || [],
    homepageUrl: repoData.homepage || undefined,
    language: repoData.language || undefined,
    description: repoData.description || undefined,
  };
}
