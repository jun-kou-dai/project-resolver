'use client';

import { useState, useEffect } from 'react';
import { ProjectCard } from './components/ProjectCard';
import { LoadingIndicator } from './components/LoadingIndicator';
import type { ResolveResponse } from '@/lib/types';
import { loadSavedData, saveData, clearData, mergeUrls, type SavedData } from '@/lib/storage';

// プロジェクトデータをGitHubに同期（バックグラウンド、失敗してもUIに影響なし）
function syncToGitHub(data: SavedData) {
  fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projects: data.projects }),
  }).catch(() => { /* sync failure is non-critical */ });
}

// URLスラッグからローカルフォルダパスを推測（Netlify等でサーバーがファイルシステムにアクセスできない場合のフォールバック）
function guessLocalFolder(urls: string[]): string | null {
  for (const url of urls) {
    try {
      const u = new URL(url);
      // Netlify: xxx-app.netlify.app → ~/Desktop/xxx
      if (u.hostname.endsWith('.netlify.app')) {
        const slug = u.hostname.replace('.netlify.app', '');
        // -app, -site, -web などの共通サフィックスを除去
        const cleaned = slug.replace(/-(app|site|web)$/, '');
        if (cleaned.length >= 2) return `~/Desktop/${cleaned}`;
      }
      // GitHub Pages: user.github.io/repo → ~/Desktop/repo
      if (u.hostname.endsWith('.github.io') && u.pathname.length > 1) {
        const repo = u.pathname.split('/').filter(Boolean)[0];
        if (repo) return `~/Desktop/${repo}`;
      }
      // GitHub: github.com/user/repo → ~/Desktop/repo
      if (u.hostname === 'github.com') {
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) return `~/Desktop/${parts[1]}`;
      }
      // Vercel: xxx.vercel.app → ~/Desktop/xxx
      if (u.hostname.endsWith('.vercel.app')) {
        const slug = u.hostname.replace('.vercel.app', '');
        const cleaned = slug.replace(/-(app|site|web)$/, '');
        if (cleaned.length >= 2) return `~/Desktop/${cleaned}`;
      }
    } catch { /* skip */ }
  }
  return null;
}

export default function Home() {
  const [saved, setSaved] = useState<SavedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // 起動時にpending-projects.json（GitHub経由で全デバイス共通）を読み込み
  useEffect(() => {
    fetch(`/pending-projects.json?t=${Date.now()}`)
      .then(res => res.ok ? res.json() : [])
      .then((projects: SavedData['projects']) => {
        if (projects && projects.length > 0) {
          const newSaved: SavedData = {
            projects,
            ungrouped: [],
            lastUpdated: new Date().toLocaleString('ja-JP'),
            allUrls: [],
          };
          saveData(newSaved);
          setSaved(newSaved);
        } else {
          // オフライン等でfetch失敗時はlocalStorageをフォールバック
          setSaved(loadSavedData());
        }
        setInitialized(true);
      })
      .catch(() => {
        setSaved(loadSavedData());
        setInitialized(true);
      });
  }, []);

  // localFolder未設定のプロジェクトがあれば自動マッチング
  useEffect(() => {
    if (!saved || saved.projects.length === 0) return;
    const hasUnmatched = saved.projects.some(p => !p.localFolder);
    if (!hasUnmatched) return;

    fetch('/api/match-folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects: saved.projects }),
    })
      .then(res => res.json())
      .then(({ matches }) => {
        // サーバー側マッチング結果を適用
        let serverMatches = matches || {};

        // サーバー側で結果0件の場合（Netlify等でファイルシステムアクセス不可）、
        // URLスラッグからフォルダパスを推測するフォールバック
        if (Object.keys(serverMatches).length === 0) {
          const heuristicMatches: Record<number, string> = {};
          for (let i = 0; i < saved.projects.length; i++) {
            const p = saved.projects[i];
            if (p.localFolder) continue;
            const guessed = guessLocalFolder(p.urls?.map(u => u.url) || []);
            if (guessed) heuristicMatches[i] = guessed;
          }
          serverMatches = heuristicMatches;
        }

        if (Object.keys(serverMatches).length === 0) return;
        const newProjects = saved.projects.map((p, i) =>
          serverMatches[i] ? { ...p, localFolder: serverMatches[i] } : p
        );
        const newSaved = { ...saved, projects: newProjects };
        saveData(newSaved);
        setSaved(newSaved);
      })
      .catch(() => { /* ignore */ });
  }, [saved?.projects.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const newUrls = urls.split(/[\n\r]+/).map(u => u.trim()).filter(Boolean);
      const newUrlsStr = newUrls.join('\n');

      const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: newUrlsStr }),
      });

      const data: ResolveResponse = await res.json();

      if (!data.success) {
        setError(data.error || '不明なエラー');
      } else if (data.data) {
        // 既存プロジェクトに新しいプロジェクトを追加（名前で重複排除）
        const existingProjects = saved?.projects || [];
        const existingNames = new Set(existingProjects.map(p => p.projectName));
        const addedProjects = data.data.projects.filter(p => !existingNames.has(p.projectName));
        const newSaved: SavedData = {
          projects: [...existingProjects, ...addedProjects],
          ungrouped: data.data.ungrouped,
          lastUpdated: new Date().toLocaleString('ja-JP'),
          allUrls: newUrls,
        };
        saveData(newSaved);
        setSaved(newSaved);
        syncToGitHub(newSaved);
        setUrls('');
        setShowAddForm(false);
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    if (confirm('保存済みのプロジェクトデータを全て削除しますか？')) {
      clearData();
      setSaved(null);
      syncToGitHub({ projects: [], ungrouped: [], lastUpdated: '', allUrls: [] });
    }
  }

  function handleDeleteProject(index: number) {
    if (!saved) return;
    const project = saved.projects[index];
    const removedUrls = project.urls.map(u => u.url);
    const newProjects = saved.projects.filter((_, i) => i !== index);
    const newAllUrls = saved.allUrls.filter(u => !removedUrls.includes(u));
    const newSaved: SavedData = {
      ...saved,
      projects: newProjects,
      allUrls: newAllUrls,
      lastUpdated: new Date().toLocaleString('ja-JP'),
    };
    saveData(newSaved);
    setSaved(newSaved);
    syncToGitHub(newSaved);
  }

  function handlePromoteUngrouped(url: string) {
    if (!saved) return;
    const name = prompt('プロジェクト名を入力してください：');
    if (!name) return;
    const description = prompt('説明（任意）：') || '';
    const newProject = {
      projectName: name,
      description,
      urls: [{ url, role: 'デプロイ済みサイト' }],
      reasoning: '手動登録',
      confidence: 'high' as const,
      status: 'active' as const,
      localFolder: undefined as string | undefined,
    };
    const newUngrouped = (saved.ungrouped || []).filter(u => u.url !== url);
    const newSaved: SavedData = {
      ...saved,
      projects: [...saved.projects, newProject],
      ungrouped: newUngrouped,
      lastUpdated: new Date().toLocaleString('ja-JP'),
    };
    saveData(newSaved);
    setSaved(newSaved);
    syncToGitHub(newSaved);
  }

  function handleAddLocalProject() {
    const name = prompt('プロジェクト名：');
    if (!name) return;
    const description = prompt('説明（任意）：') || '';
    const folder = prompt('ローカルフォルダパス（例: ~/Desktop/my-app）：');
    if (!folder) return;
    const newProject = {
      projectName: name,
      description,
      urls: [] as { url: string; role: string }[],
      reasoning: '手動登録（ローカルプロジェクト）',
      confidence: 'high' as const,
      status: 'developing' as const,
      localFolder: folder,
    };
    const current = saved || { projects: [], ungrouped: [], lastUpdated: '', allUrls: [] };
    const newSaved: SavedData = {
      ...current,
      projects: [...current.projects, newProject],
      lastUpdated: new Date().toLocaleString('ja-JP'),
    };
    saveData(newSaved);
    setSaved(newSaved);
    syncToGitHub(newSaved);
  }

  function handleLocalFolderChange(index: number, folder: string) {
    if (!saved) return;
    const newProjects = saved.projects.map((p, i) =>
      i === index ? { ...p, localFolder: folder || undefined } : p
    );
    const newSaved: SavedData = {
      ...saved,
      projects: newProjects,
    };
    saveData(newSaved);
    setSaved(newSaved);
  }

  if (!initialized) return null;

  const hasProjects = saved && saved.projects.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Project Resolver</h1>
            {saved?.lastUpdated && (
              <p className="text-xs text-gray-400">最終更新: {saved.lastUpdated}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hasProjects && (
              <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                {saved.projects.length}件のプロジェクト
              </span>
            )}
            <button
              onClick={handleAddLocalProject}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
            >
              + ローカル追加
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
            >
              + URL追加
            </button>
            {hasProjects && (
              <button
                onClick={handleClear}
                className="text-xs text-gray-400 hover:text-red-500 cursor-pointer"
              >
                全削除
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* URL追加フォーム */}
        {(showAddForm || !hasProjects) && (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {hasProjects ? 'URLを追加（既存プロジェクトとまとめて再解析します）' : 'URLを貼り付けて解析'}
              </label>
              <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="URLを1行に1つ貼り付け（GitHub, Netlify, Vercel, 本番URL など）"
                rows={hasProjects ? 3 : 6}
                className="w-full p-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                required
                disabled={loading}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              {hasProjects && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  キャンセル
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !urls.trim()}
                className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {loading ? '解析中...' : hasProjects ? 'URLを追加して再解析' : 'プロジェクトを解析'}
              </button>
            </div>
          </form>
        )}

        {loading && <LoadingIndicator />}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* メイン: プロジェクト一覧 */}
        {hasProjects ? (
          <div>
            <div className="grid gap-4">
              {saved.projects.map((project, i) => (
                <div key={i} className="relative group">
                  <ProjectCard
                    {...project}
                    onLocalFolderChange={(folder) => handleLocalFolderChange(i, folder)}
                  />
                  <button
                    onClick={() => handleDeleteProject(i)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500 transition-opacity cursor-pointer bg-white rounded px-2 py-1 border border-gray-200"
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>

            {saved.ungrouped && saved.ungrouped.length > 0 && (
              <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 p-5">
                <h3 className="font-medium text-gray-700 mb-3">
                  未分類のURL ({saved.ungrouped.length}件)
                </h3>
                <div className="space-y-2">
                  {saved.ungrouped.map(({ url, reason }) => (
                    <div key={url} className="text-sm flex items-center gap-2 flex-wrap">
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {url}
                      </a>
                      <span className="text-gray-400">— {reason}</span>
                      <button
                        onClick={() => handlePromoteUngrouped(url)}
                        className="ml-auto text-xs bg-blue-500 text-white px-3 py-1 rounded-full hover:bg-blue-600 transition-colors whitespace-nowrap"
                      >
                        プロジェクトに登録
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-center text-xs text-gray-400 mt-6">
              登録済みURL: {saved.allUrls.length}件
            </p>
          </div>
        ) : !loading && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-4">📂</p>
            <p className="text-lg mb-2">まだプロジェクトがありません</p>
            <p className="text-sm">上のフォームにURLを貼り付けて解析してください</p>
          </div>
        )}
      </div>
    </div>
  );
}
