import { CreditFormValues, ModelConfig } from '../models/model-config';

export function standardizeFeature(value: number, mean: number, std: number): number {
  return (value - mean) / std;
}

export function toFixedPointFeatures(rawFeatures: number[], config: ModelConfig): number[] {
  return rawFeatures.map((value, index) => {
    const standardized = standardizeFeature(
      value,
      config.scalerMean[index],
      config.scalerScale[index],
    );
    return Math.trunc(standardized * config.scale);
  });
}

/** Circom Num2Bits(32) expects unsigned field elements representing signed i32 values. */
export function toUnsigned32Bit(signedValue: number): number {
  if (!Number.isInteger(signedValue)) {
    throw new Error(`Expected integer feature value, got ${signedValue}.`);
  }

  if (signedValue < 0) {
    return signedValue + 2 ** 32;
  }

  if (signedValue >= 2 ** 32) {
    throw new Error(`Feature value ${signedValue} does not fit in 32 bits.`);
  }

  return signedValue;
}

export function toCircuitFieldElements(fixedPointFeatures: number[]): number[] {
  return fixedPointFeatures.map(toUnsigned32Bit);
}

export function fixedPointProduct(feature: number, weight: number, scale: number): number {
  return Math.floor((feature * weight) / scale);
}

export function computeFixedPointScore(features: number[], config: ModelConfig): number {
  const weightedSum = features.reduce(
    (total, feature, index) =>
      total + fixedPointProduct(feature, config.weights[index], config.scale),
    0,
  );

  return weightedSum + config.bias;
}

export function predictDecision(rawFeatures: number[], config: ModelConfig): 0 | 1 {
  const features = toFixedPointFeatures(rawFeatures, config);
  return computeFixedPointScore(features, config) > 0 ? 1 : 0;
}

export function toCircuitInputStrings(rawFeatures: number[], config: ModelConfig): string[] {
  const fixedPointFeatures = toFixedPointFeatures(rawFeatures, config);
  return toCircuitFieldElements(fixedPointFeatures).map(String);
}

export function formValuesToRawFeatures(
  formValues: CreditFormValues,
  config: ModelConfig,
): number[] {
  return config.featureNames.map((featureName) => Number(formValues[featureName as keyof CreditFormValues]));
}
