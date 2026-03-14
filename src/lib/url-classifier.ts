import type { UrlType } from './types';

export function classifyUrl(url: string): UrlType {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'github.com' || hostname === 'www.github.com') return 'github';
    if (hostname.endsWith('.netlify.app') || hostname === 'app.netlify.com') return 'netlify';
    if (hostname.endsWith('.vercel.app') || hostname === 'vercel.com') return 'vercel';
    if (hostname.endsWith('.github.io')) return 'production'; // GitHub Pages はデプロイ先なのでHTML取得
    return 'production';
  } catch {
    return 'unknown';
  }
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}
