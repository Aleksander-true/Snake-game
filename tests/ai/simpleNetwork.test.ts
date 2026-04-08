import {
    actionIndexToDecision,
    argmax,
    tanh,
    applyTanh,
    forwardDense,
    createSimpleNetwork,
    runSimpleNetwork,
    type DenseLayer,
    type SimpleNetwork,
  } from '../../src/ai/nn/simpleNetwork';
  
  describe('simpleNetwork', () => {
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
      const network = createSimpleNetwork(6, 4);
  
      expect(network.hiddenLayer.inputSize).toBe(6);
      expect(network.hiddenLayer.outputSize).toBe(4);
      expect(network.outputLayer.inputSize).toBe(4);
      expect(network.outputLayer.outputSize).toBe(3);
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
  });