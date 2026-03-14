import { getGeminiClient } from './client';
import { buildPrompt } from './prompt';
import { type ExtractedUrlInfo, GeminiResponse } from '../types';

export async function resolveProjects(
  extractedInfos: ExtractedUrlInfo[],
  folderInfo?: string
): Promise<GeminiResponse> {
  const client = getGeminiClient();
  const prompt = buildPrompt(extractedInfos, folderInfo);

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini APIから応答がありませんでした');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini APIの応答をJSONとして解析できませんでした');
  }

  const result = GeminiResponse.safeParse(parsed);
  if (!result.success) {
    // Zodバリデーション失敗時: 部分的にでも使えるデータを構築
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = parsed as any;
    if (raw && typeof raw === 'object' && Array.isArray(raw.projects)) {
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projects: raw.projects.map((p: any) => ({
          projectName: String(p.projectName || p.project_name || '不明な案件'),
          description: String(p.description || ''),
          urls: Array.isArray(p.urls)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? p.urls.map((u: any) => ({
                url: String(u.url || ''),
                role: String(u.role || '不明'),
              }))
            : [],
          reasoning: String(p.reasoning || ''),
          confidence: (['high', 'medium', 'low'].includes(String(p.confidence))
            ? String(p.confidence)
            : 'low') as 'high' | 'medium' | 'low',
          status: (['active', 'developing', 'prototype', 'stopped', 'unknown'].includes(String(p.status))
            ? String(p.status)
            : 'unknown') as 'active' | 'developing' | 'prototype' | 'stopped' | 'unknown',
          techStack: Array.isArray(p.techStack) ? p.techStack.map(String) : undefined,
          localFolder: p.localFolder ? String(p.localFolder) : undefined,
        })),
        ungrouped: Array.isArray(raw.ungrouped)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? raw.ungrouped.map((u: any) => ({
              url: String(typeof u === 'string' ? u : u.url || ''),
              reason: String(typeof u === 'string' ? '情報不足' : u.reason || '情報不足'),
            }))
          : undefined,
        summary: String(raw.summary || `${raw.projects.length}件のプロジェクトを検出`),
      };
    }
    throw new Error('Gemini APIの応答形式が想定と異なります。再度お試しください。');
  }

  return result.data;
}
