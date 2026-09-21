import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

const run = promisify(execFile);

// このAPIは手元のMacのFinderを開く。ブラウザは https ページからの file:// を遮断するため、
// 「押したらフォルダが開く」を実現する方法がこれしかない。
// 公開先(Netlify)では対象パスが存在しないので、何も起きず404を返す。

// Netlifyに置いた画面からも、手元でサーバーが動いていれば開けるようにする
const ALLOWED_ORIGINS = [
  'https://project-resolver-app.netlify.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get('origin'));
  try {
    const { path } = await req.json();
    if (typeof path !== 'string' || !path.trim()) {
      return NextResponse.json({ error: 'パスがありません' }, { status: 400, headers });
    }

    const home = homedir();
    const abs = resolve(path.startsWith('~') ? home + path.slice(1) : path);

    // ホームの外は開かない。誤操作と、外部ページから叩かれたときの被害を抑える
    if (abs !== home && !abs.startsWith(home + '/')) {
      return NextResponse.json({ error: 'ホーム配下のみ開けます' }, { status: 403, headers });
    }
    if (!existsSync(abs)) {
      return NextResponse.json({ error: 'そのパスは存在しません', path: abs }, { status: 404, headers });
    }

    // シェルを介さずに実行する（パスに空白や記号が入っていても安全）
    await run('open', ['-R', abs]);
    // -R は既にそのフォルダを開いているウィンドウを使い回すことがあり、
    // その場合ウィンドウが背面のままで「押しても何も起きない」ように見える。
    // 権限の要らない open -a でFinderを前に出す（AppleScriptは自動化許可が要る）。
    try { await run('open', ['-a', 'Finder']); } catch { /* 前面化に失敗しても開いてはいる */ }
    return NextResponse.json({ ok: true, path: abs }, { headers });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500, headers });
  }
}
