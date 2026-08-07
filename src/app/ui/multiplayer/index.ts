import type {
  PublicRoomSummaryDTO,
  RoomConfigDTO,
  RoomSnapshotDTO,
} from '@snake-game/contracts';
import defaults from './multiplayerDefaults.json';

export interface MultiplayerRoomDraft {
  creatorName: string;
  config: RoomConfigDTO;
}

export interface MultiplayerLobbyCallbacks {
  onRefresh: () => void;
  onJoinPublic: (roomId: string, playerName: string) => void;
  onJoinPrivate: (privateCode: string, playerName: string) => void;
  onCreate: (draft: MultiplayerRoomDraft) => void;
  onReady: () => void;
  onBack: () => void;
}

export interface MultiplayerLobbyView {
  showStatus(message: string, isError?: boolean): void;
  showRooms(rooms: PublicRoomSummaryDTO[]): void;
  showRoom(room: RoomSnapshotDTO, playerId: string, privateCode?: string): void;
  showGameTick(tick: number): void;
}

/** Render the network lobby without owning HTTP or WebSocket state. */
export function renderMultiplayerLobby(
  container: HTMLElement,
  callbacks: MultiplayerLobbyCallbacks
): MultiplayerLobbyView {
  container.innerHTML = `
    <main class="multiplayer-screen">
      <header class="multiplayer-header">
        <button id="multiplayerBackBtn" type="button" class="btn btn-secondary">← В меню</button>
        <h1 class="multiplayer-title">Сетевая игра</h1>
        <button id="multiplayerRefreshBtn" type="button" class="btn btn-secondary">Обновить</button>
      </header>

      <p id="multiplayerStatus" class="multiplayer-status" role="status">Подключение к серверу…</p>

      <section id="multiplayerBrowser" class="multiplayer-browser">
        <section class="multiplayer-panel multiplayer-rooms-panel">
          <h2>Публичные комнаты</h2>
          <label class="multiplayer-field">
            <span>Ваше имя</span>
            <input id="multiplayerJoinName" class="input-field input-text" maxlength="30" value="${defaults.playerName}">
          </label>
          <div id="multiplayerRooms" class="multiplayer-room-list"></div>

          <div class="multiplayer-private-join">
            <label class="multiplayer-field">
              <span>Код приватной комнаты</span>
              <input id="multiplayerPrivateCode" class="input-field input-text" maxlength="8" autocomplete="off">
            </label>
            <button id="multiplayerPrivateJoinBtn" type="button" class="btn btn-primary btn-small">Войти по коду</button>
          </div>
        </section>

        <section class="multiplayer-panel">
          <h2>Создать комнату</h2>
          <form id="multiplayerCreateForm" class="multiplayer-create-form">
            <label class="multiplayer-field"><span>Ваше имя</span><input id="multiplayerCreatorName" class="input-field input-text" maxlength="30" value="${defaults.playerName}"></label>
            <label class="multiplayer-field"><span>Название</span><input id="multiplayerRoomName" class="input-field input-text" maxlength="50" value="${defaults.roomName}"></label>
            <label class="multiplayer-field"><span>Доступ</span><select id="multiplayerVisibility" class="input-field input-select"><option value="public"${defaults.visibility === 'public' ? ' selected' : ''}>Публичная</option><option value="private"${defaults.visibility === 'private' ? ' selected' : ''}>Приватная</option></select></label>
            <label class="multiplayer-field"><span>Мест игроков</span><input id="multiplayerHumanSlots" class="input-field input-number" type="number" min="1" max="6" value="${defaults.humanSlots}"></label>
            <label class="multiplayer-field"><span>Ботов</span><input id="multiplayerBotCount" class="input-field input-number" type="number" min="0" max="5" value="${defaults.botCount}"></label>
            <label class="multiplayer-checkbox"><input id="multiplayerReplaceableBots" type="checkbox"${defaults.replaceableBots ? ' checked' : ''}><span>Игроки могут заменять ботов между раундами</span></label>
            <label class="multiplayer-field"><span>Сложность</span><input id="multiplayerDifficulty" class="input-field input-number" type="number" min="1" max="10" value="${defaults.difficultyLevel}"></label>
            <label class="multiplayer-field"><span>Режим</span><select id="multiplayerGameMode" class="input-field input-select"><option value="classic"${defaults.gameMode === 'classic' ? ' selected' : ''}>Классика</option><option value="survival"${defaults.gameMode === 'survival' ? ' selected' : ''}>Выживание</option></select></label>
            <button type="submit" class="btn btn-primary">Создать</button>
          </form>
        </section>
      </section>

      <section id="multiplayerRoom" class="multiplayer-panel multiplayer-current-room multiplayer-hidden">
        <div id="multiplayerRoomSummary"></div>
        <div id="multiplayerParticipants" class="multiplayer-participants"></div>
        <button id="multiplayerReadyBtn" type="button" class="btn btn-primary">Играть</button>
      </section>
    </main>
  `;

  const status = requireElement<HTMLElement>(container, '#multiplayerStatus');
  const roomList = requireElement<HTMLElement>(container, '#multiplayerRooms');
  const browser = requireElement<HTMLElement>(container, '#multiplayerBrowser');
  const currentRoom = requireElement<HTMLElement>(container, '#multiplayerRoom');
  const roomSummary = requireElement<HTMLElement>(container, '#multiplayerRoomSummary');
  const participants = requireElement<HTMLElement>(container, '#multiplayerParticipants');
  const readyButton = requireElement<HTMLButtonElement>(container, '#multiplayerReadyBtn');
  let currentPlayerId = '';

  requireElement(container, '#multiplayerBackBtn').addEventListener('click', callbacks.onBack);
  requireElement(container, '#multiplayerRefreshBtn').addEventListener('click', callbacks.onRefresh);
  requireElement(container, '#multiplayerPrivateJoinBtn').addEventListener('click', () => {
    callbacks.onJoinPrivate(
      readText(container, '#multiplayerPrivateCode').toUpperCase(),
      readText(container, '#multiplayerJoinName')
    );
  });
  requireElement<HTMLFormElement>(container, '#multiplayerCreateForm').addEventListener('submit', (event) => {
    event.preventDefault();
    callbacks.onCreate(readRoomDraft(container));
  });
  readyButton.addEventListener('click', callbacks.onReady);

  return {
    showStatus(message: string, isError = false): void {
      status.textContent = message;
      status.classList.toggle('multiplayer-status--error', isError);
    },
    showRooms(rooms: PublicRoomSummaryDTO[]): void {
      roomList.replaceChildren();
      if (rooms.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'multiplayer-empty';
        empty.textContent = 'Доступных публичных комнат пока нет.';
        roomList.appendChild(empty);
        return;
      }
      for (const room of rooms) {
        const row = document.createElement('article');
        row.className = 'multiplayer-room-row';
        const description = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = room.name;
        const details = document.createElement('span');
        details.textContent = `${room.connectedHumans}/${room.humanSlots} игроков · ${room.botSlots} ботов · ${roomStatusLabel(room.status)}`;
        description.append(title, details);
        const joinButton = document.createElement('button');
        joinButton.type = 'button';
        joinButton.className = 'btn btn-primary btn-small';
        joinButton.textContent = room.canJoin ? 'Войти' : 'Недоступно';
        joinButton.disabled = !room.canJoin;
        joinButton.addEventListener('click', () => {
          callbacks.onJoinPublic(room.roomId, readText(container, '#multiplayerJoinName'));
        });
        row.append(description, joinButton);
        roomList.appendChild(row);
      }
    },
    showRoom(room: RoomSnapshotDTO, playerId: string, privateCode?: string): void {
      currentPlayerId = playerId;
      browser.classList.add('multiplayer-hidden');
      currentRoom.classList.remove('multiplayer-hidden');
      roomSummary.replaceChildren();
      const title = document.createElement('h2');
      title.textContent = room.config.name;
      const meta = document.createElement('p');
      meta.textContent = `Раунд ${room.currentRound || 1} · ${room.participants.length}/${room.config.humanSlots} игроков · ${room.config.bots.length} ботов · ${room.config.gameMode === 'survival' ? 'Выживание' : 'Классика'} · сложность ${room.config.difficultyLevel}`;
      roomSummary.append(title, meta);
      if (privateCode) {
        const code = document.createElement('p');
        code.className = 'multiplayer-private-code';
        code.textContent = `Код комнаты: ${privateCode}`;
        roomSummary.appendChild(code);
      }

      participants.replaceChildren();
      for (const participant of [...room.participants].sort((left, right) => left.slotIndex - right.slotIndex)) {
        const row = document.createElement('div');
        row.className = 'multiplayer-participant';
        const name = document.createElement('span');
        name.textContent = `${participant.name}${participant.playerId === currentPlayerId ? ' (вы)' : ''}`;
        const participantStatus = document.createElement('span');
        participantStatus.textContent = participantStatusLabel(participant.status);
        row.append(name, participantStatus);
        participants.appendChild(row);
      }
      const self = room.participants.find((participant) => participant.playerId === currentPlayerId);
      readyButton.disabled = self?.status === 'ready'
        || room.status === 'playing'
        || room.status === 'game-complete';
      readyButton.textContent = self?.status === 'ready' ? 'Готово' : 'Играть';
    },
    showGameTick(tick: number): void {
      status.textContent = `Матч запущен, серверный тик ${tick}. Подключение игрового поля — следующий этап.`;
      status.classList.remove('multiplayer-status--error');
    },
  };
}

function readRoomDraft(container: HTMLElement): MultiplayerRoomDraft {
  const humanSlots = clamp(readNumber(container, '#multiplayerHumanSlots'), 1, 6);
  const botCount = clamp(readNumber(container, '#multiplayerBotCount'), 0, 6 - humanSlots);
  const replaceable = requireElement<HTMLInputElement>(container, '#multiplayerReplaceableBots').checked;
  return {
    creatorName: readText(container, '#multiplayerCreatorName'),
    config: {
      name: readText(container, '#multiplayerRoomName'),
      visibility: readText(container, '#multiplayerVisibility') === 'private' ? 'private' : 'public',
      humanSlots,
      bots: Array.from({ length: botCount }, () => ({
        replaceableByPlayerBetweenRounds: replaceable,
      })),
      difficultyLevel: clamp(readNumber(container, '#multiplayerDifficulty'), 1, 10),
      gameMode: readText(container, '#multiplayerGameMode') === 'survival' ? 'survival' : 'classic',
    },
  };
}

function participantStatusLabel(status: RoomSnapshotDTO['participants'][number]['status']): string {
  switch (status) {
    case 'connected': return 'Подключён';
    case 'ready': return 'Готов';
    case 'reconnecting': return 'Переподключается';
    case 'replaced-by-bot': return 'Заменён ботом';
  }
}

function roomStatusLabel(status: PublicRoomSummaryDTO['status']): string {
  switch (status) {
    case 'waiting': return 'ожидание';
    case 'round-complete': return 'между раундами';
    case 'playing': return 'идёт игра';
    case 'game-complete': return 'игра завершена';
  }
}

function readText(container: HTMLElement, selector: string): string {
  return requireElement<HTMLInputElement | HTMLSelectElement>(container, selector).value.trim();
}

function readNumber(container: HTMLElement, selector: string): number {
  return Number.parseInt(readText(container, selector), 10) || 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function requireElement<T extends Element = HTMLElement>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Multiplayer element not found: ${selector}`);
  return element;
}
