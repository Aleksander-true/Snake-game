import type { ArenaAlgorithm } from '../../arena/types';
import type { GameState, Snake, BotInput, BotDecision, Direction } from '../../engine/types';
import type { GameSettings } from '../../engine/settings';
import type { NeuralNetwork, NeuralNetworkTrace } from './simpleNetwork';

import { generateSingleChannelVision } from '../vision';
import { getBotDirection } from '../botController';
import { encodeObservation, type ObservationVersion } from '../encodeObservation';
import { getNetworkInputSize, runNeuralNetwork, traceNeuralNetwork } from './simpleNetwork';

export interface NeuralArenaAlgorithmOptions {
  id?: string;
  observationVersion?: ObservationVersion;
  network: NeuralNetwork;
  maxSnakeLengthForEncoding?: number;
  visionValueScale?: number;
  onTrace?: (trace: NeuralNetworkTrace) => void;
}

export function buildBotInput(
    state: GameState,
    snake: Snake,
    settings: GameSettings,
    previousDecision: BotDecision = 'front',
  ): BotInput {
    const snakeLength = snake.segments.length;
    const vision = generateSingleChannelVision(snake, state, settings);
    return {
        vision,
        snakeLength,
        satiety: snake.satiety,
        previousDecision,
    }
  }

export function chooseNeuralDecision(
    botInput: BotInput,
    settings: GameSettings,
    options: NeuralArenaAlgorithmOptions
  ): BotDecision {
    const {maxSnakeLengthForEncoding, visionValueScale, network} = options
    const netInput = encodeObservation(
        botInput, 
        {
            observationVersion: options.observationVersion,
            maxSnakeLengthForEncoding,
            visionValueScale,
        })
    const networkInputSize = getNetworkInputSize(network);
    if (networkInputSize !== netInput.length) {
      throw new Error(`Neural network input size mismatch: encoded observation has length ${netInput.length}, but network input size is ${networkInputSize}`)
    }
    const traced = options.onTrace ? traceNeuralNetwork(netInput, network) : null;
    const botDecision = traced?.output ?? runNeuralNetwork(netInput, network);
    if (traced) options.onTrace?.(traced);
    return botDecision.action;
  }

export function chooseNeuralDirection(
    state: GameState,
    snake: Snake,
    settings: GameSettings,
    options: NeuralArenaAlgorithmOptions,
    previousDecision: BotDecision = 'front',
  ): Direction {
    const botInput = buildBotInput(state, snake, settings, previousDecision);
    const decision = chooseNeuralDecision(botInput, settings, options);
    return getBotDirection(snake.direction, decision);
  }

export function createNeuralArenaAlgorithm(
    options: NeuralArenaAlgorithmOptions
  ): ArenaAlgorithm {
    const id = options.id ?? "neural-simple-v1";
    const previousDecisionByState = new WeakMap<GameState, Map<number, BotDecision>>();
    const chooseDirection = (state: GameState, snake: Snake , settings: GameSettings) => {
      if (!snake.alive) {
        return snake.direction;
      }
      let previousDecisionBySnakeId = previousDecisionByState.get(state);
      if (!previousDecisionBySnakeId) {
        previousDecisionBySnakeId = new Map<number, BotDecision>();
        previousDecisionByState.set(state, previousDecisionBySnakeId);
      }
      const botInput = buildBotInput(
        state,
        snake,
        settings,
        previousDecisionBySnakeId.get(snake.id) ?? 'front',
      );
      const decision = chooseNeuralDecision(botInput, settings, options);
      previousDecisionBySnakeId.set(snake.id, decision);
      return getBotDirection(snake.direction, decision);
    };

    return {
      id,
      chooseDirection,
    }
  }
