import { GameState } from '../../engine/types';
import { GameSettings } from '../../engine/settings';
import { renderHUD } from '../ui/game';

/**
 * Responsible only for reading HUD DOM nodes and rendering their content.
 */
export class HudPresenter {
  render(state: GameState, paused: boolean, settings: GameSettings): void {
    const topBarElement = document.getElementById('hud-top');
    const leftPanelElement = document.getElementById('hud-left');
    const rightPanelElement = document.getElementById('hud-right');
    const bottomPanelElement = document.getElementById('hud-bottom');

    if (!topBarElement) return;

    renderHUD(
      topBarElement,
      leftPanelElement,
      rightPanelElement,
      bottomPanelElement,
      state,
      paused,
      settings
    );
  }
}
