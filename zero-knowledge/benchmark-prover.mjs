/**
 * Pomiar czasu generowania i weryfikacji dowodu Groth16.
 *
 * Skrypt uruchamia ten sam kod, ktory dziala w przegladarce (generator
 * swiadka w WebAssembly oraz snarkjs), i mierzy czas oraz szczytowe zuzycie
 * pamieci. Wynik jest zalacznikiem do punktu 5.4 pracy.
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import * as snarkjs from 'snarkjs';

const WASM = 'build/credit_classifier_js/credit_classifier.wasm';
const ZKEY = 'keys/credit_classifier_0001.zkey';
const VKEY = 'keys/verification_key.json';

const RUNS = 20;

const input = {
	x: [
		'4294967056',
		'4294967268',
		'4294966426',
		'4294966281',
	],
};

const vKey = JSON.parse(readFileSync(VKEY, 'utf8'));

function stats(samples) {
	const sorted = [...samples].sort((a, b) => a - b);
	const sum = sorted.reduce((acc, value) => acc + value, 0);
	return {
		min: Number(sorted[0].toFixed(1)),
		median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(1)),
		mean: Number((sum / sorted.length).toFixed(1)),
		max: Number(sorted[sorted.length - 1].toFixed(1)),
	};
}

const proveTimes = [];
const verifyTimes = [];
let lastProof = null;
let lastSignals = null;

// Przebieg rozgrzewajacy - pierwsze wywolanie obejmuje kompilacje WebAssembly.
const warmStart = performance.now();
await snarkjs.groth16.fullProve(input, WASM, ZKEY);
const warmupMs = Number((performance.now() - warmStart).toFixed(1));

for (let i = 0; i < RUNS; i += 1) {
	const start = performance.now();
	const { proof, publicSignals } = await snarkjs.groth16.fullProve(
		input,
		WASM,
		ZKEY,
	);
	proveTimes.push(performance.now() - start);

	lastProof = proof;
	lastSignals = publicSignals;

	const verifyStart = performance.now();
	const ok = await snarkjs.groth16.verify(vKey, publicSignals, proof);
	verifyTimes.push(performance.now() - verifyStart);

	if (!ok) {
		throw new Error('dowod nie przeszedl weryfikacji lokalnej');
	}
}

const report = {
	runs: RUNS,
	warmupMs,
	proveMs: stats(proveTimes),
	verifyLocalMs: stats(verifyTimes),
	artifactSizesBytes: {
		wasm: statSync(WASM).size,
		zkey: statSync(ZKEY).size,
		verificationKey: statSync(VKEY).size,
	},
	peakHeapUsedBytes: process.memoryUsage().heapUsed,
	rssBytes: process.memoryUsage().rss,
	publicSignals: lastSignals,
	proofSizeBytes: Buffer.byteLength(JSON.stringify(lastProof), 'utf8'),
	runtime: `${process.release?.name ?? 'node'} ${process.version}`,
};

console.log(JSON.stringify(report, null, 2));
writeFileSync('prover-benchmark.json', `${JSON.stringify(report, null, 2)}\n`);

// snarkjs pozostawia otwarte watki robocze, wiec proces nie konczy sie sam.
process.exit(0);
