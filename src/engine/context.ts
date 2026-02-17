/**
 * EngineContext — dependency injection container for the Engine layer.
 * Passed to all engine functions instead of importing singletons.
 * Tests can supply seeded RNG and custom settings without DOM mocks.
 */
import { GameSettings } from './settings';
import { RandomPort } from './ports';

export interface EngineContext {
  /** Runtime game settings (read-only from engine's perspective during a tick). */
  settings: GameSettings;
  /** Random number generator — all randomness must go through this. */
  rng: RandomPort;
}
