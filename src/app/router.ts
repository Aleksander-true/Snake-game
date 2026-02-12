export type Screen = 'menu' | 'game' | 'results';

export type ScreenChangeCallback = (screen: Screen, data?: unknown) => void;

/**
 * Simple screen router for the game.
 */
export class Router {
  private currentScreen: Screen = 'menu';
  private listeners: ScreenChangeCallback[] = [];

  getCurrentScreen(): Screen {
    return this.currentScreen;
  }

  navigate(screen: Screen, data?: unknown): void {
    this.currentScreen = screen;
    for (const listener of this.listeners) {
      listener(screen, data);
    }
  }

  onScreenChange(callback: ScreenChangeCallback): void {
    this.listeners.push(callback);
  }
}
