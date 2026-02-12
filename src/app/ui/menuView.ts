import { GameConfig } from '../../engine/types';

/**
 * Render the main menu and return config on start.
 */
export function renderMenu(
  container: HTMLElement,
  onStart: (config: GameConfig) => void
): void {
  container.innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <h1 style="color: #0f0; font-size: 2.5em; margin-bottom: 30px;">🐍 Snake Eats Rabbits 🐇</h1>

      <div style="display: inline-block; text-align: left; background: #111; padding: 30px; border-radius: 12px; border: 1px solid #333;">
        <label style="display: block; margin: 10px 0;">
          Players (0-2): <input type="number" id="playerCount" min="0" max="2" value="1" style="width:60px; background:#222; color:#fff; border:1px solid #555; padding:4px;">
        </label>
        <label style="display: block; margin: 10px 0;">
          Bots (0-4): <input type="number" id="botCount" min="0" max="4" value="0" style="width:60px; background:#222; color:#fff; border:1px solid #555; padding:4px;">
        </label>
        <label style="display: block; margin: 10px 0;">
          Player 1 name: <input type="text" id="player1Name" value="Player 1" style="background:#222; color:#fff; border:1px solid #555; padding:4px;">
        </label>
        <label style="display: block; margin: 10px 0;">
          Player 2 name: <input type="text" id="player2Name" value="Player 2" style="background:#222; color:#fff; border:1px solid #555; padding:4px;">
        </label>
        <label style="display: block; margin: 10px 0;">
          Difficulty (1-10): <input type="number" id="difficulty" min="1" max="10" value="5" style="width:60px; background:#222; color:#fff; border:1px solid #555; padding:4px;">
        </label>
        <button id="startBtn" style="margin-top: 20px; padding: 12px 40px; font-size: 1.2em; background: #0a0; color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
          START
        </button>
      </div>
    </div>
  `;

  const startBtn = container.querySelector('#startBtn') as HTMLButtonElement;
  startBtn.addEventListener('click', () => {
    const playerCount = parseInt((container.querySelector('#playerCount') as HTMLInputElement).value) || 0;
    const botCount = parseInt((container.querySelector('#botCount') as HTMLInputElement).value) || 0;
    const player1Name = (container.querySelector('#player1Name') as HTMLInputElement).value || 'Player 1';
    const player2Name = (container.querySelector('#player2Name') as HTMLInputElement).value || 'Player 2';
    const difficulty = parseInt((container.querySelector('#difficulty') as HTMLInputElement).value) || 5;

    const config: GameConfig = {
      playerCount: Math.min(2, Math.max(0, playerCount)),
      botCount: Math.min(4, Math.max(0, botCount)),
      playerNames: [player1Name, player2Name],
      difficultyLevel: Math.min(10, Math.max(1, difficulty)),
    };

    onStart(config);
  });
}
