'use client';

import { useState } from 'react';

interface ProjectCardProps {
  projectName: string;
  description: string;
  urls: Array<{ url: string; role: string }>;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  status: 'active' | 'developing' | 'prototype' | 'stopped' | 'unknown';
  techStack?: string[];
  localFolder?: string | null;
  onLocalFolderChange?: (folder: string) => void;
}

const confidenceConfig = {
  high: { color: 'bg-green-100 text-green-800 border-green-200', label: '確定' },
  medium: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: '有力候補' },
  low: { color: 'bg-red-100 text-red-800 border-red-200', label: '保留' },
};

const statusLabels: Record<string, string> = {
  active: '公開中',
  developing: '開発中',
  prototype: '試作中',
  stopped: '停止中',
  unknown: '不明',
};

const typeIcons: Record<string, string> = {
  github: 'GH',
  netlify: 'NF',
  vercel: 'VC',
  production: 'WEB',
  unknown: '?',
};

function getUrlType(url: string): string {
  if (url.includes('github.com') || url.includes('github.io')) return 'github';
  if (url.includes('netlify')) return 'netlify';
  if (url.includes('vercel')) return 'vercel';
  return 'production';
}

export function ProjectCard({
  projectName, description, urls, reasoning,
  confidence, status, techStack, localFolder, onLocalFolderChange,
}: ProjectCardProps) {
  const conf = confidenceConfig[confidence];
  const [editingFolder, setEditingFolder] = useState(false);
  const [folderValue, setFolderValue] = useState(localFolder || '');

  function handleFolderSave() {
    onLocalFolderChange?.(folderValue);
    setEditingFolder(false);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3 gap-2">
        <h3 className="text-lg font-bold text-gray-900">{projectName}</h3>
        <div className="flex gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded border text-xs font-medium ${conf.color}`}>
            {conf.label}
          </span>
          <span className="px-2 py-0.5 rounded border border-gray-200 text-xs font-medium bg-gray-50 text-gray-700">
            {statusLabels[status] || status}
          </span>
        </div>
      </div>

      <p className="text-gray-600 text-sm mb-4">{description}</p>

      {/* ローカルフォルダ: 最も重要な情報 */}
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2 text-sm">
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
            <div className="flex items-center gap-2 flex-1">
              {localFolder ? (
                <span className="font-mono text-amber-900">{localFolder}</span>
              ) : (
                <span className="text-amber-500 italic">未設定</span>
              )}
              <button
                onClick={() => { setFolderValue(localFolder || ''); setEditingFolder(true); }}
                className="text-xs text-amber-600 hover:text-amber-800 cursor-pointer"
              >
                {localFolder ? '変更' : '設定'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* URL一覧 */}
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
                className="text-blue-600 hover:underline truncate"
              >
                {url}
              </a>
            </div>
          );
        })}
      </div>

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
