import { ScoreRecord } from '../engine/types';

const STORAGE_KEY = 'snake-eats-rabbits-scores';

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
