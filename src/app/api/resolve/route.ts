import { NextRequest } from 'next/server';
import { ResolveRequest } from '@/lib/types';
import { fetchAllUrls } from '@/lib/fetchers';
import { resolveProjects } from '@/lib/gemini/resolver';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ResolveRequest.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { success: false, error: '入力が不正です' },
        { status: 400 }
      );
    }

    const { urls: urlsRaw, folderInfo } = parsed.data;

    // Parse URLs from textarea
    const urls = urlsRaw
      .split(/[\n\r]+/)
      .map(u => u.trim())
      .filter(u => {
        try {
          new URL(u);
          return true;
        } catch {
          return false;
        }
      });

    if (urls.length === 0) {
      return Response.json(
        { success: false, error: '有効なURLが見つかりません' },
        { status: 400 }
      );
    }

    if (urls.length > 30) {
      return Response.json(
        { success: false, error: 'URLは30件以内にしてください' },
        { status: 400 }
      );
    }

    // Step 1: ローカルフォルダ一覧を自動取得（複数ディレクトリ）
    let autoFolderInfo = folderInfo || '';
    const scanDirs = ['Desktop', 'code', 'Documents', 'projects', 'dev', 'repos'];
    for (const dir of scanDirs) {
      try {
        const dirPath = join(homedir(), dir);
        const entries = await readdir(dirPath);
        const folders: string[] = [];
        for (const entry of entries) {
          if (entry.startsWith('.')) continue;
          try {
            const s = await stat(join(dirPath, entry));
            if (s.isDirectory()) folders.push(entry);
          } catch { /* skip */ }
        }
        if (folders.length > 0) {
          const folderList = folders.map(f => `~/${dir}/${f}`).join('\n');
          autoFolderInfo += `\n\n~/${dir}/ にあるフォルダ一覧:\n${folderList}`;
        }
      } catch { /* dir doesn't exist, skip */ }
    }
    autoFolderInfo = autoFolderInfo.trim();

    // Step 2: Fetch info from all URLs
    const extractedInfo = await fetchAllUrls(urls);

    // Step 3: Send to Gemini for grouping (フォルダ情報付き)
    const result = await resolveProjects(extractedInfo, autoFolderInfo || undefined);

    return Response.json({
      success: true,
      data: result,
      extractedInfo,
    });
  } catch (error) {
    console.error('Resolve error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'サーバーエラーが発生しました',
      },
      { status: 500 }
    );
  }
}
