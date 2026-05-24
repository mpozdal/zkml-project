import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import * as snarkjs from 'snarkjs';
import {
  CREDIT_CLASSIFIER_WASM_PATH,
  CREDIT_CLASSIFIER_ZKEY_PATH,
  REGISTRY_ABI,
} from '../config/zk-credit.constants';
import { REGISTRY_ADDRESS } from '../../environments/environment';

export type FormattedProof = {
  proofA: [string, string];
  proofB: [[string, string], [string, string]];
  proofC: [string, string];
};

export type GeneratedCreditProof = {
  formattedProof: FormattedProof;
  publicSignals: string[];
};

@Injectable({ providedIn: 'root' })
export class ZkCreditService {
  async generateCreditProof(inputs: { x: string[] }): Promise<GeneratedCreditProof> {
    const { proof, publicSignals } = await this.generateProof(inputs);

    return {
      formattedProof: this.formatProofForSolidity(proof),
      publicSignals,
    };
  }

  async anchorCreditOnChain(
    rawApplicationId: string,
    formattedProof: FormattedProof,
    publicSignals: string[],
  ) {
    return this.submitToBlockchain(rawApplicationId, formattedProof, publicSignals);
  }

  private async generateProof(inputs: { x: string[] }) {
    try {
      return await snarkjs.groth16.fullProve(
        inputs,
        CREDIT_CLASSIFIER_WASM_PATH,
        CREDIT_CLASSIFIER_ZKEY_PATH,
      );
    } catch (error) {
      console.error('ZK Proof Generation failed:', error);
      throw new Error('Failed to generate ZK proof. Check your inputs or circuit files.');
    }
  }

  private formatProofForSolidity(proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  }): FormattedProof {
    return {
      proofA: [proof.pi_a[0], proof.pi_a[1]],
      proofB: [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ],
      proofC: [proof.pi_c[0], proof.pi_c[1]],
    };
  }

  private async submitToBlockchain(
    rawAppId: string,
    formattedProof: FormattedProof,
    publicSignals: string[],
  ) {
    const ethereum = window.ethereum;

    if (!ethereum) {
      throw new Error('MetaMask is not installed.');
    }

    if (publicSignals.length !== 1) {
      throw new Error(`Expected 1 public signal from circuit, got ${publicSignals.length}.`);
    }

    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);

    const applicationId = BigInt(ethers.id(rawAppId));

    try {
      const tx = await contract['anchorCreditDecision'](
        applicationId,
        formattedProof.proofA,
        formattedProof.proofB,
        formattedProof.proofC,
        publicSignals,
      );

      return await tx.wait();
    } catch (error: unknown) {
      console.error('Blockchain transaction failed:', error);
      if (this.isRejectedTransaction(error)) {
        throw new Error('Transaction was rejected by the user.');
      }
      throw new Error('Blockchain transaction failed. See console for details.');
    }
  }

  private isRejectedTransaction(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'ACTION_REJECTED'
    );
  }
}
