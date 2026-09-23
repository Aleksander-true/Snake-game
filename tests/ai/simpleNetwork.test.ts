import {
    actionIndexToDecision,
    argmax,
    tanh,
    applyTanh,
    forwardDense,
    createSimpleNetwork,
    createDenseNetwork,
    initializeSpatialVisionWeights,
    createDenseNetworkFromGenome,
    flattenNetwork,
    runNeuralNetwork,
    runSimpleNetwork,
    traceNeuralNetwork,
    type DenseLayer,
    type SimpleNetwork,
    createSeededRng,
  } from '@snake-game/core';
  
  describe('simpleNetwork', () => {
    test('v5 uses Gaussian distance with signed amplitude and additive noise', () => {
      const network = createDenseNetwork(86, [1], 3, createSeededRng(1));
      const before = flattenNetwork(network);
      const next = jest.fn().mockReturnValue(0.75)
        .mockReturnValueOnce(0.75).mockReturnValueOnce(0.25)
        .mockReturnValueOnce(0.75).mockReturnValueOnce(0);
      initializeSpatialVisionWeights(network, 9, 5, { ...createSeededRng(1), next });
      const weights = network.layers[0].weights;
      expect(weights[2 * 9 + 6]).toBeCloseTo(0.055, 7);
      expect(weights[2 * 9 + 7]).toBeCloseTo(0.05 * Math.exp(-0.5) + 0.005, 7);
      expect(weights[3 * 9 + 7]).toBeCloseTo(0.05 * Math.exp(-1) + 0.005, 7);
      expect(flattenNetwork(network).slice(81)).toEqual(before.slice(81));
    });

    test.each([5, 6] as const)('v%i only changes vision weights and is seeded', version => {
      const build = () => {
        const network = createDenseNetwork(86, [4, 9], 3, createSeededRng(1));
        initializeSpatialVisionWeights(network, 9, version, createSeededRng(2));
        return network;
      };
      const network = build();
      expect(flattenNetwork(network)).toEqual(flattenNetwork(build()));
      const original = createDenseNetwork(86, [4, 9], 3, createSeededRng(1));
      for (let neuron = 0; neuron < 4; neuron++) {
        const offset = neuron * 86;
        expect(network.layers[0].weights.slice(offset + 81, offset + 86))
          .toEqual(original.layers[0].weights.slice(offset + 81, offset + 86));
        if (version === 6) expect(Array.from(network.layers[0].weights.slice(offset, offset + 81)))
          .toEqual(new Array(81).fill(Math.fround(0.1)));
      }
      expect(network.layers[0].bias).toEqual(original.layers[0].bias);
      expect(network.layers.slice(1)).toEqual(original.layers.slice(1));
      if (version === 5) {
        const changed = createDenseNetwork(86, [4, 9], 3, createSeededRng(1));
        initializeSpatialVisionWeights(changed, 9, 5, createSeededRng(3));
        expect(network.layers[0].weights).not.toEqual(changed.layers[0].weights);
      }
    });

    test('maps action index to decision', () => {
      expect(actionIndexToDecision(0)).toBe('left');
      expect(actionIndexToDecision(1)).toBe('front');
      expect(actionIndexToDecision(2)).toBe('right');
    });
  
    test('argmax returns index of the largest value', () => {
      const values = new Float32Array([1, 5, 3]);
      const index = argmax(values);
      expect(index).toBe(1);
    });

    test('argmax returns index of the largest value with negative values', () => {
      const values = new Float32Array([-1, -5, -3]);
      const index = argmax(values);
      expect(index).toBe(0);
    });
  
    test('tanh keeps zero at zero and preserves sign', () => {
      expect(tanh(0)).toBe(0);
      const negative = tanh(-3);
      expect(negative < 0).toBe(true);
      expect(negative >= -1).toBe(true);

      const positive = tanh(3);
      expect(positive > 0).toBe(true);
      expect(positive <= 1).toBe(true);

    });
  
    test('applyTanh transforms each element', () => {
      const values = new Float32Array([-1, 0, 1]);
      const result = applyTanh(values);
  
      expect(result[0]).toBeCloseTo(Math.tanh(-1));
      expect(result[1]).toBeCloseTo(Math.tanh(0));
      expect(result[2]).toBeCloseTo(Math.tanh(1));
    });
  
    test('forwardDense computes expected output for a known layer', () => {
      const input = new Float32Array([1, 2]);
  
      const layer: DenseLayer = {
        inputSize: 2,
        outputSize: 2,
        weights: new Float32Array([
          1, 2,
          3, 4,
        ]),
        bias: new Float32Array([10, 20]),
      };
  
      const result = forwardDense(input, layer);

      expect(result).toEqual(new Float32Array([
        10 + 1*1 + 2*2,
        20 + 1*3 + 2*4,
      ]));
    });
  
    test('createSimpleNetwork creates layers with expected sizes', () => {
      const network = createSimpleNetwork(6, createSeededRng(1), 4);
  
      expect(network.hiddenLayer.inputSize).toBe(6);
      expect(network.hiddenLayer.outputSize).toBe(4);
      expect(network.outputLayer.inputSize).toBe(4);
      expect(network.outputLayer.outputSize).toBe(3);
    });

    test('creates identical networks from identical seeds', () => {
      const first = createSimpleNetwork(6, createSeededRng(42), 4);
      const second = createSimpleNetwork(6, createSeededRng(42), 4);

      expect(first.hiddenLayer.weights).toEqual(second.hiddenLayer.weights);
      expect(first.outputLayer.weights).toEqual(second.outputLayer.weights);
    });
  
    test('runSimpleNetwork returns 3 scores and a valid action', () => {
      const network: SimpleNetwork = {
        hiddenLayer: {
          inputSize: 2,
          outputSize: 2,
          weights: new Float32Array([
            1, 0,
            0, 1,
          ]),
          bias: new Float32Array([0, 0]),
        },
        outputLayer: {
          inputSize: 2,
          outputSize: 3,
          weights: new Float32Array([
            1, 0,
            0, 1,
            -1, -1,
          ]),
          bias: new Float32Array([0, 0, 0]),
        },
      };
  
      const input = new Float32Array([1, 0]);
      const result = runSimpleNetwork(input, network);
  
      expect(result.scores.length).toBe(3);
      expect(result.actionIndex).toBe(0);
      expect(result.action).toBe('left');
    });

    test('runs a configurable multilayer network', () => {
      const network = createDenseNetwork(6, [5, 4], 3, createSeededRng(7));
      const result = runNeuralNetwork(new Float32Array(6), network);

      expect(network.layers.map((layer) => [layer.inputSize, layer.outputSize])).toEqual([
        [6, 5],
        [5, 4],
        [4, 3],
      ]);
      expect(result.scores).toHaveLength(3);
    });

    test('restores the same network from its flat genome', () => {
      const network = createDenseNetwork(3, [4, 2], 3, createSeededRng(11));
      const genome = flattenNetwork(network);
      const restored = createDenseNetworkFromGenome([3, 4, 2, 3], genome);

      expect(flattenNetwork(restored)).toEqual(genome);
      expect(runNeuralNetwork(new Float32Array([1, 2, 3]), restored))
        .toEqual(runNeuralNetwork(new Float32Array([1, 2, 3]), network));
    });

    test('traces the input and every layer without changing the network result', () => {
      const network = createTestTraceNetwork();
      const input = new Float32Array([1, 0]);

      const trace = traceNeuralNetwork(input, network);

      expect(trace.input).toEqual(input);
      expect(trace.input).not.toBe(input);
      expect(trace.layerValues).toHaveLength(2);
      expect(trace.layerValues[0][0]).toBeCloseTo(Math.tanh(1));
      expect(trace.layerValues[0][1]).toBeCloseTo(0);
      expect(trace.output).toEqual(runNeuralNetwork(input, network));
    });
  });

function createTestTraceNetwork(): SimpleNetwork {
  return {
    hiddenLayer: {
      inputSize: 2,
      outputSize: 2,
      weights: new Float32Array([1, 0, 0, 1]),
      bias: new Float32Array([0, 0]),
    },
    outputLayer: {
      inputSize: 2,
      outputSize: 3,
      weights: new Float32Array([1, 0, 0, 1, -1, -1]),
      bias: new Float32Array([0, 0, 0]),
    },
  };
}
