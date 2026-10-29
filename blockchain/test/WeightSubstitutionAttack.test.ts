import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from 'chai';
import { network } from 'hardhat';

// ===========================================================================
// Atak polegajacy na podmianie wag modelu.
//
// W przeciwienstwie do CreditRegistry.test.ts, ten zestaw uzywa PRAWDZIWEGO
// weryfikatora Groth16 wygenerowanego przez snarkjs, a nie mocka. Dowody sa
// wczytywane z artefaktow wytworzonych w katalogu zero-knowledge/attack.
//
// Scenariusz: wnioskodawca o profilu wysokiego ryzyka (dlugi okres
// kredytowania, wysoka kwota, mlody wiek). Uczciwy model wystawia score -534
// i odrzuca wniosek. Napastnik odwraca znak wagi cechy "duration", przez co
// jego model wystawia score +562 i wniosek akceptuje.
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

/**
 * Przeksztalca dowod snarkjs na argumenty weryfikatora w Solidity.
 * Wspolrzedne punktu G2 (pi_b) musza zostac zamienione miejscami - snarkjs
 * serializuje je w odwrotnej kolejnosci niz oczekuje precompile parowania.
 */
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

/**
 * Wymusza revert i wypisuje przechwycony komunikat lancucha, aby przebieg
 * testu stanowil czytelny material dowodowy.
 */
async function expectRevert(
	call: Promise<unknown>,
	reason: string,
): Promise<void> {
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
	expect(
		threw,
		`oczekiwano revertu "${reason}", transakcja przeszla`,
	).to.equal(true);
}

/** Wdraza prawdziwy weryfikator Groth16 wraz z rejestrem kredytowym. */
async function deployWithRealVerifier() {
	const { viem } = await network.create();

	const [owner, applicant] = await viem.getWalletClients();

	const verifier = await viem.deployContract('Groth16Verifier');
	const registry = await viem.deployContract('CreditRegistry', [
		verifier.address,
	]);

	return { registry, verifier, owner, applicant };
}

describe('Atak: podmiana wag modelu', function () {
	const honestProof = toSolidityArgs(load<SnarkProof>('proof_honest.json'));
	const honestSignals = load<string[]>('public_honest.json');

	const tamperedProof = toSolidityArgs(
		load<SnarkProof>('proof_tampered.json'),
	);
	const tamperedSignals = load<string[]>('public_tampered.json');

	it('artefakty opisuja ten sam wniosek z przeciwnymi decyzjami', function () {
		expect(honestSignals[0]).to.equal('0');
		expect(tamperedSignals[0]).to.equal('1');

		console.log(
			`\n      model uczciwy      -> decyzja y = ${honestSignals[0]} (odmowa)`,
		);
		console.log(
			`      model podmieniony  -> decyzja y = ${tamperedSignals[0]} (zgoda)`,
		);
	});

	it('BASELINE: uczciwy dowod zostaje przyjety i zapisany jako odmowa', async function () {
		const { registry, applicant } = await deployWithRealVerifier();

		await registry.write.anchorCreditDecision(
			[
				1n,
				honestProof.a,
				honestProof.b,
				honestProof.c,
				[BigInt(honestSignals[0])],
			],
			{ account: applicant.account },
		);

		const [isApproved, , exists] = await registry.read.userApplications([
			applicant.account.address,
			1n,
		]);

		expect(exists).to.equal(true);
		expect(isApproved).to.equal(false);
	});

	it('ATAK B: dowod z podmienionymi wagami zostaje odrzucony', async function () {
		const { registry, applicant } = await deployWithRealVerifier();

		await expectRevert(
			registry.write.anchorCreditDecision(
				[
					2n,
					tamperedProof.a,
					tamperedProof.b,
					tamperedProof.c,
					[BigInt(tamperedSignals[0])],
				],
				{ account: applicant.account },
			),
			'Invalid ZK proof.',
		);

		const [, , exists] = await registry.read.userApplications([
			applicant.account.address,
			2n,
		]);
		expect(
			exists,
			'odrzucony wniosek nie moze trafic do rejestru',
		).to.equal(false);
	});

	it('ATAK A: podmiana samego sygnalu publicznego zostaje odrzucona', async function () {
		const { registry, applicant } = await deployWithRealVerifier();

		// Uczciwy dowod, ale deklarowana decyzja podmieniona z odmowy na zgode.
		await expectRevert(
			registry.write.anchorCreditDecision(
				[3n, honestProof.a, honestProof.b, honestProof.c, [1n]],
				{ account: applicant.account },
			),
			'Invalid ZK proof.',
		);

		const [, , exists] = await registry.read.userApplications([
			applicant.account.address,
			3n,
		]);
		expect(exists).to.equal(false);
	});
});
