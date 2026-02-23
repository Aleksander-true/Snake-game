import { ScoreRecord } from '../engine/types';

const STORAGE_KEY = 'snake-food-scores';
const NAMES_KEY = 'snake-food-names';

/**
 * Save a score record to localStorage.
 */
export function saveScore(record: ScoreRecord): void {
  const scores = getScores();
  scores.push(record);
  scores.sort((a, b) => b.score - a.score);
  // Keep top 50
  const trimmed = scores.slice(0, 50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/**
 * Get all score records from localStorage.
 */
export function getScores(): ScoreRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data) as ScoreRecord[];
  } catch {
    return [];
  }
}

/**
 * Clear all scores.
 */
export function clearScores(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// --- Player name storage ---

/**
 * Save a player name to localStorage (deduplicates, keeps last 20).
 */
export function saveName(name: string): void {
  if (!name.trim()) return;
  const names = getSavedNames();
  const filtered = names.filter(savedName => savedName !== name.trim());
  filtered.unshift(name.trim());
  const trimmed = filtered.slice(0, 20);
  localStorage.setItem(NAMES_KEY, JSON.stringify(trimmed));
}

/**
 * Get all saved player names from localStorage.
 */
export function getSavedNames(): string[] {
  try {
    const data = localStorage.getItem(NAMES_KEY);
    if (!data) return [];
    return JSON.parse(data) as string[];
  } catch {
    return [];
  }
}
