import { computed, Injectable, signal } from '@angular/core';
import { ethers } from 'ethers';

const SEPOLIA_CHAIN_ID = '0xaa36a7';

@Injectable({ providedIn: 'root' })
export class WalletService {
  public readonly userAddress = signal<string | null>(null);
  public readonly walletError = signal<string | null>(null);
  public readonly chainId = signal<string | null>(null);

  public readonly isCorrectNetwork = computed(() => {
    const id = this.chainId();
    return id?.toLowerCase() === SEPOLIA_CHAIN_ID;
  });

  public async connectWallet(): Promise<void> {
    try {
      this.walletError.set(null);
      await this.checkIfWalletIsConnected();
    } catch (error: unknown) {
      this.walletError.set(this.toErrorMessage(error));
    }
  }

  private async checkIfWalletIsConnected(): Promise<void> {
    const ethereum = window.ethereum;

    if (!ethereum) {
      throw new Error(
        'MetaMask was not detected. Install the extension from https://metamask.io and refresh the page.',
      );
    }

    const provider = new ethers.BrowserProvider(ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);

    if (accounts.length > 0) {
      this.userAddress.set(accounts[0]);
    }

    const chainId = await provider.send('eth_chainId', []);
    this.applyChainId(chainId);

    this.setupEventListeners();
  }

  private listenersAttached = false;

  private setupEventListeners(): void {
    const ethereum = window.ethereum;
    if (!ethereum || this.listenersAttached) {
      return;
    }

    ethereum.on('accountsChanged', (accounts: string[]) => {
      if (!accounts.length) {
        this.userAddress.set(null);
        return;
      }

      this.userAddress.set(accounts[0]);
    });

    ethereum.on('chainChanged', (chainId: string) => {
      this.applyChainId(chainId);
    });

    this.listenersAttached = true;
  }

  private applyChainId(chainId: string): void {
    this.chainId.set(chainId);

    if (chainId.toLowerCase() !== SEPOLIA_CHAIN_ID) {
      this.walletError.set('Wrong network. Switch MetaMask to Sepolia (chain ID 11155111).');
      return;
    }

    const currentError = this.walletError();

    if (currentError?.includes('network') || currentError?.includes('Sepolia')) {
      this.walletError.set(null);
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'An unknown error occurred while connecting the wallet.';
  }
}
