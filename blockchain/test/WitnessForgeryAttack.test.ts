import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from 'chai';
import { network } from 'hardhat';

// ===========================================================================
// Atak C: falszowanie swiadka w obrebie NIEZMIENIONEGO obwodu.
//
// Ataki A i B (WeightSubstitutionAttack.test.ts) zakladaly, ze napastnik albo
// podmienia sygnal publiczny, albo rekompiluje obwod z innymi wagami - a wiec
// zmienia klucz weryfikujacy. Ten test bada mocniejszy scenariusz: uklad
// ograniczen i klucz weryfikujacy pozostaja DOKLADNIE te same, zmienia sie
// wylacznie sposob wyliczenia swiadka.
//
// Podstawa ataku jest brak ograniczenia 0 <= absRem < SCALE w obwodzie.
// Rownanie absProd === absQuot * SCALE + absRem wiaze dwie wartosci
// przypisywane przez dowodzacego, wiec dopuszcza rodzine rozwiazan
// (absQuot - k, absRem + k * SCALE). Przesuniecie k zmienia wynik modelu
// o wielokrotnosc SCALE i pozwala odwrocic decyzje.
//
// Wektor wejsciowy jest ten sam, ktorego uzyto w atakach A i B: uczciwy model
// wystawia score -534 i decyzje odmowna (y = 0). Dowod ze sfalszowanym
// swiadkiem deklaruje y = 1.
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

async function deployWithRealVerifier() {
	const { viem } = await network.create();
	const [owner, applicant] = await viem.getWalletClients();

	const verifier = await viem.deployContract('Groth16Verifier');
	const registry = await viem.deployContract('CreditRegistry', [
		verifier.address,
	]);

	return { registry, verifier, owner, applicant };
}

describe('Atak C: falszowanie swiadka bez zmiany obwodu', function () {
	const honestSignals = load<string[]>('public_honest.json');
	const forgedProof = toSolidityArgs(load<SnarkProof>('forged_proof.json'));
	const forgedSignals = load<string[]>('forged_public.json');

	it('ten sam wniosek daje przeciwne decyzje', function () {
		expect(honestSignals[0]).to.equal('0');
		expect(forgedSignals[0]).to.equal('1');

		console.log(
			`\n      uczciwy swiadek     -> y = ${honestSignals[0]} (odmowa, score = -534)`,
		);
		console.log(
			`      sfalszowany swiadek -> y = ${forgedSignals[0]} (zgoda, score przesuniety o 999)`,
		);
	});

	it('prawdziwy weryfikator Groth16 przyjmuje sfalszowany dowod', async function () {
		const { verifier } = await deployWithRealVerifier();

		const accepted = await verifier.read.verifyProof([
			forgedProof.a,
			forgedProof.b,
			forgedProof.c,
			[BigInt(forgedSignals[0])],
		]);

		console.log(
			`\n      verifyProof(sfalszowany dowod) = ${accepted}  <-- oczekiwano false`,
		);

		expect(
			accepted,
			'weryfikator przyjal dowod zbudowany na sfalszowanym swiadku',
		).to.equal(true);
	});

	it('rejestr zapisuje zgode kredytowa, ktorej model nie wystawil', async function () {
		const { registry, applicant } = await deployWithRealVerifier();

		await registry.write.anchorCreditDecision(
			[
				7n,
				forgedProof.a,
				forgedProof.b,
				forgedProof.c,
				[BigInt(forgedSignals[0])],
			],
			{ account: applicant.account },
		);

		const [isApproved, , exists] = await registry.read.userApplications([
			applicant.account.address,
			7n,
		]);

		console.log(
			`\n      wpis w rejestrze: exists = ${exists}, isApproved = ${isApproved}`,
		);
		console.log(
			'      WNIOSEK: hipoteza H1 zostaje odrzucona - istnieje sciezka zapisu',
		);
		console.log(
			'               decyzji niezgodnej z opublikowanymi wagami przy',
		);
		console.log('               niezmienionym adresie weryfikatora.');

		expect(exists).to.equal(true);
		expect(
			isApproved,
			'rejestr zawiera zgode, ktorej uczciwy model nie wystawil',
		).to.equal(true);
	});
});
