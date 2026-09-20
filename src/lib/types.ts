import { z } from 'zod';

// === URL Classification ===
export const UrlType = z.enum([
  'github',
  'netlify',
  'vercel',
  'production',
  'unknown'
]);
export type UrlType = z.infer<typeof UrlType>;

// === Extracted URL Info ===
export const ExtractedUrlInfo = z.object({
  url: z.string(),
  type: UrlType,
  title: z.string().optional(),
  description: z.string().optional(),
  headings: z.array(z.string()).optional(),
  contentSnippet: z.string().optional(),
  // GitHub-specific
  repoName: z.string().optional(),
  repoDescription: z.string().optional(),
  readmeSnippet: z.string().optional(),
  topics: z.array(z.string()).optional(),
  homepageUrl: z.string().optional(),
  language: z.string().optional(),
});
export type ExtractedUrlInfo = z.infer<typeof ExtractedUrlInfo>;

// === Gemini Response Schema ===
export const ProjectGrouping = z.object({
  projectName: z.string().describe('案件名'),
  description: z.string().describe('案件の簡単な説明'),
  urls: z.array(z.object({
    url: z.string(),
    role: z.string().describe('このURLの役割（例: ソースコード、デプロイ先、本番サイト）'),
  })),
  reasoning: z.string().describe('この案件にまとめた根拠'),
  confidence: z.enum(['high', 'medium', 'low']).describe('確信度: high=確定, medium=有力候補, low=保留'),
  status: z.enum(['active', 'developing', 'prototype', 'stopped', 'lost', 'unknown']).describe('状態推定: active=公開中, developing=開発中, prototype=試作中, stopped=停止中, lost=消滅（実体なし）, unknown=不明'),
  techStack: z.array(z.string()).optional().describe('推定される技術スタック'),
  localFolder: z.string().optional().describe('対応するローカルフォルダのパスまたは名前（推定）'),

  // === ここから下は scripts/refresh-activity.mjs が実測して書き込む。AIは推定しない ===
  lastUpdated: z.string().nullable().optional().describe('最終開発日（ISO8601）'),
  dateSource: z.enum(['git', 'file', 'deploy', 'none']).optional().describe('最終開発日の根拠: git=最終コミット日, file=ソースの更新日時, deploy=公開日, none=不明'),
  deployedAt: z.string().nullable().optional().describe('公開先の最終公開日（ソースが手元に無いもの用・手入力）'),
  commitCount: z.number().optional().describe('累計コミット数（gitのときのみ）'),
  recentCommits: z.number().optional().describe('直近90日のコミット数'),
  activityScore: z.number().optional().describe('活発さ 0-100（新しさ6割＋開発量4割）'),
  liveStatus: z.object({
    url: z.string(),
    code: z.number(),
    ok: z.boolean(),
    reason: z.string().optional(),
  }).optional().describe('公開先の疎通結果'),
  checkedAt: z.string().optional().describe('実測した日時（ISO8601）'),
});
export type ProjectGrouping = z.infer<typeof ProjectGrouping>;

export const GeminiResponse = z.object({
  projects: z.array(ProjectGrouping),
  ungrouped: z.array(z.object({
    url: z.string(),
    reason: z.string().describe('グループ化できなかった理由'),
  })).optional(),
  summary: z.string().describe('全体のまとめ'),
});
export type GeminiResponse = z.infer<typeof GeminiResponse>;

// === API Request/Response ===
export const ResolveRequest = z.object({
  urls: z.string(),
  folderInfo: z.string().optional(),
});
export type ResolveRequest = z.infer<typeof ResolveRequest>;

export interface ResolveResponse {
  success: boolean;
  data?: GeminiResponse;
  error?: string;
  extractedInfo?: ExtractedUrlInfo[];
}
