import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { WalletService } from '../../services/wallet.service';

@Component({
  selector: 'app-site-header',
  templateUrl: './site-header.component.html',
  styleUrl: './site-header.component.css',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteHeaderComponent {
  private readonly walletService = inject(WalletService);

  protected readonly walletAddress = computed(() => this.walletService.userAddress());
  protected readonly isAwaitingWalletAction = computed(() => this.walletService.isAwaitingWalletAction());

  protected readonly shortenedAddress = computed(() => {
    const addr = this.walletAddress();
    return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
  });

  protected connectWallet(): void {
    void this.walletService.connectWallet();
  }
}
