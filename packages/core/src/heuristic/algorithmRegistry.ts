import { Direction, GameState, Snake } from '../engine/types';
import { GameSettings } from '../engine/settings';
import { HeuristicAlgorithm } from './types';
import { chooseDirectionByProfile, getSkillProfileById, wiseHeuristic } from './greedyBoardHeuristic';

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
  [wiseHeuristic.id]: wiseHeuristic,
  'rookie': {
    id: 'rookie',
    chooseDirection: (state, snake, settings) => chooseDirectionByProfile(state, snake, settings, getSkillProfileById(settings, 'rookie')),
  },
  'basic': {
    id: 'basic',
    chooseDirection: (state, snake, settings) => chooseDirectionByProfile(state, snake, settings, getSkillProfileById(settings, 'basic')),
  },
  'solid': {
    id: 'solid',
    chooseDirection: (state, snake, settings) => chooseDirectionByProfile(state, snake, settings, getSkillProfileById(settings, 'solid')),
  },
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
  { id: 'wise', label: 'Wise (сложность 9-10)' },
  { id: 'solid', label: 'Solid (сложность 7-8)' },
  { id: 'basic', label: 'Basic (сложность 4-6)' },
  { id: 'rookie', label: 'Rookie (сложность 1-3)' },
  { id: 'keep-direction', label: 'Без поворотов' },
  { id: 'always-up', label: 'Всегда вверх' },
  { id: 'always-down', label: 'Всегда вниз' },
  { id: 'always-left', label: 'Всегда влево' },
  { id: 'always-right', label: 'Всегда вправо' },
];

export function getHeuristicAlgorithmById(id: string): HeuristicAlgorithm {
  return registry[id] ?? wiseHeuristic;
}

