import type { BotDecision } from '../../engine/types';

export interface DenseLayer {
  inputSize: number;
  outputSize: number;
  weights: Float32Array;
  bias: Float32Array;
}
export interface SimpleNetwork {
  hiddenLayer: DenseLayer;
  outputLayer: DenseLayer;
}
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
    if (values.length === 0) {
      throw new Error('argmax requires a non-empty array');
    }
    let bestIndex = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[bestIndex]) {
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  export function tanh(value: number): number {
    return Math.tanh(value);
  }
  export function applyTanh(values: Float32Array): Float32Array {
    const results = new Float32Array(values.length);
    for (let i = 0; i < values.length; i++) {
      results[i] = tanh(values[i]);
    }
    return results;
  }

  export function createRandomLayer(
    inputSize: number,
    outputSize: number,
    randomScale: number = 0.1
  ): DenseLayer {
    if (inputSize <= 0) {
      throw new Error(`inputSize must be > 0, got ${inputSize}`);
    }
  
    if (outputSize <= 0) {
      throw new Error(`outputSize must be > 0, got ${outputSize}`);
    }
  
    const weights = new Float32Array(inputSize * outputSize);
    const bias = new Float32Array(outputSize);
  
    for (let i = 0; i < weights.length; i++) {
      weights[i] = (Math.random() * randomScale * 2) - randomScale;
    }
  
    for (let i = 0; i < bias.length; i++) {
      bias[i] = 0;
    }
  
    return {
      inputSize,
      outputSize,
      weights,
      bias,
    };
  }

  export function forwardDense(
    input: Float32Array,
    layer: DenseLayer
  ): Float32Array {
    if (input.length !== layer.inputSize) {
      throw new Error(
        `Input length ${input.length} does not match layer inputSize ${layer.inputSize}`
      );
    }
  
    const result = new Float32Array(layer.outputSize);
  
    for (let outIndex = 0; outIndex < layer.outputSize; outIndex++) {
      let sum = layer.bias[outIndex];
  
      for (let inIndex = 0; inIndex < layer.inputSize; inIndex++) {
        const weightIndex = outIndex * layer.inputSize + inIndex;
  
        sum += input[inIndex] * layer.weights[weightIndex];
      }
  
      result[outIndex] = sum;
    }
  
    return result;
  }

  export function createSimpleNetwork(
    inputSize: number,
    hiddenSize: number = 16
  ): SimpleNetwork {
    return {
      hiddenLayer: createRandomLayer(inputSize, hiddenSize),
      outputLayer: createRandomLayer(hiddenSize, 3),
    };
  }

  export function runSimpleNetwork(
    input: Float32Array,
    network: SimpleNetwork
  ): NetworkOutput {
    const hiddenRaw = forwardDense(input, network.hiddenLayer);
    const hiddenActivated = applyTanh(hiddenRaw);
    const scores = forwardDense(hiddenActivated, network.outputLayer);
  
    const actionIndex = argmax(scores);
    const action = actionIndexToDecision(actionIndex);
  
    return {
      scores,
      actionIndex,
      action,
    };
  }
