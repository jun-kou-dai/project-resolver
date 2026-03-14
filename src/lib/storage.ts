import type { GeminiResponse } from './types';

const STORAGE_KEY = 'project-resolver-data';

export interface SavedData {
  projects: GeminiResponse['projects'];
  ungrouped?: GeminiResponse['ungrouped'];
  lastUpdated: string;
  allUrls: string[]; // これまでに解析した全URL
}

export function loadSavedData(): SavedData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveData(data: SavedData): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function mergeUrls(existing: string[], newUrls: string[]): string[] {
  const set = new Set(existing);
  for (const url of newUrls) {
    set.add(url);
  }
  return Array.from(set);
}
