import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { WalletService } from '../../services/wallet.service';
import { ModelPreprocessingService } from '../../services/model-preprocessing.service';
import { GeneratedCreditProof, ZkCreditService } from '../../services/zk-credit.service';

type SubmissionResult =
  | {
      type: 'success';
      isApproved: boolean;
      txHash: string;
      blockNumber: number;
    }
  | {
      type: 'error';
      message: string;
    };

type PendingAnchor = GeneratedCreditProof & {
  applicationId: string;
  isApproved: boolean;
};

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
  private readonly zkCreditService = inject(ZkCreditService);
  private readonly modelPreprocessingService = inject(ModelPreprocessingService);

  private readonly SEPOLIA_EXPLORER_TX = 'https://sepolia.etherscan.io/tx/';

  protected readonly isGeneratingProof = signal<boolean>(false);
  protected readonly isSigning = signal<boolean>(false);
  protected readonly showSignModal = signal<boolean>(false);
  protected readonly showResultModal = signal<boolean>(false);
  protected readonly submissionResult = signal<SubmissionResult | null>(null);
  protected readonly pendingAnchor = signal<PendingAnchor | null>(null);

  protected readonly walletAddress = computed(() => this.walletService.userAddress());
  protected readonly walletError = computed(() => this.walletService.walletError());
  protected readonly isAwaitingWalletAction = computed(() => this.walletService.isAwaitingWalletAction());

  protected readonly isProcessing = computed(
    () => this.isGeneratingProof() || this.isSigning(),
  );

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
    void this.walletService.connectWallet();
  }

  protected closeSignModal(): void {
    this.showSignModal.set(false);
    this.pendingAnchor.set(null);
  }

  protected closeResultModal(): void {
    this.showResultModal.set(false);
  }

  protected explorerTxUrl(txHash: string): string {
    return `${this.SEPOLIA_EXPLORER_TX}${txHash}`;
  }

  protected shortenedTxHash(txHash: string): string {
    return `${txHash.slice(0, 10)}...${txHash.slice(-8)}`;
  }

  protected async onSubmit() {
    if (this.creditForm.invalid || !this.walletAddress() || this.isProcessing()) return;

    this.isGeneratingProof.set(true);
    this.submissionResult.set(null);
    this.pendingAnchor.set(null);
    this.showSignModal.set(false);

    try {
      const formValues = this.creditForm.value;

      const circuitInputs = await this.modelPreprocessingService.prepareCircuitInputs({
        duration: Number(formValues.duration),
        credit_amount: Number(formValues.credit_amount),
        installment_commitment: Number(formValues.installment_commitment),
        age: Number(formValues.age),
      });

      const zkInputs = { x: circuitInputs };

      const applicationId = crypto.randomUUID();
      const generatedProof = await this.zkCreditService.generateCreditProof(zkInputs);

      this.pendingAnchor.set({
        applicationId,
        ...generatedProof,
        isApproved: generatedProof.publicSignals[0] === '1',
      });
      this.showSignModal.set(true);
    } catch (err) {
      console.error(err);
      this.showSubmissionError(err);
    } finally {
      this.isGeneratingProof.set(false);
    }
  }

  protected async confirmAnchor() {
    const pending = this.pendingAnchor();
    if (!pending || this.isSigning()) return;

    this.isSigning.set(true);

    try {
      const receipt = await this.zkCreditService.anchorCreditOnChain(
        pending.applicationId,
        pending.formattedProof,
        pending.publicSignals,
      );

      this.showSignModal.set(false);
      this.pendingAnchor.set(null);
      this.submissionResult.set({
        type: 'success',
        isApproved: pending.isApproved,
        txHash: receipt.hash,
        blockNumber: Number(receipt.blockNumber),
      });
      this.showResultModal.set(true);
    } catch (err) {
      console.error(err);
      this.showSubmissionError(err);
    } finally {
      this.isSigning.set(false);
    }
  }

  private showSubmissionError(err: unknown): void {
    this.submissionResult.set({
      type: 'error',
      message: err instanceof Error ? err.message : 'An unexpected error occurred.',
    });
    this.showResultModal.set(true);
  }
}
