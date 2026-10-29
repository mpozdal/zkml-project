import { expect } from 'chai';
import { network } from 'hardhat';

// ---------------------------------------------------------------------------
// Shared proof fixture values. MockVerifier ignores them, so any field-sized
// bigints work. Two distinct sets let us test the "proof already anchored"
// guard without colliding hashes.
// ---------------------------------------------------------------------------
const PROOF_A = [1n, 2n] as const;
const PROOF_B = [
	[3n, 4n],
	[5n, 6n],
] as const;
const PROOF_C = [7n, 8n] as const;
const SIG_APPROVED = [1n] as const;
const SIG_REJECTED = [0n] as const;

const PROOF_A2 = [9n, 10n] as const;
const PROOF_B2 = [
	[11n, 12n],
	[13n, 14n],
] as const;
const PROOF_C2 = [15n, 16n] as const;

/**
 * Asserts that a call reverts and that `reason` appears in the error message.
 * Written by hand so the suite needs no chai revert-matcher plugin.
 */
async function expectRevert(call: Promise<unknown>, reason: string): Promise<void> {
	let threw = false;
	try {
		await call;
	} catch (err: unknown) {
		threw = true;
		const msg = err instanceof Error ? err.message : String(err);
		expect(msg).to.include(reason, `wrong revert reason, got: ${msg}`);
	}
	expect(threw, `expected revert "${reason}" but call succeeded`).to.equal(true);
}

/**
 * Each create() call yields a fresh in-memory chain, giving every test a
 * clean deployment without needing fixture snapshots.
 */
async function deploy() {
	const { viem } = await network.create();

	const publicClient = await viem.getPublicClient();
	const [owner, user1, user2] = await viem.getWalletClients();

	const mockVerifier = await viem.deployContract('MockVerifier');
	const registry = await viem.deployContract('CreditRegistry', [mockVerifier.address]);

	return { registry, mockVerifier, publicClient, owner, user1, user2 };
}

describe('CreditRegistry', function () {
	describe('Deployment', function () {
		it('stores the verifier address', async function () {
			const { registry, mockVerifier } = await deploy();

			const stored = await registry.read.verifier();
			expect(stored.toLowerCase()).to.equal(mockVerifier.address.toLowerCase());
		});

		it('sets deployer as owner', async function () {
			const { registry, owner } = await deploy();

			const contractOwner = await registry.read.owner();
			expect(contractOwner.toLowerCase()).to.equal(owner.account.address.toLowerCase());
		});
	});

	describe('anchorCreditDecision', function () {
		it('anchors an approved decision (publicSignals[0] = 1)', async function () {
			const { registry, user1 } = await deploy();

			await registry.write.anchorCreditDecision(
				[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
				{ account: user1.account },
			);

			const [isApproved, , exists] = await registry.read.userApplications([
				user1.account.address,
				1n,
			]);
			expect(exists).to.equal(true);
			expect(isApproved).to.equal(true);
		});

		it('anchors a rejected decision (publicSignals[0] = 0)', async function () {
			const { registry, user1 } = await deploy();

			await registry.write.anchorCreditDecision(
				[2n, PROOF_A, PROOF_B, PROOF_C, SIG_REJECTED],
				{ account: user1.account },
			);

			const [isApproved, , exists] = await registry.read.userApplications([
				user1.account.address,
				2n,
			]);
			expect(exists).to.equal(true);
			expect(isApproved).to.equal(false);
		});

		it('stores a non-zero timestamp', async function () {
			const { registry, user1 } = await deploy();

			await registry.write.anchorCreditDecision(
				[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
				{ account: user1.account },
			);

			const [, timestamp] = await registry.read.userApplications([
				user1.account.address,
				1n,
			]);
			expect(timestamp > 0n).to.equal(true);
		});

		it('marks the proof hash as used', async function () {
			const { registry, user1 } = await deploy();

			await registry.write.anchorCreditDecision(
				[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
				{ account: user1.account },
			);

			const [, , , proofHash] = await registry.read.userApplications([
				user1.account.address,
				1n,
			]);
			expect(await registry.read.usedProofHashes([proofHash])).to.equal(true);
		});

		it('emits CreditAnchored with correct arguments', async function () {
			const { registry, publicClient, user1 } = await deploy();

			const hash = await registry.write.anchorCreditDecision(
				[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
				{ account: user1.account },
			);
			const receipt = await publicClient.waitForTransactionReceipt({ hash });

			const logs = await publicClient.getContractEvents({
				address: registry.address,
				abi: registry.abi,
				eventName: 'CreditAnchored',
				fromBlock: receipt.blockNumber,
				toBlock: receipt.blockNumber,
			});

			expect(logs).to.have.length(1);
			expect(logs[0].args.user?.toLowerCase()).to.equal(
				user1.account.address.toLowerCase(),
			);
			expect(logs[0].args.applicationId).to.equal(1n);
			expect(logs[0].args.isApproved).to.equal(true);
		});

		it('lets different users reuse the same application ID', async function () {
			const { registry, user1, user2 } = await deploy();

			await registry.write.anchorCreditDecision(
				[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
				{ account: user1.account },
			);
			await registry.write.anchorCreditDecision(
				[1n, PROOF_A2, PROOF_B2, PROOF_C2, SIG_APPROVED],
				{ account: user2.account },
			);

			const app1 = await registry.read.userApplications([user1.account.address, 1n]);
			const app2 = await registry.read.userApplications([user2.account.address, 1n]);
			expect(app1[2]).to.equal(true);
			expect(app2[2]).to.equal(true);
		});
	});

	describe('anchorCreditDecision reverts', function () {
		it('rejects an application ID the same user already used', async function () {
			const { registry, user1 } = await deploy();

			await registry.write.anchorCreditDecision(
				[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
				{ account: user1.account },
			);

			await expectRevert(
				registry.write.anchorCreditDecision(
					[1n, PROOF_A2, PROOF_B2, PROOF_C2, SIG_APPROVED],
					{ account: user1.account },
				),
				'Application ID already used.',
			);
		});

		it('rejects an invalid ZK proof', async function () {
			const { registry, mockVerifier, user1 } = await deploy();

			await mockVerifier.write.setResult([false]);

			await expectRevert(
				registry.write.anchorCreditDecision(
					[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
					{ account: user1.account },
				),
				'Invalid ZK proof.',
			);
		});

		it('rejects a proof already anchored by another user', async function () {
			const { registry, user1, user2 } = await deploy();

			await registry.write.anchorCreditDecision(
				[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
				{ account: user1.account },
			);

			await expectRevert(
				registry.write.anchorCreditDecision(
					[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
					{ account: user2.account },
				),
				'Proof already anchored.',
			);
		});

		it('rejects anchoring while paused', async function () {
			const { registry, owner, user1 } = await deploy();

			await registry.write.pause({ account: owner.account });

			await expectRevert(
				registry.write.anchorCreditDecision(
					[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
					{ account: user1.account },
				),
				'EnforcedPause',
			);
		});
	});

	describe('Pause / Unpause', function () {
		it('lets the owner pause and unpause', async function () {
			const { registry, owner, user1 } = await deploy();

			await registry.write.pause({ account: owner.account });
			await expectRevert(
				registry.write.anchorCreditDecision(
					[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
					{ account: user1.account },
				),
				'EnforcedPause',
			);

			await registry.write.unpause({ account: owner.account });
			await registry.write.anchorCreditDecision(
				[1n, PROOF_A, PROOF_B, PROOF_C, SIG_APPROVED],
				{ account: user1.account },
			);

			const [, , exists] = await registry.read.userApplications([
				user1.account.address,
				1n,
			]);
			expect(exists).to.equal(true);
		});

		it('rejects pause from a non-owner', async function () {
			const { registry, user1 } = await deploy();

			await expectRevert(
				registry.write.pause({ account: user1.account }),
				'OwnableUnauthorizedAccount',
			);
		});

		it('rejects unpause from a non-owner', async function () {
			const { registry, owner, user1 } = await deploy();

			await registry.write.pause({ account: owner.account });

			await expectRevert(
				registry.write.unpause({ account: user1.account }),
				'OwnableUnauthorizedAccount',
			);
		});
	});
});
