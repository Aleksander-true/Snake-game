import { Direction, GameState, Snake } from '../engine/types';
import { GameSettings } from '../engine/settings';
import { HeuristicAlgorithm } from './types';
import { greedyBoardHeuristic } from './greedyBoardHeuristic';

function makeConstantDirectionAlgorithm(id: string, direction: Direction): HeuristicAlgorithm {
  return {
    id,
    chooseDirection: (_state: GameState, _snake: Snake, _settings: GameSettings) => direction,
  };
}

function makeKeepDirectionAlgorithm(): HeuristicAlgorithm {
  return {
    id: 'keep-direction',
    chooseDirection: (_state: GameState, snake: Snake, _settings: GameSettings) => snake.direction,
  };
}

const registry: Record<string, HeuristicAlgorithm> = {
  [greedyBoardHeuristic.id]: greedyBoardHeuristic,
  'always-up': makeConstantDirectionAlgorithm('always-up', 'up'),
  'always-down': makeConstantDirectionAlgorithm('always-down', 'down'),
  'always-left': makeConstantDirectionAlgorithm('always-left', 'left'),
  'always-right': makeConstantDirectionAlgorithm('always-right', 'right'),
  'keep-direction': makeKeepDirectionAlgorithm(),
};

export interface AlgorithmOption {
  id: string;
  label: string;
}

export const heuristicAlgorithmOptions: AlgorithmOption[] = [
  { id: 'greedy-board-v1', label: 'Жадный full-board (v1)' },
  { id: 'keep-direction', label: 'Без поворотов' },
  { id: 'always-up', label: 'Всегда вверх' },
  { id: 'always-down', label: 'Всегда вниз' },
  { id: 'always-left', label: 'Всегда влево' },
  { id: 'always-right', label: 'Всегда вправо' },
];

export function getHeuristicAlgorithmById(id: string): HeuristicAlgorithm {
  return registry[id] ?? greedyBoardHeuristic;
}

