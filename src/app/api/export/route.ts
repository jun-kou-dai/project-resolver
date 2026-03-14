import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';

// クライアントからlocalStorageデータを受け取ってファイルに保存
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const path = join(process.cwd(), 'public', 'pending-projects.json');
    await writeFile(path, JSON.stringify(data.projects, null, 2), 'utf-8');
    return NextResponse.json({ success: true, count: data.projects.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
