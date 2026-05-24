export const REGISTRY_ABI = [
  'function anchorCreditDecision(uint256 applicationId, uint256[2] calldata proofA, uint256[2][2] calldata proofB, uint256[2] calldata proofC, uint256[1] calldata publicSignals) external',
] as const;

export const CREDIT_CLASSIFIER_WASM_PATH = 'credit_classifier.wasm' as const;
export const CREDIT_CLASSIFIER_ZKEY_PATH = 'credit_classifier_0001.zkey' as const;
