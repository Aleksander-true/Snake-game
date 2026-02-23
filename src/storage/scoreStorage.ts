import { ScoreRecord } from '../engine/types';

const STORAGE_KEY = 'snake-food-scores';
const NAMES_KEY = 'snake-food-names';
const MENU_PREFS_KEY = 'snake-menu-prefs';

export interface MenuPreferences {
  playerCount: number;
  botCount: number;
  difficultyLevel: number;
  gameMode: 'classic' | 'survival';
  player1Name: string;
  player2Name: string;
}

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

/**
 * Save last selected menu parameters.
 * Used in main menu to restore players/bots counts, names, difficulty and mode.
 */
export function saveMenuPreferences(preferences: MenuPreferences): void {
  localStorage.setItem(MENU_PREFS_KEY, JSON.stringify(preferences));
}

/**
 * Load last selected menu parameters.
 * Returns null when no saved data exists or payload is invalid.
 */
export function getMenuPreferences(): MenuPreferences | null {
  try {
    const raw = localStorage.getItem(MENU_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MenuPreferences>;
    if (
      typeof parsed.playerCount !== 'number' ||
      typeof parsed.botCount !== 'number' ||
      typeof parsed.difficultyLevel !== 'number' ||
      (parsed.gameMode !== 'classic' && parsed.gameMode !== 'survival') ||
      typeof parsed.player1Name !== 'string' ||
      typeof parsed.player2Name !== 'string'
    ) {
      return null;
    }
    return parsed as MenuPreferences;
  } catch {
    return null;
  }
}
