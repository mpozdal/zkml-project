# ZKML Credit Classifier

Master's thesis prototype: **Zero-Knowledge Machine Learning (ZKML)** for consumer credit scoring.

A logistic regression model assesses creditworthiness **without putting raw financial features on-chain**. The applicant computes the decision and a Groth16 proof in the browser; a smart contract on Ethereum Sepolia only verifies the proof and anchors the public outcome.

**Live demo:** [credit-protocol.netlify.app](https://credit-protocol.netlify.app)  
**Repository:** [github.com/mpozdal/zkml-project](https://github.com/mpozdal/zkml-project)

## What this project shows

| Goal | How |
| --- | --- |
| Private inputs | Features stay in the browser as Circom private witnesses `x[4]`; only public bit `y` (approve / deny) is revealed |
| Bound model | Weights, bias and `SCALE` are **circuit constants**, not witness inputs — changing the model requires a new verifier |
| On-chain anchor | `CreditRegistry` verifies Groth16, stores decision + `proofHash`, blocks proof replay |
| Measurable claims | Attack suite (H1), gas vs direct on-chain scoring (H2), replay resistance (H3), prover timing |

This is a research prototype on the public **German Credit** dataset (4 features). It does **not** attest that form values are true bank data, and StandardScaler runs in the client **outside** the circuit.

## System architecture

```
ml-model/          Train logistic regression → model_config.json (scaler, quantized weights)
zero-knowledge/    Circom circuit + Groth16 keys + attack / prover benchmarks
blockchain/        Groth16Verifier + CreditRegistry (Sepolia) + Hardhat tests
web/               Angular SPA: preprocess → snarkjs.fullProve → MetaMask anchor
```

1. **`ml-model/`** (Python, scikit-learn) — German Credit, 4 features (`duration`, `credit_amount`, `installment_commitment`, `age`), fixed-point export (`SCALE = 1000`), optional `evaluate.py` report.
2. **`zero-knowledge/`** (Circom, SnarkJS) — hand-written circuit matching fixed-point inference; `credit_classifier.wasm` + proving key; hardened `credit_classifier_v2.circom`; attack artifacts under `attack/` and `attack-witness/`.
3. **`blockchain/`** (Solidity, Hardhat Ignition) — on-chain verifier + registry with `proofHash` / `usedProofHashes`; gas benchmark vs `PlainScoring`; attack tests.
4. **`web/`** (Angular, Tailwind, ethers.js, SnarkJS) — wallet, preprocessing, in-browser proving, Sepolia submit.

## End-to-end data flow

```
Form (raw features)
  → StandardScaler + trunc(z × 1000)          [client JS, model_config.json]
  → unsigned 32-bit (two's complement)       [for Circom Num2Bits(32)]
  → private inputs x[4]
  → Groth16 proof + public y ∈ {0,1}         [snarkjs in browser]
  → CreditRegistry.anchorCreditDecision()
  → on-chain: isApproved, timestamp, proofHash, applicationId
```

Raw features never appear as plain calldata. Model weights are not stored on-chain; they are compiled into the circuit / verifier key.

## What is stored on-chain

Per `(userAddress, applicationId)`:

| Field | Meaning |
| --- | --- |
| `isApproved` | Model decision from `publicSignals[0]` |
| `timestamp` | Block time |
| `proofHash` | `keccak256(abi.encode(proofA, proofB, proofC, publicSignals))` — audit link |
| `exists` | Application ID already used for this wallet |

`usedProofHashes` prevents anchoring the same proof twice (from another account or ID). The full proof remains in transaction calldata.

## Security model (short)

- **Protected:** forging a decision that does not match the **deployed** circuit/weights; reading private `x` from the chain; reusing a captured proof after it was anchored.
- **Not protected by ZK alone:** lying about raw form values; swapping client preprocessing; deploying a **new** verifier+registry with different weights; front-running an unconfirmed proof in the mempool; linking wallet address ↔ credit decision.

Attack experiments and hypothesis checks live in:

- `blockchain/test/WeightSubstitutionAttack.test.ts`
- `blockchain/test/WitnessForgeryAttack.test.ts`
- `blockchain/test/ReplayAttack.test.ts`
- `blockchain/test/GasBenchmark.test.ts`
- `zero-knowledge/attack/`, `zero-knowledge/attack-witness/`

## Prerequisites

- Node.js 22+ (required by Hardhat 3)
- Python 3 (optional retraining / evaluation)
- MetaMask + Sepolia ETH
- Circom 2.x / SnarkJS toolchain (optional circuit rebuild)

## Setup

### 1. Train the model (optional — artifacts included)

```bash
cd ml-model
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python train.py
cp model_config.json ../web/public/model_config.json
```

After changing weights: update the Circom constants, rebuild keys/verifier, redeploy.

### 2. Build ZK artifacts (optional — already in `web/public/`)

```bash
cd zero-knowledge
# compile circuit, run trusted setup / contribute, export Verifier.sol
cp build/credit_classifier_js/credit_classifier.wasm ../web/public/
cp keys/credit_classifier_0001.zkey ../web/public/
```

### 3. Deploy contracts (Sepolia)

```bash
cd blockchain
npm install
npx hardhat compile
npx hardhat ignition deploy ignition/modules/CreditZKMLModule.ts --network sepolia --reset
```

Set `NG_APP_REGISTRY_ADDRESS` in `web/.env` (see `web/.env.example`). Build injects it via `web/scripts/generate-environment.mjs`.

### 4. Run the frontend

```bash
cd web
npm install
npm start   # or: ng serve
```

Open http://localhost:4200/

### 5. Netlify

Root `netlify.toml` builds `web/`. Set `NG_APP_REGISTRY_ADDRESS` in the Netlify env UI.

## Tests & benchmarks

```bash
# Preprocessing parity with Python (exampleRaw → features, score, decision)
cd web && npm test

# Registry, replay, weight substitution, witness forgery, gas
cd blockchain && npx hardhat test

# Optional prover timing (Node)
cd zero-knowledge && node benchmark-prover.mjs
```

Manual UI check (`model_config.json` → `exampleRaw`): duration **18**, amount **3190**, installment **2**, age **24** → expected **approved**.

Published measurement snapshots: `blockchain/gas-benchmark.json`, `zero-knowledge/prover-benchmark.json`, `ml-model/evaluation_report.json`.

## Project layout

```
zkml-credit-project/
├── ml-model/                 # train.py, evaluate.py, model_config.json
├── zero-knowledge/
│   ├── circuits/             # credit_classifier(.circom), v2, tampered variants
│   ├── keys/                 # zkey + verification_key.json
│   ├── attack/               # H1 weight / VK swap experiment artifacts
│   ├── attack-witness/       # H1 witness-forgery experiment
│   └── benchmark-prover.mjs
├── blockchain/
│   ├── contracts/            # CreditRegistry, Verifier, PlainScoring, mocks
│   ├── test/                 # unit + attack + gas benchmarks
│   └── ignition/             # Sepolia deployment
├── web/                      # Angular app + public wasm/zkey/config
└── netlify.toml
```

## License / academic use

Built as a master's thesis demonstration of ZKML in finance. Use and cite accordingly; not a production credit-decision system.
