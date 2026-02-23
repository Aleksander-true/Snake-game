import { Direction, GameState, Snake } from '../engine/types';
import { GameSettings } from '../engine/settings';

export interface HeuristicAlgorithm {
  id: string;
  chooseDirection: (state: GameState, snake: Snake, settings: GameSettings) => Direction;
}

