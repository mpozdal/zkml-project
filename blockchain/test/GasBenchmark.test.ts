import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from 'chai';
import { network } from 'hardhat';

// ===========================================================================
// Pomiar kosztu gazu dla hipotezy H2.
//
// Mierzone sa trzy rzeczy:
//   1. Pelny zapis decyzji z PRAWDZIWYM weryfikatorem Groth16.
//   2. Ten sam zapis z makieta weryfikatora - daje koszt samej warstwy
//      zapisu, a roznica wzgledem punktu 1 daje koszt weryfikacji dowodu.
//   3. Zapis decyzji przez kontrakt liczacy model bezposrednio w lancuchu,
//      dla rosnacej liczby cech - daje krzywa kosztu w funkcji n.
//
// Wynik zapisywany jest do pliku gas-benchmark.json, ktory stanowi zalacznik
// do rozdzialu 5 pracy.
// ===========================================================================

const ARTIFACTS = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../zero-knowledge/attack',
);

const REPORT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../gas-benchmark.json',
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

const FEATURE_COUNTS = [4, 8, 16, 32, 64];

const measurements: Record<string, number> = {};

function record(label: string, gas: bigint): void {
	measurements[label] = Number(gas);
	console.log(`\n      ${label.padEnd(46)} ${gas.toString().padStart(9)} gazu`);
}

describe('Pomiar gazu: wariant z dowodem wobec wariantu bezposredniego', function () {
	const honestProof = toSolidityArgs(load<SnarkProof>('proof_honest.json'));
	const honestSignals = load<string[]>('public_honest.json');

	const victimProof = toSolidityArgs(load<SnarkProof>('proof_victim.json'));
	const victimSignals = load<string[]>('public_victim.json');

	it('zapis decyzji z prawdziwym weryfikatorem Groth16', async function () {
		const { viem } = await network.create();
		const publicClient = await viem.getPublicClient();
		const [, applicant] = await viem.getWalletClients();

		const verifier = await viem.deployContract('Groth16Verifier');
		const registry = await viem.deployContract('CreditRegistry', [
			verifier.address,
		]);

		// Odmowa (y = 0): pole isApproved pozostaje zerem.
		const denyHash = await registry.write.anchorCreditDecision(
			[1n, honestProof.a, honestProof.b, honestProof.c, [BigInt(honestSignals[0])]],
			{ account: applicant.account },
		);
		const denyReceipt = await publicClient.waitForTransactionReceipt({
			hash: denyHash,
		});
		record('Groth16, decyzja odmowna (y = 0)', denyReceipt.gasUsed);

		// Zgoda (y = 1): dodatkowy zapis niezerowej wartosci do szczeliny.
		const approveHash = await registry.write.anchorCreditDecision(
			[2n, victimProof.a, victimProof.b, victimProof.c, [BigInt(victimSignals[0])]],
			{ account: applicant.account },
		);
		const approveReceipt = await publicClient.waitForTransactionReceipt({
			hash: approveHash,
		});
		record('Groth16, decyzja pozytywna (y = 1)', approveReceipt.gasUsed);

		expect(denyReceipt.gasUsed).to.be.greaterThan(0n);
	});

	it('zapis decyzji z makieta weryfikatora (sama warstwa zapisu)', async function () {
		const { viem } = await network.create();
		const publicClient = await viem.getPublicClient();
		const [, applicant] = await viem.getWalletClients();

		const mock = await viem.deployContract('MockVerifier');
		const registry = await viem.deployContract('CreditRegistry', [
			mock.address,
		]);

		const denyHash = await registry.write.anchorCreditDecision(
			[1n, honestProof.a, honestProof.b, honestProof.c, [0n]],
			{ account: applicant.account },
		);
		const denyReceipt = await publicClient.waitForTransactionReceipt({
			hash: denyHash,
		});
		record('makieta, decyzja odmowna (y = 0)', denyReceipt.gasUsed);

		const approveHash = await registry.write.anchorCreditDecision(
			[2n, victimProof.a, victimProof.b, victimProof.c, [1n]],
			{ account: applicant.account },
		);
		const approveReceipt = await publicClient.waitForTransactionReceipt({
			hash: approveHash,
		});
		record('makieta, decyzja pozytywna (y = 1)', approveReceipt.gasUsed);

		expect(denyReceipt.gasUsed).to.be.greaterThan(0n);
	});

	it('zapis decyzji liczonej bezposrednio w lancuchu, dla rosnacej liczby cech', async function () {
		const { viem } = await network.create();
		const publicClient = await viem.getPublicClient();
		const [, applicant] = await viem.getWalletClients();

		const plain = await viem.deployContract('PlainScoring');

		// Cechy o jednorodnym znaku i rzedzie wielkosci. Mieszanie liczb
		// dodatnich i ujemnych zaburzaloby pomiar, bo ujemna liczba int256
		// ma w danych wywolania 32 bajty niezerowe (16 gazu za bajt), a mala
		// liczba dodatnia - prawie same bajty zerowe (4 gazu za bajt).
		for (const n of FEATURE_COUNTS) {
			const features = Array.from({ length: n }, (_, i) =>
				BigInt(-240 - (i % 16)),
			);

			const hash = await plain.write.anchorPlainDecision(
				[BigInt(n), features],
				{ account: applicant.account },
			);
			const receipt = await publicClient.waitForTransactionReceipt({ hash });
			record(`bezposredni rachunek, n = ${String(n).padStart(2)} cech`, receipt.gasUsed);
		}

		expect(measurements['bezposredni rachunek, n = 64 cech']).to.be.greaterThan(
			measurements['bezposredni rachunek, n =  4 cech'],
		);
	});

	after(function () {
		const plainEntries = FEATURE_COUNTS.map((n) => ({
			n,
			gas: measurements[
				`bezposredni rachunek, n = ${String(n).padStart(2)} cech`
			],
		})).filter((entry) => typeof entry.gas === 'number');

		let slope: number | null = null;
		let intercept: number | null = null;
		let breakEven: number | null = null;

		const zkApprove = measurements['Groth16, decyzja pozytywna (y = 1)'];

		if (plainEntries.length >= 2) {
			// Regresja liniowa metoda najmniejszych kwadratow na wszystkich
			// punktach pomiarowych, a nie tylko na skrajnych.
			const k = plainEntries.length;
			const sumN = plainEntries.reduce((acc, e) => acc + e.n, 0);
			const sumG = plainEntries.reduce((acc, e) => acc + e.gas, 0);
			const sumNN = plainEntries.reduce((acc, e) => acc + e.n * e.n, 0);
			const sumNG = plainEntries.reduce((acc, e) => acc + e.n * e.gas, 0);

			slope = (k * sumNG - sumN * sumG) / (k * sumNN - sumN * sumN);
			intercept = (sumG - slope * sumN) / k;

			if (typeof zkApprove === 'number' && slope > 0) {
				breakEven = Math.ceil((zkApprove - intercept) / slope);
			}
		}

		const summary = {
			measurements,
			plainCostModel:
				slope === null
					? null
					: {
							gasPerFeature: Math.round(slope),
							fixedCost: Math.round(intercept ?? 0),
						},
			breakEvenFeatureCount: breakEven,
			note:
				'Pomiar w emulatorze Hardhat. Koszt wariantu bezposredniego zawiera ' +
				'takze koszt danych wywolania rosnacy z liczba cech oraz skrot wejscia ' +
				'jako kotwice audytowa.',
		};

		writeFileSync(REPORT, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

		console.log('\n      --- podsumowanie ---');
		if (slope !== null) {
			console.log(
				`      koszt stały wariantu bezposredniego : ${Math.round(intercept ?? 0)} gazu`,
			);
			console.log(`      koszt jednej cechy                  : ${Math.round(slope)} gazu`);
		}
		if (breakEven !== null) {
			console.log(`      prog oplacalnosci wariantu z dowodem: n* = ${breakEven}`);
		}
		console.log(`      raport zapisany do gas-benchmark.json`);
	});
});
