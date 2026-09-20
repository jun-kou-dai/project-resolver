#!/usr/bin/env node
/**
 * public/pending-projects.json の「最終開発日・開発量・稼働状態」を実測で更新する。
 *
 *   node scripts/refresh-activity.mjs             全部更新
 *   node scripts/refresh-activity.mjs --no-http   URL疎通チェックを省く（速い）
 *
 * 手で書いた項目（projectName / description / urls / reasoning / localFolder など）は
 * 一切触らない。下の COMPUTED に挙げた項目だけを上書きする。
 *
 * 最終開発日の根拠（dateSource）:
 *   git  … localFolder が git リポジトリ → 最終コミット日。最も確か
 *   file … git でない → ソースファイルの最終更新日。コピー等でずれることがある
 *   none … ローカルフォルダが見つからない
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'public', 'pending-projects.json');
const SKIP_HTTP = process.argv.includes('--no-http');

// このスクリプトが上書きする項目。これ以外は手入力を尊重する
const COMPUTED = ['lastUpdated', 'dateSource', 'commitCount', 'recentCommits', 'activityScore', 'liveStatus', 'checkedAt'];

// ソースコードとみなす拡張子（node_modules 等は walk 側で除外）
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.json', '.py', '.lua', '.luau', '.swift', '.vue', '.astro', '.mjs', '.cjs', '.sh', '.toml', '.yml', '.yaml', '.md']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.netlify', 'venv', '.venv', '__pycache__', '.expo', 'ios', 'android', 'Pods', 'backups', '_old']);

function expandHome(p) {
  return p?.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function git(dir, args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** git リポジトリなら最終コミット日・累計コミット数・直近90日のコミット数を返す */
function gitActivity(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) return null;
  const last = git(dir, ['log', '-1', '--format=%cI']);
  if (!last) return null; // コミットが1件も無いリポジトリ
  const total = parseInt(git(dir, ['rev-list', '--count', 'HEAD']) || '0', 10);
  const recent = (git(dir, ['log', '--since=90.days', '--format=%H']) || '').split('\n').filter(Boolean).length;
  return { lastUpdated: last, commitCount: total, recentCommits: recent };
}

/** git でないフォルダは、ソースファイルの最終更新日で代用する */
function newestSourceFile(dir, budget = { n: 20000 }) {
  let newest = 0;
  const walk = (d) => {
    if (budget.n <= 0) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (budget.n <= 0) return;
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (CODE_EXT.has(path.extname(e.name).toLowerCase())) {
        budget.n--;
        try {
          const m = fs.statSync(full).mtimeMs;
          if (m > newest) newest = m;
        } catch { /* 読めないファイルは飛ばす */ }
      }
    }
  };
  walk(dir);
  return newest ? new Date(newest).toISOString() : null;
}

/** ローカルにクローンが無いとき用。GitHub の最終push日を引く（gh が無ければ諦める） */
function githubPushedAt(urls = []) {
  const u = urls.find((x) => /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(x.url));
  if (!u) return null;
  const m = u.url.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/);
  if (!m) return null;
  const repo = `${m[1]}/${m[2].replace(/\.git$/, '')}`;
  try {
    const out = execFileSync('gh', ['repo', 'view', repo, '--json', 'pushedAt', '-q', '.pushedAt'],
      { encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || null;
  } catch {
    return null; // gh が無い・未認証・privateで見えない
  }
}

/** そのプロジェクトの「公開先」にあたる URL を1つ選ぶ（GitHub のリポジトリページは除く） */
function primaryDeployUrl(urls = []) {
  const live = urls.filter((u) => u.url.startsWith('http') && !/^https:\/\/github\.com\//.test(u.url));
  const deploy = live.find((u) => /デプロイ|公開/.test(u.role));
  return (deploy || live[0])?.url || null;
}

async function checkUrl(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    // HEAD にまともに答えないサーバーがある（Cloudflare Workers と Roblox は 404 を返す）。
    // HEAD が失敗したら GET で確認し直し、そちらの結果を採る
    if (!res.ok) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal });
    }
    // Vercel は停止中の配信に DEPLOYMENT_PAUSED を返す。理由が分かるので拾っておく
    const reason = res.headers.get('x-vercel-error');
    return { code: res.status, ok: res.ok, ...(reason ? { reason } : {}) };
  } catch {
    return { code: 0, ok: false, reason: 'NO_RESPONSE' };
  } finally {
    clearTimeout(timer);
  }
}

const DAY = 86400000;

/**
 * 活発さのスコア(0-100)。「最近さわったか」6割 ＋「どれだけ作り込んだか」4割。
 * 半減期およそ83日。90日放置で新しさは約47点まで落ちる。
 */
function activityScore({ lastUpdated, commitCount, recentCommits, dateSource }) {
  if (!lastUpdated) return 0;
  const days = Math.max(0, (Date.now() - new Date(lastUpdated).getTime()) / DAY);
  const recency = 100 * Math.exp(-days / 120);

  let volume;
  if (dateSource === 'git') {
    // 累計コミット数を対数で圧縮（1500コミットで上限70点）＋直近90日の勢いを加点
    const base = 70 * (Math.log10(commitCount + 1) / Math.log10(1500));
    volume = Math.min(100, base + Math.min(30, recentCommits * 1.5));
  } else {
    // git 管理外は開発量を測れない。控えめな固定値を置き、新しさで差をつける
    volume = 20;
  }
  return Math.round(recency * 0.6 + volume * 0.4);
}

async function main() {
  const projects = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const checkedAt = new Date().toISOString();
  let gitCount = 0, fileCount = 0, deployCount = 0, remoteCount = 0, noneCount = 0, downCount = 0;

  for (const p of projects) {
    for (const k of COMPUTED) delete p[k];

    // --- 最終開発日と開発量 ---
    const dir = expandHome(p.localFolder);
    if (dir && fs.existsSync(dir) && fs.statSync(dir).isFile()) {
      // 1ファイル完結の試作は、そのファイルの更新日時がそのまま最終開発日
      p.lastUpdated = new Date(fs.statSync(dir).mtimeMs).toISOString();
      p.dateSource = 'file';
      p.commitCount = 0;
      p.recentCommits = 0;
      fileCount++;
    } else if (dir && fs.existsSync(dir)) {
      const g = gitActivity(dir);
      if (g) {
        Object.assign(p, g, { dateSource: 'git' });
        gitCount++;
      } else {
        const f = newestSourceFile(dir);
        p.lastUpdated = f;
        p.dateSource = f ? 'file' : 'none';
        p.commitCount = 0;
        p.recentCommits = 0;
        if (f) fileCount++; else noneCount++;
      }
    } else if (githubPushedAt(p.urls)) {
      // ローカルにクローンが無いリポジトリ。GitHub の最終push日を最終開発日として扱う
      p.lastUpdated = githubPushedAt(p.urls);
      p.dateSource = 'remote';
      p.commitCount = 0;
      p.recentCommits = 0;
      remoteCount++;
    } else if (p.deployedAt) {
      // ソースが手元に無く、公開サイトだけ残っているもの。公開日を最終開発日として扱う
      p.lastUpdated = p.deployedAt;
      p.dateSource = 'deploy';
      p.commitCount = 0;
      p.recentCommits = 0;
      deployCount++;
    } else {
      p.lastUpdated = null;
      p.dateSource = 'none';
      p.commitCount = 0;
      p.recentCommits = 0;
      noneCount++;
    }

    // --- 公開先が生きているか ---
    const url = primaryDeployUrl(p.urls);
    if (url && !SKIP_HTTP) {
      p.liveStatus = { url, ...(await checkUrl(url)) };
      if (!p.liveStatus.ok) downCount++;
    }

    p.activityScore = activityScore(p);
    p.checkedAt = checkedAt;

    const d = p.lastUpdated ? p.lastUpdated.slice(0, 10) : '----------';
    const live = p.liveStatus ? (p.liveStatus.ok ? 'OK' : `NG(${p.liveStatus.code})`) : '-';
    console.log(`${String(p.activityScore).padStart(3)} ${d} ${p.dateSource.padEnd(4)} ${live.padEnd(8)} ${p.projectName}`);
  }

  projects.sort((a, b) => (b.activityScore ?? 0) - (a.activityScore ?? 0));
  fs.writeFileSync(DATA_FILE, JSON.stringify(projects, null, 2) + '\n', 'utf8');

  console.log(`\n${projects.length}件を更新しました（git:${gitCount} / ファイル日付:${fileCount} / 公開日:${deployCount} / GitHub:${remoteCount} / 不明:${noneCount}）`);
  if (downCount > 0) console.log(`⚠ 公開先が応答しないものが ${downCount}件あります`);
}

main();
