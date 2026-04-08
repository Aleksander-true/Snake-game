import type { ArenaAlgorithm } from '../../arena/types';
import type { GameState, Snake, BotInput, BotDecision, Direction } from '../../engine/types';
import type { GameSettings } from '../../engine/settings';
import type { SimpleNetwork } from './simpleNetwork';

import { generateVision } from '../vision';
import { getBotDirection } from '../botController';
import { encodeObservation } from '../encodeObservation';
import { runSimpleNetwork } from './simpleNetwork';

export interface NeuralArenaAlgorithmOptions {
  id?: string;
  network: SimpleNetwork;
  maxSnakeLengthForEncoding?: number;
  visionValueScale?: number;
}

export function buildBotInput(
    state: GameState,
    snake: Snake,
    settings: GameSettings
  ): BotInput {
    const snakeLength = snake.segments.length;
    const snakeHead = snake.head;
    const snakeDirection = snake.direction;

    const vision = generateVision(snakeHead, snakeDirection, state, settings);
    const ticksWithoutFood = snake.ticksWithoutFood;
    return {
        vision,
        snakeLength,
        ticksWithoutFood,
    }
  }

export function chooseNeuralDecision(
    botInput: BotInput,
    settings: GameSettings,
    options: NeuralArenaAlgorithmOptions
  ): BotDecision {
    const {hungerThreshold} = settings
    const {maxSnakeLengthForEncoding, visionValueScale, network} = options
    const netInput = encodeObservation(
        botInput, 
        {
            hungerThreshold,
            maxSnakeLengthForEncoding,
            visionValueScale
        })
    if (network.hiddenLayer.inputSize !== netInput.length) {
      throw new Error(`Neural network input size mismatch: encoded observation has length ${netInput.length}, but hiddenLayer.inputSize is ${network.hiddenLayer.inputSize}`)
    }
    const botDecision = runSimpleNetwork(netInput, network);
    return botDecision.action;
  }

export function chooseNeuralDirection(
    state: GameState,
    snake: Snake,
    settings: GameSettings,
    options: NeuralArenaAlgorithmOptions
  ): Direction {
    const botInput = buildBotInput(state, snake, settings);
    const decision = chooseNeuralDecision(botInput, settings, options);
    return getBotDirection(snake.direction, decision);
  }

export function createNeuralArenaAlgorithm(
    options: NeuralArenaAlgorithmOptions
  ): ArenaAlgorithm {
    const id = options.id ?? "neural-simple-v1";
    const chooseDirection = (state: GameState, snake: Snake , settings: GameSettings) => {
      if (!snake.alive) {
        return snake.direction;
      }
      return chooseNeuralDirection(state, snake, settings, options);
    };

    return {
      id,
      chooseDirection,
    }
  }