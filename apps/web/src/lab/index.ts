import '../app/ui/styles';
import { resetSettings } from '@snake-game/core';
import { loadSettingsFromStorage } from '../app/adapters/storageAdapter';
import { GameLayoutBuilder } from '../app/ui/game-layout';
import { TrainingLabController } from '../training/TrainingLabController';
import { getDefaultTrainingLaunchConfig } from '../training/launchConfig';

const appRoot = document.getElementById('app');
if (!appRoot) {
  throw new Error('Root element #app not found');
}

resetSettings();
loadSettingsFromStorage();

const layout = new GameLayoutBuilder(appRoot).build(true);
const gameOuter = appRoot.querySelector('.game-outer');
gameOuter?.classList.add('training-lab-mode');

const previewPanel = layout.gameArea.querySelector<HTMLElement>('#hud-top');
if (!layout.devPanelContainer || !previewPanel) {
  throw new Error('Training lab layout is incomplete');
}

const lab = new TrainingLabController({
  canvas: layout.canvas,
  panel: layout.devPanelContainer,
  outputHost: layout.gameArea,
  previewPanel,
  initialConfig: getDefaultTrainingLaunchConfig(),
  onBack: () => { window.location.href = '../'; },
});
lab.mount();
