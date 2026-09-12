import type { NeuralNetworkTrace } from '@snake-game/core';

interface LayerView {
  cells: HTMLElement[];
  title: string;
}

const OUTPUT_ACTIONS = [
  { action: 'left', label: 'Влево', arrow: '←', index: 0 },
  { action: 'front', label: 'Прямо', arrow: '↑', index: 1 },
  { action: 'right', label: 'Вправо', arrow: '→', index: 2 },
] as const;

/** Renders the latest neural-network activations without affecting bot decisions. */
export class TrainingNetworkVisualizer {
  private topologyKey = '';
  private vision: LayerView | null = null;
  private extraInputs: LayerView | null = null;
  private hiddenLayers: LayerView[] = [];
  private outputs: HTMLElement[] = [];

  constructor(private readonly host: HTMLElement) {
    this.host.classList.add('training-network-panel');
    this.host.setAttribute('aria-label', 'Живая визуализация нейросети');
  }

  showTopology(topology: number[]): void {
    const key = topology.join(',');
    if (this.topologyKey === key) return;
    this.topologyKey = key;
    this.host.replaceChildren();

    const heading = document.createElement('h2');
    heading.className = 'training-network-title';
    heading.textContent = 'Нейросеть';
    this.host.appendChild(heading);

    const inputSize = topology[0] ?? 0;
    const visionCount = Math.max(0, inputSize - 2);
    const visionSide = Math.sqrt(visionCount);
    const visionColumns = Number.isInteger(visionSide)
      ? visionSide
      : Math.ceil(Math.sqrt(Math.max(1, visionCount)));
    this.vision = this.createLayer('Зрение', visionCount, visionColumns, 'vision');
    this.extraInputs = this.createExtraInputs();
    this.hiddenLayers = topology.slice(1, -1).map((size, index) => (
      this.createLayer(
        `Скрытый слой ${index + 1}`,
        size,
        Math.ceil(Math.sqrt(size)),
        'hidden',
      )
    ));
    this.outputs = this.createOutputs();
  }

  render(trace: NeuralNetworkTrace): void {
    this.updateLayer(this.vision, trace.input.subarray(0, this.vision?.cells.length ?? 0));
    this.updateLayer(this.extraInputs, trace.input.subarray(Math.max(0, trace.input.length - 2)));
    this.hiddenLayers.forEach((layer, index) => {
      this.updateLayer(layer, trace.layerValues[index] ?? new Float32Array());
    });
    const scores = trace.output.scores;
    OUTPUT_ACTIONS.forEach(({ index }, position) => {
      const cell = this.outputs[position];
      if (!cell) return;
      const value = scores[index] ?? 0;
      this.updateCell(cell, value, `Выход ${OUTPUT_ACTIONS[position].label}`);
      cell.classList.toggle('training-network-output--selected', index === trace.output.actionIndex);
    });
  }

  reset(): void {
    this.topologyKey = '';
    this.vision = null;
    this.extraInputs = null;
    this.hiddenLayers = [];
    this.outputs = [];
    this.host.replaceChildren();
    const heading = document.createElement('h2');
    heading.className = 'training-network-title';
    heading.textContent = 'Нейросеть';
    const message = document.createElement('p');
    message.className = 'training-network-empty';
    message.textContent = 'Ожидание чемпиона…';
    this.host.append(heading, message);
  }

  private createLayer(
    title: string,
    size: number,
    columns: number,
    kind: 'vision' | 'hidden',
  ): LayerView {
    const section = document.createElement('section');
    section.className = 'training-network-layer';
    const heading = document.createElement('h3');
    heading.className = 'training-network-layer-title';
    heading.textContent = title;
    const grid = document.createElement('div');
    grid.className = `training-network-grid training-network-grid--${kind}`;
    grid.style.setProperty('--network-grid-columns', String(Math.max(1, columns)));
    const cells = Array.from({ length: size }, (_, index) => {
      const cell = document.createElement('span');
      cell.className = 'training-network-cell';
      cell.setAttribute('aria-hidden', 'true');
      this.updateCell(cell, 0, `${title} ${index + 1}`);
      grid.appendChild(cell);
      return cell;
    });
    section.append(heading, grid);
    this.host.appendChild(section);
    return { cells, title };
  }

  private createExtraInputs(): LayerView {
    const section = document.createElement('section');
    section.className = 'training-network-extra-inputs';
    const labels = ['Длина', 'Голод'];
    const cells = labels.map((label) => {
      const item = document.createElement('div');
      item.className = 'training-network-extra-input';
      const caption = document.createElement('span');
      caption.textContent = label;
      const cell = document.createElement('span');
      cell.className = 'training-network-cell training-network-cell--extra';
      this.updateCell(cell, 0, label);
      item.append(caption, cell);
      section.appendChild(item);
      return cell;
    });
    this.host.appendChild(section);
    return { cells, title: 'Вход' };
  }

  private createOutputs(): HTMLElement[] {
    const section = document.createElement('section');
    section.className = 'training-network-layer training-network-output-layer';
    const heading = document.createElement('h3');
    heading.className = 'training-network-layer-title';
    heading.textContent = 'Выход';
    const grid = document.createElement('div');
    grid.className = 'training-network-outputs';
    const cells = OUTPUT_ACTIONS.map(({ action, label, arrow }) => {
      const cell = document.createElement('span');
      cell.className = `training-network-output training-network-output--${action}`;
      cell.dataset.action = action;
      cell.textContent = arrow;
      this.updateCell(cell, 0, `Выход ${label}`);
      grid.appendChild(cell);
      return cell;
    });
    section.append(heading, grid);
    this.host.appendChild(section);
    return cells;
  }

  private updateLayer(layer: LayerView | null, values: Float32Array): void {
    if (!layer) return;
    layer.cells.forEach((cell, index) => {
      this.updateCell(cell, values[index] ?? 0, `${layer.title} ${index + 1}`);
    });
  }

  private updateCell(cell: HTMLElement, value: number, label: string): void {
    cell.style.setProperty('--activation-color', activationColor(value));
    cell.title = `${label}: ${formatActivation(value)}`;
    if (cell.getAttribute('aria-hidden') !== 'true') cell.setAttribute('aria-label', cell.title);
  }
}

function activationColor(value: number): string {
  const strength = 1 - Math.exp(-Math.abs(value));
  const faded = Math.round(255 * (1 - strength));
  if (value > 0) return `rgb(${faded}, 255, ${faded})`;
  if (value < 0) return `rgb(255, ${faded}, ${faded})`;
  return 'rgb(255, 255, 255)';
}

function formatActivation(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '—';
}
