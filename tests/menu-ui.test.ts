import { renderMenu } from '../src/app/ui/menu';
import { getMenuPreferences, saveMenuPreferences } from '../src/storage/scoreStorage';

describe('menu UI persistence and availability', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  test('restores last selected menu values from localStorage', () => {
    saveMenuPreferences({
      playerCount: 1,
      botCount: 2,
      difficultyLevel: 7,
      gameMode: 'survival',
      player1Name: 'Иван',
      player2Name: 'Пётр',
    });

    const root = document.createElement('div');
    renderMenu(root, jest.fn());

    expect((root.querySelector('#playerCount') as HTMLInputElement).value).toBe('1');
    expect((root.querySelector('#botCount') as HTMLInputElement).value).toBe('2');
    expect((root.querySelector('#difficulty') as HTMLInputElement).value).toBe('7');
    expect((root.querySelector('#gameMode') as HTMLSelectElement).value).toBe('survival');
    expect((root.querySelector('#player1Name') as HTMLInputElement).value).toBe('Иван');
    expect((root.querySelector('#player2Name') as HTMLInputElement).value).toBe('Пётр');
  });

  test('disables player name fields according to player count', () => {
    const root = document.createElement('div');
    renderMenu(root, jest.fn());

    const playerCountInput = root.querySelector('#playerCount') as HTMLInputElement;
    const player1NameInput = root.querySelector('#player1Name') as HTMLInputElement;
    const player2NameInput = root.querySelector('#player2Name') as HTMLInputElement;

    playerCountInput.value = '1';
    playerCountInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(player1NameInput.disabled).toBe(false);
    expect(player2NameInput.disabled).toBe(true);

    playerCountInput.value = '0';
    playerCountInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(player1NameInput.disabled).toBe(true);
    expect(player2NameInput.disabled).toBe(true);

    playerCountInput.value = '2';
    playerCountInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(player1NameInput.disabled).toBe(false);
    expect(player2NameInput.disabled).toBe(false);
  });

  test('updates saved menu preferences when fields change', () => {
    const root = document.createElement('div');
    renderMenu(root, jest.fn());

    const playerCountInput = root.querySelector('#playerCount') as HTMLInputElement;
    const botCountInput = root.querySelector('#botCount') as HTMLInputElement;
    const difficultyInput = root.querySelector('#difficulty') as HTMLInputElement;
    const modeInput = root.querySelector('#gameMode') as HTMLSelectElement;
    const player1NameInput = root.querySelector('#player1Name') as HTMLInputElement;
    const player2NameInput = root.querySelector('#player2Name') as HTMLInputElement;

    playerCountInput.value = '2';
    botCountInput.value = '3';
    difficultyInput.value = '9';
    modeInput.value = 'survival';
    player1NameInput.value = 'Алиса';
    player2NameInput.value = 'Боб';

    modeInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(getMenuPreferences()).toEqual({
      playerCount: 2,
      botCount: 3,
      difficultyLevel: 9,
      gameMode: 'survival',
      player1Name: 'Алиса',
      player2Name: 'Боб',
    });
  });
});

