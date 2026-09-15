import type { DevPanelSessionConfig } from '../ui/dev-panel';

/**
 * Lazy-loads and mounts the dev panel UI.
 */
export class DevPanelLoader {
  mount(
    container: HTMLElement,
    initialLevel: number,
    sessionConfig: DevPanelSessionConfig,
    onApplyLevel: (level: number) => void
  ): void {
    import('../ui/dev-panel').then(({ renderDevPanel }) => {
      renderDevPanel(container, initialLevel, sessionConfig, onApplyLevel);
    });
  }
}
