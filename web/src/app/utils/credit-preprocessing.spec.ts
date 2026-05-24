import {
  computeFixedPointScore,
  predictDecision,
  toCircuitFieldElements,
  toCircuitInputStrings,
  toFixedPointFeatures,
  toUnsigned32Bit,
} from './credit-preprocessing';
import { ModelConfig } from '../models/model-config';

const modelConfig: ModelConfig = {
  modelVersion: 'v1-logreg-credit-zk',
  featureNames: ['duration', 'credit_amount', 'installment_commitment', 'age'],
  scale: 1000,
  weights: [-274, -236, -189, 359],
  bias: 916,
  scalerMean: [20.903, 3271.258, 2.973, 35.546],
  scalerScale: [12.052783537424043, 2821.3251545038192, 1.1181551770662246, 11.36977941738537],
  accuracy: 0.725,
  modelHash: 'b8941942071c111187c41debad6bbee8d9e242755f2e89d15db4847716d4966c',
  exampleRaw: [18, 3190, 2, 24],
};

describe('credit-preprocessing', () => {
  it('matches Python fixed-point features for exampleRaw', () => {
    const features = toFixedPointFeatures(modelConfig.exampleRaw, modelConfig);

    expect(features).toEqual([-240, -28, -870, -1015]);
  });

  it('matches Python fixed-point score for exampleRaw', () => {
    const features = toFixedPointFeatures(modelConfig.exampleRaw, modelConfig);

    expect(computeFixedPointScore(features, modelConfig)).toBe(786);
  });

  it('matches Python decision for exampleRaw', () => {
    expect(predictDecision(modelConfig.exampleRaw, modelConfig)).toBe(1);
  });

  it('converts signed fixed-point features to unsigned 32-bit circuit fields', () => {
    const features = toFixedPointFeatures(modelConfig.exampleRaw, modelConfig);

    expect(toCircuitFieldElements(features)).toEqual([
      4294967056, 4294967268, 4294966426, 4294966281,
    ]);
  });

  it('produces circuit input strings accepted by the Circom witness calculator', () => {
    expect(toCircuitInputStrings(modelConfig.exampleRaw, modelConfig)).toEqual([
      '4294967056',
      '4294967268',
      '4294966426',
      '4294966281',
    ]);
  });

  it('maps negative values using two\'s complement', () => {
    expect(toUnsigned32Bit(-240)).toBe(4294967056);
    expect(toUnsigned32Bit(916)).toBe(916);
  });
});
