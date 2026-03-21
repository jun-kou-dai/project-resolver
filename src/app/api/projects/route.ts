import { NextResponse } from 'next/server';

const OWNER = 'jun-kou-dai';
const REPO = 'project-resolver';
const FILE_PATH = 'public/pending-projects.json';

// GitHub APIからプロジェクトデータを取得（常に最新）
export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    // トークンなし時は静的ファイルにフォールバック
    return NextResponse.json({ fallback: true });
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      return NextResponse.json({ fallback: true });
    }

    const file = await res.json();
    const content = Buffer.from(file.content, 'base64').toString('utf-8');
    const projects = JSON.parse(content);
    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json({ fallback: true });
  }
}
