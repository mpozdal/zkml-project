import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { WalletService } from '../../services/wallet.service';

@Component({
  selector: 'app-credit-application.component',
  templateUrl: './credit-application.component.html',
  styleUrl: './credit-application.component.css',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditApplicationComponent {
  private readonly fb = inject(FormBuilder);
  private readonly walletService = inject(WalletService);

  protected readonly isProcessing = signal<boolean>(false);

  protected readonly walletAddress = computed(() => this.walletService.userAddress());
  protected readonly error = computed(() => this.walletService.walletError());

  protected readonly shortenedAddress = computed(() => {
    const addr = this.walletAddress();
    return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
  });

  creditForm: FormGroup = this.fb.group({
    duration: ['', [Validators.required, Validators.min(0)]],
    credit_amount: ['', [Validators.required, Validators.min(0)]],
    installment_commitment: ['', [Validators.required, Validators.min(0)]],
    age: ['', [Validators.required, Validators.min(18)]],
  });

  protected connectWallet(): void {
    this.walletService.connectWallet();
  }

  protected async onSubmit() {
    if (this.creditForm.invalid || !this.walletAddress()) return;

    this.isProcessing.set(true);

    try {
      const formValues = this.creditForm.value;

      const zkInputs = {
        x: [
          formValues.duration.toString(),
          formValues.credit_amount.toString(),
          formValues.installment_commitment.toString(),
          formValues.age.toString(),
        ],
      };

      await new Promise((resolve) => setTimeout(resolve, 3000));
      alert('Test UI: Dowód wygenerowany!');
    } catch (err) {
      console.error(err);
    } finally {
      this.isProcessing.set(false);
    }
  }
}
