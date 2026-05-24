import { computed, Injectable, signal } from '@angular/core';
import { ethers } from 'ethers';

const SEPOLIA_CHAIN_ID = '0xaa36a7';

@Injectable({ providedIn: 'root' })
export class WalletService {
  public readonly userAddress = signal<string | null>(null);
  public readonly walletError = signal<string | null>(null);
  public readonly chainId = signal<string | null>(null);
  public readonly isAwaitingWalletAction = signal(false);

  public readonly isCorrectNetwork = computed(() => {
    const id = this.chainId();
    return id?.toLowerCase() === SEPOLIA_CHAIN_ID;
  });

  public async connectWallet(): Promise<void> {
    const ethereum = window.ethereum;

    if (!ethereum) {
      this.walletError.set(
        'MetaMask was not detected. Install the extension from https://metamask.io and refresh the page.',
      );
      return;
    }

    try {
      this.walletError.set(null);
      this.isAwaitingWalletAction.set(true);

      // Keep the provider request as close to the click handler as possible.
      await ethereum.request({ method: 'eth_requestAccounts' });

      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = await provider.listAccounts();

      if (accounts.length > 0) {
        this.userAddress.set(accounts[0].address);
      }

      const network = await provider.getNetwork();
      this.applyChainId(ethers.toBeHex(network.chainId));

      this.setupEventListeners();
    } catch (error: unknown) {
      this.walletError.set(this.toErrorMessage(error));
    } finally {
      this.isAwaitingWalletAction.set(false);
    }
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
