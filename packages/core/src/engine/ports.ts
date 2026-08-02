/**
 * Port interfaces for Engine layer dependencies.
 * Engine never imports concrete implementations — only these interfaces.
 */

/** Random number generator port. All randomness in Engine goes through this. */
export interface RandomPort {
  /** Returns a pseudo-random number in [0, 1). */
  next(): number;
  /** Returns a pseudo-random integer in [0, max). */
  nextInt(max: number): number;
}
