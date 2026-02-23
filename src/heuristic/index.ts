export { greedyBoardHeuristic, chooseGreedyBoardDirection, rankDirectionsForDebug } from './greedyBoardHeuristic';
export type { HeuristicAlgorithm } from './types';
export { heuristicAlgorithmOptions, getHeuristicAlgorithmById } from './algorithmRegistry';
export {
  runArenaSimulation,
  runArenaBatch,
} from './arena/headlessArena';
export type {
  ArenaParticipant,
  ArenaRunConfig,
  ArenaRunResult,
  ArenaBatchConfig,
  ArenaBatchResult,
  ArenaSnakeStats,
} from './arena/headlessArena';
export {
  createArenaDemoController,
} from './arena/demoArena';
export type {
  ArenaDemoOptions,
  ArenaDemoController,
} from './arena/demoArena';

