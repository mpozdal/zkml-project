import { ethers } from 'ethers';
import type { FormattedProof } from '../services/zk-credit.service';

/** Matches CreditRegistry: keccak256(abi.encode(proofA, proofB, proofC, publicSignals)) */
export function hashProofForAudit(
  formattedProof: FormattedProof,
  publicSignals: string[],
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256[2]', 'uint256[2][2]', 'uint256[2]', 'uint256[1]'],
      [
        formattedProof.proofA,
        formattedProof.proofB,
        formattedProof.proofC,
        publicSignals,
      ],
    ),
  );
}

export function applicationIdOnChain(rawApplicationId: string): bigint {
  return BigInt(ethers.id(rawApplicationId));
}
