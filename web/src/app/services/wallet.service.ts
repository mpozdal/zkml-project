import { Injectable, signal } from '@angular/core';
import { ethers } from 'ethers';

@Injectable({ providedIn: 'root' })
export class WalletService {
  public readonly userAddress = signal<string | null>(null);
  public readonly walletError = signal<string | null>(null);

  public async connectWallet(): Promise<void> {
    try {
      this.walletError.set(null);

      await this.checkIfWalletIsConnected();
    } catch (error: unknown) {
      let message = 'An unknown error occurred';

      if (error instanceof Error && error.message) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      }

      this.walletError.set(message);
    }
  }

  private async checkIfWalletIsConnected(): Promise<void> {
    const ethereum = window.ethereum;

    if (!ethereum) {
      throw new Error(
        'MetaMask (or another Ethereum wallet) is not detected. Please install MetaMask from https://metamask.io or enable an Ethereum provider in your browser to continue.',
      );
    }

    const provider = new ethers.BrowserProvider(ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);

    if (accounts.length > 0) {
      this.userAddress.set(accounts[0]);
    }

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

    this.listenersAttached = true;
  }
}
