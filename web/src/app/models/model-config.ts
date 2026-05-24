export interface ModelConfig {
  modelVersion: string;
  featureNames: string[];
  scale: number;
  weights: number[];
  bias: number;
  scalerMean: number[];
  scalerScale: number[];
  accuracy: number;
  modelHash: string;
  exampleRaw: number[];
}

export interface CreditFormValues {
  duration: number;
  credit_amount: number;
  installment_commitment: number;
  age: number;
}
