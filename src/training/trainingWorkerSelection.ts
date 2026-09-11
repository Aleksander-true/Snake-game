export type TrainingWorkerSelection = 'automatic' | 'manual';

export function resolveTrainingWorkerCount(
  selection: TrainingWorkerSelection,
  manualCount: number,
  hardwareConcurrency: number = navigator.hardwareConcurrency,
): number {
  const available = Number.isInteger(hardwareConcurrency) && hardwareConcurrency > 0
    ? hardwareConcurrency
    : 2;
  const maximum = Math.max(1, available - 1);
  if (selection === 'manual') {
    return Math.max(1, Math.min(maximum, Math.floor(manualCount)));
  }
  return Math.max(1, available - 2);
}
