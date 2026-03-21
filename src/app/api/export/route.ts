import { NextRequest, NextResponse } from 'next/server';

const OWNER = 'jun-kou-dai';
const REPO = 'project-resolver';
const FILE_PATH = 'public/pending-projects.json';

// GitHub API経由でpending-projects.jsonを更新（全デバイスで同期）
export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 500 });
  }

  try {
    const data = await req.json();
    const content = JSON.stringify(data.projects, null, 2) + '\n';
    const encoded = Buffer.from(content).toString('base64');

    // 現在のファイルのSHAを取得（更新に必須）
    const getRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
    );

    let sha: string | undefined;
    if (getRes.ok) {
      const file = await getRes.json();
      sha = file.sha;
    }

    // ファイルを更新（commit & push）
    const putRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `sync: ${data.projects.length}件のプロジェクトデータを更新`,
          content: encoded,
          ...(sha ? { sha } : {}),
        }),
      }
    );

    if (!putRes.ok) {
      const err = await putRes.text();
      return NextResponse.json({ error: `GitHub API error: ${putRes.status} ${err}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data.projects.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
