import { GameState } from '../../engine/types';
import { GameSettings } from '../../engine/settings';
import { renderHUD } from '../ui/game';

/**
 * Responsible only for reading HUD DOM nodes and rendering their content.
 */
export class HudPresenter {
  render(state: GameState, paused: boolean, settings: GameSettings, onFastForward: () => void): void {
    const topBarElement = document.getElementById('hud-top');
    const player1PanelElement = document.getElementById('hud-left');
    const player2PanelElement = document.getElementById('hud-right');
    const botsPanelElement = document.getElementById('hud-bottom');

    if (!topBarElement) return;

    renderHUD(
      topBarElement,
      player1PanelElement,
      player2PanelElement,
      botsPanelElement,
      state,
      paused,
      settings,
      onFastForward
    );
  }
}
