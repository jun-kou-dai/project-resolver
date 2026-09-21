'use client';

import { useState } from 'react';

interface LiveStatus {
  url: string;
  code: number;
  ok: boolean;
  reason?: string;
}

interface ProjectCardProps {
  projectName: string;
  description: string;
  urls: Array<{ url: string; role: string }>;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  status: 'active' | 'developing' | 'prototype' | 'stopped' | 'lost' | 'unknown';
  techStack?: string[];
  localFolder?: string | null;
  noLocalSource?: boolean;
  // scripts/refresh-activity.mjs が実測した値
  lastUpdated?: string | null;
  dateSource?: 'git' | 'file' | 'deploy' | 'remote' | 'none';
  commitCount?: number;
  recentCommits?: number;
  activityScore?: number;
  liveStatus?: LiveStatus;
  onLocalFolderChange?: (folder: string) => void;
}

const confidenceConfig = {
  high: { color: 'bg-green-100 text-green-800 border-green-200', label: '確定' },
  medium: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: '有力候補' },
  low: { color: 'bg-red-100 text-red-800 border-red-200', label: '保留' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: '公開中', color: 'bg-green-50 text-green-700 border-green-200' },
  developing: { label: '開発中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  prototype: { label: '試作中', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  stopped: { label: '停止中', color: 'bg-gray-100 text-gray-500 border-gray-200' },
  lost: { label: '消滅', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  unknown: { label: '不明', color: 'bg-gray-50 text-gray-500 border-gray-200' },
};

const typeIcons: Record<string, string> = {
  github: 'GH',
  netlify: 'NF',
  vercel: 'VC',
  cloudflare: 'CF',
  roblox: 'RBX',
  production: 'WEB',
  unknown: '?',
};

function getUrlType(url: string): string {
  if (url.includes('github.com') || url.includes('github.io')) return 'github';
  if (url.includes('netlify')) return 'netlify';
  if (url.includes('vercel')) return 'vercel';
  if (url.includes('workers.dev') || url.includes('pages.dev')) return 'cloudflare';
  if (url.includes('roblox.com')) return 'roblox';
  return 'production';
}

const DAY = 86400000;

/** 「14日前」「3か月前」のように、ひと目で古さが分かる形にする */
function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  if (days <= 0) return '今日';
  if (days === 1) return '昨日';
  if (days < 30) return `${days}日前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}か月前`;
  const years = Math.floor(days / 365);
  return `${years}年前`;
}

/** 新しいほど濃い色。放置されているものほど淡くなる */
function freshnessColor(iso: string): string {
  const days = (Date.now() - new Date(iso).getTime()) / DAY;
  if (days < 30) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (days < 90) return 'bg-sky-50 text-sky-800 border-sky-200';
  if (days < 180) return 'bg-slate-50 text-slate-600 border-slate-200';
  return 'bg-gray-50 text-gray-400 border-gray-200';
}

const dateSourceNote: Record<string, string> = {
  git: '最終コミット日',
  file: 'ソースファイルの更新日時（gitの記録がないため）',
  deploy: '公開先の最終公開日（ソースが手元に残っていないため）',
  remote: 'GitHubの最終push日（ローカルにクローンが無いため）',
  none: 'ローカルフォルダが見つからない',
};

export function ProjectCard({
  projectName, description, urls, reasoning,
  confidence, status, techStack, localFolder, noLocalSource,
  lastUpdated, dateSource, commitCount, recentCommits, activityScore, liveStatus,
  onLocalFolderChange,
}: ProjectCardProps) {
  const conf = confidenceConfig[confidence];
  const st = statusConfig[status] || statusConfig.unknown;
  const [editingFolder, setEditingFolder] = useState(false);
  const [folderValue, setFolderValue] = useState(localFolder || '');
  const [openState, setOpenState] = useState<'opening' | 'opened' | 'copied' | 'failed' | null>(null);
  const isLost = status === 'lost';

  // 押したらFinderで開く。ブラウザ単体では file:// が遮断されるので、
  // 手元で動いているサーバーの /api/open に開かせる。
  // サーバーが動いていない時だけ、パスのコピーに落とす。
  async function openFolder(path: string) {
    setOpenState('opening');
    // 同じオリジン（localhostで開いている場合）→ 手元のサーバー の順に試す
    const endpoints = [`${location.origin}/api/open`, 'http://localhost:3000/api/open'];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });
        if (res.ok) {
          setOpenState('opened');
          setTimeout(() => setOpenState(null), 1800);
          return;
        }
      } catch {
        // このエンドポイントは届かない。次を試す
      }
    }
    // どこにも届かなかった。せめてパスを写す
    let ok = false;
    try {
      await navigator.clipboard.writeText(path);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = path;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    setOpenState(ok ? 'copied' : 'failed');
    setTimeout(() => setOpenState(null), 4000);
  }

  function handleFolderSave() {
    onLocalFolderChange?.(folderValue);
    setEditingFolder(false);
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow ${isLost ? 'border-rose-100 opacity-70' : 'border-gray-200'}`}>
      <div className="flex flex-wrap items-start justify-between mb-3 gap-2">
        <h3 className={`text-lg font-bold ${isLost ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{projectName}</h3>
        <div className="flex flex-wrap gap-2">
          {typeof activityScore === 'number' && (
            <span
              className="px-2 py-0.5 rounded border border-gray-200 text-xs font-mono bg-gray-50 text-gray-500"
              title="活発さ 0-100（最終開発日の新しさ6割＋開発量4割）"
            >
              {activityScore}
            </span>
          )}
          <span className={`px-2 py-0.5 rounded border text-xs font-medium ${conf.color}`}>
            {conf.label}
          </span>
          <span className={`px-2 py-0.5 rounded border text-xs font-medium ${st.color}`}>
            {st.label}
          </span>
        </div>
      </div>

      {/* 最終開発日: 並び順の根拠なので、説明より先に見せる */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {lastUpdated ? (
          <>
            <span
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${freshnessColor(lastUpdated)}`}
              title={dateSourceNote[dateSource || 'none']}
            >
              最終開発 {lastUpdated.slice(0, 10)}（{relativeDays(lastUpdated)}）
            </span>
            {dateSource === 'git' && typeof commitCount === 'number' && commitCount > 0 && (
              <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 font-mono">
                {commitCount.toLocaleString()} コミット
                {typeof recentCommits === 'number' && recentCommits > 0 && (
                  <span className="text-emerald-600"> / 90日 {recentCommits}</span>
                )}
              </span>
            )}
            {dateSource === 'file' && (
              <span className="text-xs text-gray-400" title="gitの記録がないため、ソースファイルの更新日時を使っています">
                ※ファイル日時から推定
              </span>
            )}
            {dateSource === 'remote' && (
              <span className="text-xs text-orange-500" title="ローカルにクローンが無いため、GitHubの最終push日を使っています">
                ※GitHubのpush日から（ローカル未クローン）
              </span>
            )}
            {dateSource === 'deploy' && (
              <span className="text-xs text-orange-500" title="ソースが手元に残っていないため、公開先の最終公開日を使っています">
                ※公開日から（ソース未発見）
              </span>
            )}
          </>
        ) : (
          <span className="px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-400">
            最終開発日 不明
          </span>
        )}
      </div>

      {/* 公開先が落ちていたら見逃さないように赤帯を出す */}
      {liveStatus && !liveStatus.ok && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          ⚠ 公開先が応答しません（HTTP {liveStatus.code || '無応答'}
          {liveStatus.reason ? ` / ${liveStatus.reason}` : ''}）
          <span className="block text-xs text-red-500 font-mono mt-0.5 break-all">{liveStatus.url}</span>
        </div>
      )}

      <p className="text-gray-600 text-sm mb-4">{description}</p>

      {/* ローカルフォルダ: 最も重要な情報 */}
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-amber-700 font-medium shrink-0">📁 ローカル:</span>
          {editingFolder ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={folderValue}
                onChange={(e) => setFolderValue(e.target.value)}
                placeholder="~/Desktop/project-name"
                className="flex-1 px-2 py-1 border border-amber-300 rounded text-sm font-mono focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleFolderSave(); if (e.key === 'Escape') setEditingFolder(false); }}
              />
              <button onClick={handleFolderSave} className="text-xs text-amber-700 hover:text-amber-900 cursor-pointer font-medium">保存</button>
              <button onClick={() => setEditingFolder(false)} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">取消</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 min-w-0">
              {localFolder ? (
                <button
                  type="button"
                  onClick={() => openFolder(localFolder)}
                  title="クリックでFinderに表示します（手元でアプリが動いている必要があります）"
                  className="font-mono text-amber-900 break-words text-left hover:bg-amber-100 hover:underline rounded px-1 -mx-1 cursor-pointer transition-colors min-w-0 basis-full sm:basis-auto"
                >
                  {localFolder}
                </button>
              ) : noLocalSource ? (
                <span className="text-amber-600">ローカルにソースなし（探して見つからなかった）</span>
              ) : (
                <span className="text-amber-500 italic">未設定</span>
              )}
              {localFolder && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`cd "${localFolder}"`);
                      setOpenState('copied');
                    } catch {
                      setOpenState('failed');
                    }
                    setTimeout(() => setOpenState(null), 2500);
                  }}
                  title="ターミナルにそのまま貼れる cd コマンドをコピー"
                  className="text-xs text-amber-600 hover:text-amber-800 cursor-pointer shrink-0"
                >
                  cdをコピー
                </button>
              )}
              <button
                onClick={() => { setFolderValue(localFolder || ''); setEditingFolder(true); }}
                className="text-xs text-amber-600 hover:text-amber-800 cursor-pointer shrink-0"
              >
                {localFolder ? '変更' : '設定'}
              </button>
              {openState === 'opening' ? (
                <span className="text-xs text-gray-500 shrink-0">開いています…</span>
              ) : openState === 'opened' ? (
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5 shrink-0 whitespace-nowrap">
                  Finderで開きました
                </span>
              ) : openState === 'copied' ? (
                <span className="text-xs text-amber-700 bg-amber-100 border border-amber-300 rounded px-2 py-0.5 shrink-0">
                  アプリが動いていないのでパスをコピーしました
                </span>
              ) : openState === 'failed' ? (
                <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5 shrink-0">
                  開けませんでした
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* URL一覧 */}
      {urls.length > 0 ? (
        <div className="space-y-2 mb-4">
          {urls.map(({ url, role }) => {
            const urlType = getUrlType(url);
            return (
              <div key={url} className="flex items-center gap-2 text-sm">
                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs font-mono shrink-0">
                  {typeIcons[urlType]}
                </span>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs shrink-0">
                  {role}
                </span>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline truncate min-w-0"
                >
                  {url}
                </a>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-4">公開先なし（ローカルのみ）</p>
      )}

      {techStack && techStack.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {techStack.map(tech => (
            <span key={tech} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
              {tech}
            </span>
          ))}
        </div>
      )}

      <details className="text-sm text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700 select-none">
          判定理由を見る
        </summary>
        <p className="mt-2 pl-4 border-l-2 border-gray-200 text-gray-600">
          {reasoning}
        </p>
      </details>
    </div>
  );
}
