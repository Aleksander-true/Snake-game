import type { GameSnapshotDTO, NetworkDirection } from '@snake-game/contracts';
import {
  createDefaultSettings,
  getCumulativeTargetScore,
  type GameMode,
  type GameState,
  type Snake,
} from '@snake-game/core';
import { calculateCellSize, renderGame } from '../../renderer/canvasRenderer';
import { getDeadSnakeColor } from '../../shared/color';
import { MultiplayerSnapshotProjector } from '../../multiplayer/MultiplayerSnapshotProjector';
import { GameLayoutBuilder } from '../ui/game-layout';

const NETWORK_KEYS: Record<string, NetworkDirection> = {
  KeyW: 'up',
  KeyA: 'left',
  KeyS: 'down',
  KeyD: 'right',
  ArrowUp: 'up',
  ArrowLeft: 'left',
  ArrowDown: 'down',
  ArrowRight: 'right',
};

/** Owns the network game DOM and renders projected server snapshots without running Engine. */
export class MultiplayerGamePresenter {
  private readonly settings = createDefaultSettings();
  private readonly projector = new MultiplayerSnapshotProjector();
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private localSnakeId: number | null = null;
  private inputEnabled = false;
  private directionHandler: ((direction: NetworkDirection) => void) | null = null;
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  private touchCleanup: (() => void) | null = null;
  private dimensions = '';

  constructor(private readonly appRoot: HTMLElement) {}

  showSnapshot(
    snapshot: GameSnapshotDTO,
    playerId: string,
    gameMode: GameMode,
    onDirection: (direction: NetworkDirection) => void
  ): void {
    if (!this.canvas) this.build(onDirection);
    this.inputEnabled = snapshot.status === 'playing';
    this.localSnakeId = snapshot.snakes.find(
      (snake) => snake.controller.controllerId === playerId
    )?.snakeId ?? null;
    const state = this.projector.reconcile(snapshot, playerId, gameMode);
    this.render(state, snapshot.status);
  }

  predict(sequence: number, direction: NetworkDirection): void {
    const state = this.projector.predict(sequence, direction);
    if (state) this.render(state, 'playing');
  }

  showConnectionStatus(message: string, isError = false): void {
    const bar = this.appRoot.querySelector<HTMLElement>('#hud-top .hud-bar');
    if (!bar) return;
    const previous = bar.querySelector('.multiplayer-connection-status');
    previous?.remove();
    const status = document.createElement('span');
    status.className = isError
      ? 'multiplayer-connection-status hud-paused'
      : 'multiplayer-connection-status';
    status.textContent = message;
    bar.appendChild(status);
  }

  stop(): void {
    if (this.keydownHandler) document.removeEventListener('keydown', this.keydownHandler);
    this.touchCleanup?.();
    this.projector.reset();
    this.canvas = null;
    this.context = null;
    this.localSnakeId = null;
    this.inputEnabled = false;
    this.directionHandler = null;
    this.keydownHandler = null;
    this.touchCleanup = null;
    this.dimensions = '';
  }

  private build(onDirection: (direction: NetworkDirection) => void): void {
    const layout = new GameLayoutBuilder(this.appRoot).build(false);
    layout.gameArea.classList.add('multiplayer-game');
    this.canvas = layout.canvas;
    this.context = layout.canvas.getContext('2d');
    if (!this.context) throw new Error('Не удалось открыть Canvas для сетевой игры');
    this.directionHandler = onDirection;
    this.bindKeyboard();
    this.bindTouch(layout.gameArea);
  }

  private bindKeyboard(): void {
    this.keydownHandler = (event) => {
      const direction = NETWORK_KEYS[event.code];
      if (!direction || event.repeat || !this.inputEnabled) return;
      event.preventDefault();
      this.directionHandler?.(direction);
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  private bindTouch(gameArea: HTMLElement): void {
    const controls = gameArea.querySelector<HTMLElement>('#touch-controls-single');
    const duoControls = gameArea.querySelector<HTMLElement>('#touch-controls-duo');
    duoControls?.classList.remove('touch-controls-duo--visible');
    if (!controls || !isTouchDevice()) return;
    controls.classList.add('touch-controls-single--visible');
    const listeners: Array<() => void> = [];
    for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-dir]')) {
      const direction = button.dataset.dir as NetworkDirection;
      const listener = () => {
        if (this.inputEnabled) this.directionHandler?.(direction);
      };
      button.addEventListener('click', listener);
      listeners.push(() => button.removeEventListener('click', listener));
    }
    this.touchCleanup = () => listeners.forEach((dispose) => dispose());
  }

  private render(state: GameState, status: GameSnapshotDTO['status']): void {
    if (!this.canvas || !this.context) return;
    this.resizeCanvas(state);
    const cellSize = Number(this.canvas.dataset.cellSize) || 10;
    renderGame(this.context, state, cellSize, this.settings);
    this.renderHud(state, status);
  }

  private resizeCanvas(state: GameState): void {
    if (!this.canvas) return;
    const dimensions = `${state.width}:${state.height}:${state.gameMode}`;
    if (dimensions === this.dimensions) return;
    this.dimensions = dimensions;
    const sidePanelsWidth = 312;
    const maxWidth = Math.min(window.innerWidth - sidePanelsWidth - 40, 900);
    const maxHeight = Math.min(window.innerHeight - 120, 700);
    const survivalWidth = this.settings.baseWidth
      + (this.settings.survivalMaxBoardLevel - 1) * this.settings.levelSizeIncrement;
    const survivalHeight = this.settings.baseHeight
      + (this.settings.survivalMaxBoardLevel - 1) * this.settings.levelSizeIncrement;
    const widthInCells = state.gameMode === 'survival' ? survivalWidth : state.width;
    const heightInCells = state.gameMode === 'survival' ? survivalHeight : state.height;
    const cellSize = calculateCellSize(widthInCells, heightInCells, maxWidth, maxHeight);
    this.canvas.width = widthInCells * cellSize;
    this.canvas.height = heightInCells * cellSize;
    this.canvas.dataset.cellSize = String(cellSize);
  }

  private renderHud(state: GameState, status: GameSnapshotDTO['status']): void {
    const topBar = document.getElementById('hud-top');
    const localPanel = document.getElementById('hud-left');
    const secondLocalSection = document.getElementById('hud-right')
      ?.closest<HTMLElement>('.game-player-section');
    const othersPanel = document.getElementById('hud-bottom');
    if (!topBar || !localPanel || !othersPanel) return;

    secondLocalSection?.setAttribute('hidden', '');
    const localSnake = state.snakes.find((snake) => snake.id === this.localSnakeId);
    const others = state.snakes.filter((snake) => snake.id !== this.localSnakeId);
    const localTitle = localPanel.closest('.game-player-section')?.querySelector('.game-hud-title');
    if (localTitle) localTitle.textContent = 'Ваша змейка';
    const othersTitle = othersPanel.closest('.game-bots-panel')?.querySelector('.game-hud-title');
    if (othersTitle) othersTitle.textContent = 'Соперники и боты';

    topBar.replaceChildren(createHudBar(state, status, this.settings));
    renderSnakeCards(localPanel, localSnake ? [localSnake] : [], this.settings.snakeColors);
    renderSnakeCards(othersPanel, others, this.settings.snakeColors);
  }
}

function createHudBar(
  state: GameState,
  status: GameSnapshotDTO['status'],
  settings: ReturnType<typeof createDefaultSettings>
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'hud-bar';
  const minutes = Math.floor(state.levelTimeLeft / 60);
  const seconds = state.levelTimeLeft % 60;
  const values = [
    `Уровень: ${state.level}`,
    `Цель: ${getCumulativeTargetScore(state.level, settings)}`,
    `Время: ${minutes}:${seconds.toString().padStart(2, '0')}`,
    `Тик: ${state.tickCount}`,
    matchStatusLabel(status),
  ];
  for (const value of values) {
    const item = document.createElement('span');
    item.textContent = value;
    bar.appendChild(item);
  }
  return bar;
}

function renderSnakeCards(container: HTMLElement, snakes: Snake[], colors: string[]): void {
  container.replaceChildren();
  for (const snake of snakes) {
    const card = document.createElement('div');
    card.className = 'hud-snake-stats';
    const baseColor = colors[snake.id % colors.length];
    card.style.setProperty('--hud-snake-color', snake.alive ? baseColor : getDeadSnakeColor(baseColor));
    const status = snake.alive ? 'Жив' : (snake.deathReason || 'Мёртв');
    for (const line of [
      snake.name,
      `Очки: ${snake.score}`,
      `Длина: ${snake.segments.length}`,
      `Победы: ${snake.levelsWon}`,
      status,
    ]) {
      const row = document.createElement('div');
      row.textContent = line;
      if (line === snake.name) {
        const strong = document.createElement('strong');
        strong.textContent = line;
        row.replaceChildren(strong);
      }
      card.appendChild(row);
    }
    container.appendChild(card);
  }
}

function matchStatusLabel(status: GameSnapshotDTO['status']): string {
  switch (status) {
    case 'waiting': return 'Ожидание игроков';
    case 'playing': return 'Сетевая игра';
    case 'round-complete': return 'Раунд завершён';
    case 'game-complete': return 'Игра завершена';
  }
}

function isTouchDevice(): boolean {
  return 'ontouchstart' in window
    || navigator.maxTouchPoints > 0
    || window.matchMedia('(pointer: coarse)').matches;
}
