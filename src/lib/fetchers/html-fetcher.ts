import * as cheerio from 'cheerio';
import type { ExtractedUrlInfo, UrlType } from '../types';

export async function fetchHtmlInfo(url: string, type: UrlType): Promise<ExtractedUrlInfo> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProjectResolver/1.0)',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });

    if (!response.ok) {
      return { url, type, title: `Error: ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { url, type, title: `Non-HTML: ${contentType}` };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $('title').first().text().trim()
      || $('meta[property="og:title"]').attr('content')?.trim()
      || '';

    const description = $('meta[name="description"]').attr('content')?.trim()
      || $('meta[property="og:description"]').attr('content')?.trim()
      || '';

    const headings: string[] = [];
    $('h1, h2, h3').slice(0, 10).each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings.push(text);
    });

    // Get visible text content
    $('script, style, noscript, nav, footer, header').remove();
    const contentSnippet = $('body').text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);

    return {
      url,
      type,
      title: title || undefined,
      description: description || undefined,
      headings: headings.length > 0 ? headings : undefined,
      contentSnippet: contentSnippet || undefined,
    };
  } catch (error) {
    return {
      url,
      type,
      title: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}
