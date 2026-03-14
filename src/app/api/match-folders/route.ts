import { NextRequest } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

// スキャン対象ディレクトリ
const SCAN_DIRS = ['Desktop', 'code', 'Documents', 'projects', 'dev', 'repos'];

interface FolderEntry {
  name: string;
  path: string; // ~/Desktop/name or ~/code/name
}

async function scanDirectories(): Promise<FolderEntry[]> {
  const home = homedir();
  const allFolders: FolderEntry[] = [];

  for (const dir of SCAN_DIRS) {
    const dirPath = join(home, dir);
    try {
      const entries = await readdir(dirPath);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        try {
          const s = await stat(join(dirPath, entry));
          if (s.isDirectory()) {
            allFolders.push({ name: entry, path: `~/${dir}/${entry}` });
          }
        } catch { /* skip */ }
      }
    } catch { /* dir doesn't exist, skip */ }
  }

  return allFolders;
}

export async function POST(request: NextRequest) {
  try {
    const { projects } = await request.json();
    if (!Array.isArray(projects)) {
      return Response.json({ matches: {} });
    }

    const allFolders = await scanDirectories();
    const matches: Record<number, string> = {};

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      if (project.localFolder) continue;

      const matched = findMatchingFolder(allFolders, project);
      if (matched) {
        matches[i] = matched.path;
      }
    }

    return Response.json({ matches });
  } catch {
    return Response.json({ matches: {} });
  }
}

// 日本語→英語キーワードマッピング
const JA_EN_MAP: Record<string, string[]> = {
  '子供': ['kids', 'kodomo', 'children', 'child'],
  'こども': ['kids', 'kodomo', 'children'],
  '音声': ['voice', 'onsei', 'audio', 'speech'],
  '文字起こし': ['transcription', 'voice-memo', 'speech'],
  'トイレ': ['toilet', 'restroom'],
  '絵本': ['storybook', 'ehon', 'picture-book'],
  '曲': ['kyoku', 'music', 'song'],
  'ガチャ': ['gacha'],
  '公園': ['park', 'koen'],
  '天気': ['tenki', 'weather'],
  '会員': ['member', 'membership'],
  '成長': ['growth', 'memories', 'kids'],
  '記録': ['record', 'memo', 'note', 'log'],
};

function expandKeywords(text: string): string[] {
  const extra: string[] = [];
  const lower = text.toLowerCase();
  for (const [ja, ens] of Object.entries(JA_EN_MAP)) {
    if (lower.includes(ja)) {
      extra.push(...ens);
    }
  }
  return extra;
}

function findMatchingFolder(
  folders: FolderEntry[],
  project: { projectName?: string; description?: string; urls?: Array<{ url: string }> }
): FolderEntry | null {
  const candidates: string[] = [];

  // プロジェクト名からキーワード抽出
  if (project.projectName) {
    candidates.push(project.projectName.toLowerCase().replace(/\s+/g, '-'));
    const words = project.projectName.toLowerCase().split(/[\s\-_()（）]+/).filter(w => w.length > 2);
    candidates.push(...words);
    // 日本語→英語変換
    candidates.push(...expandKeywords(project.projectName));
  }

  // 説明文からキーワード抽出
  if (project.description) {
    const descWords = project.description.toLowerCase().split(/[\s、。,.\-_]+/).filter(w => w.length > 3);
    candidates.push(...descWords);
    // 日本語→英語変換
    candidates.push(...expandKeywords(project.description));
  }

  // URLからslug抽出
  if (project.urls) {
    for (const { url } of project.urls) {
      try {
        const u = new URL(url);
        if (u.hostname === 'github.com') {
          const parts = u.pathname.split('/').filter(Boolean);
          if (parts.length >= 2) candidates.push(parts[1].toLowerCase());
        }
        if (u.hostname.endsWith('.netlify.app')) {
          candidates.push(u.hostname.replace('.netlify.app', '').toLowerCase());
        }
        if (u.hostname.endsWith('.vercel.app')) {
          candidates.push(u.hostname.replace('.vercel.app', '').toLowerCase());
        }
        const domainParts = u.hostname.split('.');
        if (domainParts.length >= 2) {
          candidates.push(domainParts[0].toLowerCase());
        }
      } catch { /* skip */ }
    }
  }

  // 重複排除
  const uniqueCandidates = [...new Set(candidates)];
  const foldersLower = folders.map(f => f.name.toLowerCase());

  // 1. 完全一致
  for (const candidate of uniqueCandidates) {
    const idx = foldersLower.indexOf(candidate);
    if (idx !== -1) return folders[idx];
  }

  // 2. 部分一致（フォルダ名がcandidateを含む or candidateがフォルダ名を含む）
  for (const candidate of uniqueCandidates) {
    if (candidate.length < 3) continue;
    for (let j = 0; j < folders.length; j++) {
      if (foldersLower[j].includes(candidate) || candidate.includes(foldersLower[j])) {
        return folders[j];
      }
    }
  }

  return null;
}
