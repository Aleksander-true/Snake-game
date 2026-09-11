import type { GeneticTrainingCheckpoint } from '@snake-game/core';

const TRAINING_DATABASE_NAME = 'snake-genetic-training';
const TRAINING_DATABASE_VERSION = 1;
const CHECKPOINT_STORE_NAME = 'checkpoints';

export interface TrainingCheckpointRepository {
  save(checkpoint: GeneticTrainingCheckpoint): Promise<void>;
  get(runId: string): Promise<GeneticTrainingCheckpoint | null>;
  list(): Promise<GeneticTrainingCheckpoint[]>;
  delete(runId: string): Promise<void>;
}

/** Persists large resumable populations without using the localStorage quota. */
export class IndexedDbTrainingCheckpointRepository implements TrainingCheckpointRepository {
  constructor(private readonly indexedDb: IDBFactory = indexedDB) {}

  async save(checkpoint: GeneticTrainingCheckpoint): Promise<void> {
    validateCheckpoint(checkpoint);
    const database = await this.openDatabase();
    await completeTransaction(database, 'readwrite', (store) => store.put(checkpoint));
    database.close();
  }

  async get(runId: string): Promise<GeneticTrainingCheckpoint | null> {
    const database = await this.openDatabase();
    const value = await requestValue<GeneticTrainingCheckpoint | undefined>(
      database.transaction(CHECKPOINT_STORE_NAME, 'readonly')
        .objectStore(CHECKPOINT_STORE_NAME)
        .get(runId),
    );
    database.close();
    return value ?? null;
  }

  async list(): Promise<GeneticTrainingCheckpoint[]> {
    const database = await this.openDatabase();
    const checkpoints = await requestValue<GeneticTrainingCheckpoint[]>(
      database.transaction(CHECKPOINT_STORE_NAME, 'readonly')
        .objectStore(CHECKPOINT_STORE_NAME)
        .getAll(),
    );
    database.close();
    return checkpoints
      .filter(isCheckpoint)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async delete(runId: string): Promise<void> {
    const database = await this.openDatabase();
    await completeTransaction(database, 'readwrite', (store) => store.delete(runId));
    database.close();
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.indexedDb.open(TRAINING_DATABASE_NAME, TRAINING_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(CHECKPOINT_STORE_NAME)) {
          database.createObjectStore(CHECKPOINT_STORE_NAME, { keyPath: 'runId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open training database'));
    });
  }
}

function completeTransaction(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  mutate: (store: IDBObjectStore) => IDBRequest,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CHECKPOINT_STORE_NAME, mode);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error ?? new Error('Training checkpoint transaction failed'),
    );
    transaction.onabort = transaction.onerror;
    mutate(transaction.objectStore(CHECKPOINT_STORE_NAME));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Training checkpoint request failed'));
  });
}

function validateCheckpoint(checkpoint: GeneticTrainingCheckpoint): void {
  if (!isCheckpoint(checkpoint)) throw new Error('Invalid training checkpoint');
}

function isCheckpoint(value: unknown): value is GeneticTrainingCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const checkpoint = value as Partial<GeneticTrainingCheckpoint>;
  return checkpoint.formatVersion === 1
    && typeof checkpoint.runId === 'string'
    && Number.isInteger(checkpoint.nextGeneration)
    && Array.isArray(checkpoint.population)
    && Array.isArray(checkpoint.reports)
    && !!checkpoint.config;
}
