import type {
  GameSnapshotDTO,
  NetworkDirection,
  RoomSnapshotDTO,
} from '@snake-game/contracts';
import {
  createDefaultSettings,
  getCumulativeTargetScore,
  getOverallWinner,
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
  private lastState: GameState | null = null;
  private roundPanel: HTMLElement | null = null;
  private roundTitle: HTMLElement | null = null;
  private roundSummary: HTMLElement | null = null;
  private roundParticipants: HTMLElement | null = null;
  private roundAction: HTMLButtonElement | null = null;
  private readyHandler: (() => void) | null = null;
  private exitHandler: (() => void) | null = null;

  constructor(private readonly appRoot: HTMLElement) {}

  showSnapshot(
    snapshot: GameSnapshotDTO,
    playerId: string,
    gameMode: GameMode,
    onDirection: (direction: NetworkDirection) => void,
    onReady: () => void,
    onExit: () => void
  ): void {
    if (!this.canvas) this.build(onDirection);
    this.readyHandler = onReady;
    this.exitHandler = onExit;
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

  isActive(): boolean {
    return this.canvas !== null;
  }

  showRoomState(
    room: RoomSnapshotDTO,
    playerId: string,
    onReady: () => void,
    onExit: () => void
  ): void {
    if (!this.roundPanel) return;
    this.readyHandler = onReady;
    this.exitHandler = onExit;
    if (room.status === 'playing' || room.status === 'waiting') {
      this.hideRoundPanel();
      return;
    }
    if (room.status === 'game-complete') {
      this.showGameCompletePanel();
      return;
    }

    this.roundPanel.classList.remove('multiplayer-hidden');
    if (this.roundTitle) this.roundTitle.textContent = `Раунд ${room.currentRound} завершён`;
    if (this.roundSummary) {
      this.roundSummary.textContent = 'Следующий раунд начнётся, когда все игроки будут готовы.';
    }
    this.renderParticipantReadiness(room, playerId);
    const self = room.participants.find((participant) => participant.playerId === playerId);
    if (this.roundAction) {
      this.roundAction.hidden = false;
      this.roundAction.disabled = self?.status === 'ready';
      this.roundAction.textContent = self?.status === 'ready'
        ? 'Готово — ожидаем остальных'
        : 'Играть следующий раунд';
      if (!this.roundAction.disabled) this.roundAction.focus();
    }
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
    this.lastState = null;
    this.roundPanel = null;
    this.roundTitle = null;
    this.roundSummary = null;
    this.roundParticipants = null;
    this.roundAction = null;
    this.readyHandler = null;
    this.exitHandler = null;
  }

  private build(onDirection: (direction: NetworkDirection) => void): void {
    const layout = new GameLayoutBuilder(this.appRoot).build(false);
    layout.gameArea.classList.add('multiplayer-game');
    this.canvas = layout.canvas;
    this.context = layout.canvas.getContext('2d');
    if (!this.context) throw new Error('Не удалось открыть Canvas для сетевой игры');
    this.directionHandler = onDirection;
    this.buildRoundPanel(layout.gameArea);
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
    this.lastState = state;
    this.renderHud(state, status);
    if (status === 'round-complete') this.showRoundSnapshotPlaceholder(state.level);
    if (status === 'game-complete') this.showGameCompletePanel();
  }

  private buildRoundPanel(gameArea: HTMLElement): void {
    const panel = document.createElement('section');
    panel.className = 'multiplayer-round-panel multiplayer-hidden';
    panel.setAttribute('aria-live', 'polite');
    const title = document.createElement('h2');
    const summary = document.createElement('p');
    const participants = document.createElement('div');
    participants.className = 'multiplayer-round-participants';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn btn-primary';
    action.addEventListener('click', () => {
      if (action.dataset.action === 'exit') {
        this.exitHandler?.();
        return;
      }
      action.disabled = true;
      action.textContent = 'Готово — ожидаем остальных';
      this.readyHandler?.();
    });
    panel.append(title, summary, participants, action);
    gameArea.appendChild(panel);
    this.roundPanel = panel;
    this.roundTitle = title;
    this.roundSummary = summary;
    this.roundParticipants = participants;
    this.roundAction = action;
  }

  private showRoundSnapshotPlaceholder(level: number): void {
    if (!this.roundPanel || !this.roundAction) return;
    this.roundPanel.classList.remove('multiplayer-hidden');
    if (this.roundTitle) this.roundTitle.textContent = `Раунд ${level} завершён`;
    if (this.roundSummary) this.roundSummary.textContent = 'Получаем статусы игроков…';
    this.roundParticipants?.replaceChildren();
    this.roundAction.dataset.action = 'ready';
    this.roundAction.hidden = false;
    this.roundAction.disabled = true;
    this.roundAction.textContent = 'Подождите…';
  }

  private showGameCompletePanel(): void {
    if (!this.roundPanel || !this.roundAction) return;
    this.roundPanel.classList.remove('multiplayer-hidden');
    if (this.roundTitle) this.roundTitle.textContent = 'Сетевая игра завершена';
    if (this.roundSummary) this.roundSummary.textContent = buildWinnerSummary(this.lastState);
    if (this.roundParticipants) {
      this.roundParticipants.replaceChildren();
      const ranking = [...(this.lastState?.snakes ?? [])].sort(compareSnakes);
      ranking.forEach((snake, index) => {
        const row = document.createElement('div');
        row.className = 'multiplayer-round-participant';
        const name = document.createElement('span');
        name.textContent = `${index + 1}. ${snake.name}`;
        const score = document.createElement('span');
        score.textContent = `${snake.levelsWon} побед · ${snake.score} очков`;
        row.append(name, score);
        this.roundParticipants?.appendChild(row);
      });
    }
    this.roundAction.dataset.action = 'exit';
    this.roundAction.hidden = false;
    this.roundAction.disabled = false;
    this.roundAction.textContent = 'Вернуться в меню';
    this.roundAction.focus();
  }

  private renderParticipantReadiness(room: RoomSnapshotDTO, playerId: string): void {
    if (!this.roundParticipants || !this.roundAction) return;
    this.roundParticipants.replaceChildren();
    for (const participant of [...room.participants].sort((left, right) => left.slotIndex - right.slotIndex)) {
      const row = document.createElement('div');
      row.className = 'multiplayer-round-participant';
      const name = document.createElement('span');
      name.textContent = `${participant.name}${participant.playerId === playerId ? ' (вы)' : ''}`;
      const status = document.createElement('span');
      status.textContent = participant.status === 'ready'
        ? 'Готов'
        : participant.status === 'replaced-by-bot' ? 'Бот готов' : 'Ожидаем';
      row.append(name, status);
      this.roundParticipants.appendChild(row);
    }
    this.roundAction.dataset.action = 'ready';
  }

  private hideRoundPanel(): void {
    this.roundPanel?.classList.add('multiplayer-hidden');
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

function compareSnakes(left: Snake, right: Snake): number {
  return right.levelsWon - left.levelsWon || right.score - left.score || left.id - right.id;
}

function buildWinnerSummary(state: GameState | null): string {
  if (!state || state.snakes.length === 0) return 'Итоговый результат получен от сервера.';
  const winner = getOverallWinner(state.snakes);
  if (winner) {
    return `Победитель: ${winner.name} — ${winner.levelsWon} побед и ${winner.score} очков.`;
  }
  const ranking = [...state.snakes].sort(compareSnakes);
  const leaders = ranking.filter(
    (snake) => snake.levelsWon === ranking[0].levelsWon && snake.score === ranking[0].score
  );
  return `Ничья: ${leaders.map((snake) => snake.name).join(', ')}.`;
}

function isTouchDevice(): boolean {
  return 'ontouchstart' in window
    || navigator.maxTouchPoints > 0
    || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
}
