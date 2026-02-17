/**
 * Storage adapter — handles localStorage persistence for dev settings.
 * Extracted from engine/settings.ts so that the Engine layer stays pure.
 */
import {
  gameSettings,
  settingsToJSON,
  applyJSONToSettings,
  GameDefaultsJSON,
} from '../../engine/settings';

const DEV_SETTINGS_KEY = 'snake-dev-settings';

/** Save current gameSettings to localStorage. */
export function saveSettingsToStorage(): void {
  const data = settingsToJSON();
  localStorage.setItem(DEV_SETTINGS_KEY, JSON.stringify(data));
}

/** Load settings from localStorage (if present). Returns true if loaded. */
export function loadSettingsFromStorage(): boolean {
  try {
    const rawSettingsJson = localStorage.getItem(DEV_SETTINGS_KEY);
    if (!rawSettingsJson) return false;
    const data: Partial<GameDefaultsJSON> = JSON.parse(rawSettingsJson);
    applyJSONToSettings(data);
    return true;
  } catch {
    return false;
  }
}

/** Clear dev settings from localStorage. */
export function clearSettingsStorage(): void {
  localStorage.removeItem(DEV_SETTINGS_KEY);
}
