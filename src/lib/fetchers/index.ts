import type { ExtractedUrlInfo } from '../types';
import { classifyUrl } from '../url-classifier';
import { fetchGitHubInfo } from './github-fetcher';
import { fetchHtmlInfo } from './html-fetcher';

export async function fetchUrlInfo(url: string): Promise<ExtractedUrlInfo> {
  const type = classifyUrl(url);

  if (type === 'github') {
    return fetchGitHubInfo(url);
  }

  return fetchHtmlInfo(url, type);
}

export async function fetchAllUrls(urls: string[]): Promise<ExtractedUrlInfo[]> {
  const results: ExtractedUrlInfo[] = [];
  const batchSize = 5;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(url => fetchUrlInfo(url))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }
  }

  return results;
}
