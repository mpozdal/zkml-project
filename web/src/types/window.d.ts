import type { Eip1193Provider } from 'ethers';

export interface MetaMaskEthereumProvider extends Eip1193Provider {
  on(event: 'accountsChanged', handler: (accounts: string[]) => void): void;
  on(event: 'chainChanged', handler: (chainId: string) => void): void;
  removeListener?(
    event: 'accountsChanged' | 'chainChanged',
    handler: (...args: unknown[]) => void,
  ): void;
}

declare global {
  interface Window {
    ethereum?: MetaMaskEthereumProvider;
  }
}

export {};
