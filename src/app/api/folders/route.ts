import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export async function GET() {
  try {
    const desktopPath = join(homedir(), 'Desktop');
    const entries = await readdir(desktopPath);

    const folders: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      try {
        const s = await stat(join(desktopPath, entry));
        if (s.isDirectory()) {
          folders.push(entry);
        }
      } catch {
        // skip inaccessible entries
      }
    }

    folders.sort();
    return NextResponse.json({ folders, basePath: '~/Desktop' });
  } catch (e) {
    return NextResponse.json(
      { error: 'フォルダ一覧の取得に失敗しました', detail: String(e) },
      { status: 500 }
    );
  }
}
