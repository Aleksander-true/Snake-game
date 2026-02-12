import './app/ui/styles.css';
import { Router } from './app/router';
import { renderMenu } from './app/ui/menuView';
import { GameConfig } from './engine/types';

const app = document.getElementById('app')!;
const router = new Router();

function init(): void {
  router.onScreenChange((screen) => {
    switch (screen) {
      case 'menu':
        showMenu();
        break;
      case 'game':
        // Will be implemented in Stage 3
        app.innerHTML = '<p style="color:#0f0; padding:40px;">Game screen — coming soon!</p>';
        break;
      case 'results':
        app.innerHTML = '<p style="color:#0f0; padding:40px;">Results screen — coming soon!</p>';
        break;
    }
  });

  showMenu();
}

function showMenu(): void {
  renderMenu(app, (config: GameConfig) => {
    console.log('Starting game with config:', config);
    router.navigate('game', config);
  });
}

init();
