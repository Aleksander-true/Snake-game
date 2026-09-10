import type { BotDecision } from '../../engine/types';
import type { RandomPort } from '../../engine/ports';

export interface DenseLayer {
  inputSize: number;
  outputSize: number;
  weights: Float32Array;
  bias: Float32Array;
}

export interface DenseNetwork {
  layers: DenseLayer[];
}

/** Kept for existing callers while training uses DenseNetwork. */
export interface SimpleNetwork {
  hiddenLayer: DenseLayer;
  outputLayer: DenseLayer;
}

export type NeuralNetwork = DenseNetwork | SimpleNetwork;

export interface NetworkOutput {
  scores: Float32Array;
  actionIndex: number;
  action: BotDecision;
}

export function actionIndexToDecision(actionIndex: number): BotDecision {
  switch (actionIndex) {
    case 0:
      return 'left';
    case 1:
      return 'front';
    case 2:
      return 'right';
    default:
      throw new Error(`Unknown action index: ${actionIndex}`);
  }
}

export function argmax(values: Float32Array): number {
  if (values.length === 0) throw new Error('argmax requires a non-empty array');
  let bestIndex = 0;
  for (let index = 1; index < values.length; index++) {
    if (values[index] > values[bestIndex]) bestIndex = index;
  }
  return bestIndex;
}

export function tanh(value: number): number {
  return Math.tanh(value);
}

export function applyTanh(values: Float32Array): Float32Array {
  const results = new Float32Array(values.length);
  for (let index = 0; index < values.length; index++) results[index] = tanh(values[index]);
  return results;
}

export function createRandomLayer(
  inputSize: number,
  outputSize: number,
  rng: RandomPort,
  randomScale = 0.1,
): DenseLayer {
  if (!Number.isInteger(inputSize) || inputSize <= 0) {
    throw new Error(`inputSize must be a positive integer, got ${inputSize}`);
  }
  if (!Number.isInteger(outputSize) || outputSize <= 0) {
    throw new Error(`outputSize must be a positive integer, got ${outputSize}`);
  }
  const weights = new Float32Array(inputSize * outputSize);
  const bias = new Float32Array(outputSize);
  for (let index = 0; index < weights.length; index++) {
    weights[index] = rng.next() * randomScale * 2 - randomScale;
  }
  return { inputSize, outputSize, weights, bias };
}

export function forwardDense(input: Float32Array, layer: DenseLayer): Float32Array {
  if (input.length !== layer.inputSize) {
    throw new Error(`Input length ${input.length} does not match layer inputSize ${layer.inputSize}`);
  }
  const result = new Float32Array(layer.outputSize);
  for (let outputIndex = 0; outputIndex < layer.outputSize; outputIndex++) {
    let sum = layer.bias[outputIndex];
    for (let inputIndex = 0; inputIndex < layer.inputSize; inputIndex++) {
      sum += input[inputIndex] * layer.weights[outputIndex * layer.inputSize + inputIndex];
    }
    result[outputIndex] = sum;
  }
  return result;
}

export function createDenseNetwork(
  inputSize: number,
  hiddenSizes: number[],
  outputSize: number,
  rng: RandomPort,
  randomScale = 0.1,
): DenseNetwork {
  const topology = [inputSize, ...hiddenSizes, outputSize];
  return {
    layers: topology.slice(1).map((size, index) =>
      createRandomLayer(topology[index], size, rng, randomScale)
    ),
  };
}

export function runNeuralNetwork(input: Float32Array, network: NeuralNetwork): NetworkOutput {
  const layers = getNetworkLayers(network);
  if (layers.length === 0) throw new Error('Neural network requires at least one layer');
  let values = input;
  for (let index = 0; index < layers.length; index++) {
    const output = forwardDense(values, layers[index]);
    values = index === layers.length - 1 ? output : applyTanh(output);
  }
  if (values.length !== 3) {
    throw new Error(`Neural bot output must contain 3 scores, got ${values.length}`);
  }
  const actionIndex = argmax(values);
  return { scores: values, actionIndex, action: actionIndexToDecision(actionIndex) };
}

export function getNetworkInputSize(network: NeuralNetwork): number {
  const firstLayer = getNetworkLayers(network)[0];
  if (!firstLayer) throw new Error('Neural network requires at least one layer');
  return firstLayer.inputSize;
}

export function getNetworkParameterCount(network: NeuralNetwork): number {
  return getNetworkLayers(network).reduce(
    (count, layer) => count + layer.weights.length + layer.bias.length,
    0,
  );
}

export function flattenNetwork(network: NeuralNetwork): Float32Array {
  const genome = new Float32Array(getNetworkParameterCount(network));
  let offset = 0;
  for (const layer of getNetworkLayers(network)) {
    genome.set(layer.weights, offset);
    offset += layer.weights.length;
    genome.set(layer.bias, offset);
    offset += layer.bias.length;
  }
  return genome;
}

export function createDenseNetworkFromGenome(
  topology: number[],
  genome: Float32Array,
): DenseNetwork {
  if (topology.length < 2 || topology.some((size) => !Number.isInteger(size) || size <= 0)) {
    throw new Error('Network topology requires at least two positive integer sizes');
  }
  const expectedSize = topology.slice(1).reduce(
    (count, size, index) => count + topology[index] * size + size,
    0,
  );
  if (genome.length !== expectedSize) {
    throw new Error(`Genome length ${genome.length} does not match topology parameter count ${expectedSize}`);
  }
  let offset = 0;
  const layers = topology.slice(1).map((outputSize, index) => {
    const inputSize = topology[index];
    const weightCount = inputSize * outputSize;
    const weights = genome.slice(offset, offset + weightCount);
    offset += weightCount;
    const bias = genome.slice(offset, offset + outputSize);
    offset += outputSize;
    return { inputSize, outputSize, weights, bias };
  });
  return { layers };
}

export function createSimpleNetwork(
  inputSize: number,
  rng: RandomPort,
  hiddenSize = 16,
): SimpleNetwork {
  return {
    hiddenLayer: createRandomLayer(inputSize, hiddenSize, rng),
    outputLayer: createRandomLayer(hiddenSize, 3, rng),
  };
}

export function runSimpleNetwork(input: Float32Array, network: SimpleNetwork): NetworkOutput {
  return runNeuralNetwork(input, network);
}

function getNetworkLayers(network: NeuralNetwork): DenseLayer[] {
  return 'layers' in network ? network.layers : [network.hiddenLayer, network.outputLayer];
}
