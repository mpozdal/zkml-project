import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from 'chai';
import { network } from 'hardhat';

// ===========================================================================
// Atak powtorzeniowy (replay attack).
//
// Dowod zk-SNARK jest zwyklym ciagiem danych i pozostaje wazny bez wzgledu
// na to, kto go przedklada. Sama warstwa kryptograficzna nie chroni zatem
// przed ponownym uzyciem - zabezpieczenie musi pochodzic z warstwy aplikacji,
// gdzie kontrakt prowadzi rejestr zuzytych skrotow dowodow.
//
// Scenariusz: ofiara zakotwicza wlasna pozytywna decyzje kredytowa (y = 1).
// Napastnik odczytuje dowod z publicznego lancucha i probuje przedlozyc go
// ponownie z wlasnego portfela, aby przypisac sobie cudza zgode kredytowa.
// ===========================================================================

const ARTIFACTS = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../zero-knowledge/attack',
);

interface SnarkProof {
	pi_a: [string, string, string];
	pi_b: [[string, string], [string, string], [string, string]];
	pi_c: [string, string, string];
}

function load<T>(fileName: string): T {
	return JSON.parse(readFileSync(resolve(ARTIFACTS, fileName), 'utf8')) as T;
}

/** Wspolrzedne G2 wymagaja zamiany kolejnosci wzgledem serializacji snarkjs. */
function toSolidityArgs(proof: SnarkProof) {
	return {
		a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])] as [bigint, bigint],
		b: [
			[BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
			[BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
		] as [[bigint, bigint], [bigint, bigint]],
		c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])] as [bigint, bigint],
	};
}

async function expectRevert(call: Promise<unknown>, reason: string): Promise<void> {
	let threw = false;
	try {
		await call;
	} catch (err: unknown) {
		threw = true;
		const msg = err instanceof Error ? err.message : String(err);
		expect(msg).to.include(reason, `niepoprawny powod revertu: ${msg}`);
		const summary = msg
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.slice(0, 2)
			.join(' ');
		console.log(`\n      [ODRZUCONO PRZEZ LANCUCH] ${summary}`);
	}
	expect(threw, `oczekiwano revertu "${reason}", transakcja przeszla`).to.equal(true);
}

async function deployWithRealVerifier() {
	const { viem } = await network.create();

	const [, victim, attacker] = await viem.getWalletClients();

	const verifier = await viem.deployContract('Groth16Verifier');
	const registry = await viem.deployContract('CreditRegistry', [verifier.address]);

	return { registry, victim, attacker };
}

describe('Atak powtorzeniowy', function () {
	const proof = toSolidityArgs(load<SnarkProof>('proof_victim.json'));
	const signals = load<string[]>('public_victim.json');
	const decision = [BigInt(signals[0])] as [bigint];

	it('dowod ofiary niesie decyzje pozytywna', function () {
		expect(signals[0]).to.equal('1');
		console.log(`\n      dowod ofiary -> decyzja y = ${signals[0]} (zgoda kredytowa)`);
	});

	it('BASELINE: ofiara zakotwicza wlasna decyzje', async function () {
		const { registry, victim } = await deployWithRealVerifier();

		await registry.write.anchorCreditDecision(
			[1n, proof.a, proof.b, proof.c, decision],
			{ account: victim.account },
		);

		const [isApproved, , exists] = await registry.read.userApplications([
			victim.account.address,
			1n,
		]);
		expect(exists).to.equal(true);
		expect(isApproved).to.equal(true);
	});

	it('REPLAY: napastnik nie moze przedlozyc przechwyconego dowodu', async function () {
		const { registry, victim, attacker } = await deployWithRealVerifier();

		await registry.write.anchorCreditDecision(
			[1n, proof.a, proof.b, proof.c, decision],
			{ account: victim.account },
		);

		// Napastnik uzywa identycznego dowodu z wlasnego portfela.
		await expectRevert(
			registry.write.anchorCreditDecision(
				[1n, proof.a, proof.b, proof.c, decision],
				{ account: attacker.account },
			),
			'Proof already anchored.',
		);

		const [, , exists] = await registry.read.userApplications([
			attacker.account.address,
			1n,
		]);
		expect(exists, 'napastnik nie moze uzyskac wpisu w rejestrze').to.equal(false);
	});

	it('REPLAY: zmiana identyfikatora wniosku nie omija zabezpieczenia', async function () {
		const { registry, victim, attacker } = await deployWithRealVerifier();

		await registry.write.anchorCreditDecision(
			[1n, proof.a, proof.b, proof.c, decision],
			{ account: victim.account },
		);

		// Skrot dowodu nie obejmuje applicationId, wiec inny identyfikator
		// prowadzi do tej samej wartosci w mapowaniu usedProofHashes.
		await expectRevert(
			registry.write.anchorCreditDecision(
				[999n, proof.a, proof.b, proof.c, decision],
				{ account: attacker.account },
			),
			'Proof already anchored.',
		);
	});

	it('OGRANICZENIE: dowod nie jest zwiazany z adresem wnioskodawcy', async function () {
		const { registry, victim, attacker } = await deployWithRealVerifier();

		// Napastnik podglada transakcje ofiary w mempoolu i uprzedza ja
		// wlasnym zgloszeniem tego samego dowodu (front-running).
		await registry.write.anchorCreditDecision(
			[1n, proof.a, proof.b, proof.c, decision],
			{ account: attacker.account },
		);

		const [isApproved, , exists] = await registry.read.userApplications([
			attacker.account.address,
			1n,
		]);
		expect(exists).to.equal(true);
		expect(isApproved).to.equal(true);

		// Ofiara traci mozliwosc zakotwiczenia wlasnej decyzji.
		await expectRevert(
			registry.write.anchorCreditDecision(
				[1n, proof.a, proof.b, proof.c, decision],
				{ account: victim.account },
			),
			'Proof already anchored.',
		);

		console.log(
			'\n      UWAGA: pierwszy nadawca przejmuje decyzje - brak powiazania dowodu z adresem',
		);
	});

	it('skrot dowodu zostaje trwale oznaczony jako zuzyty', async function () {
		const { registry, victim } = await deployWithRealVerifier();

		await registry.write.anchorCreditDecision(
			[1n, proof.a, proof.b, proof.c, decision],
			{ account: victim.account },
		);

		const [, , , proofHash] = await registry.read.userApplications([
			victim.account.address,
			1n,
		]);

		expect(await registry.read.usedProofHashes([proofHash])).to.equal(true);
		console.log(`\n      proofHash oznaczony jako zuzyty: ${proofHash}`);
	});
});
