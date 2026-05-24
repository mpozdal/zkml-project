# ZKML Credit Classifier

A master's thesis project demonstrating **Zero-Knowledge Machine Learning (ZKML)** in the financial sector. The system verifies a client's creditworthiness using a logistic regression model **without revealing sensitive financial data** on the blockchain or to external servers.

ZK-SNARK proof generation runs locally in the browser (WebAssembly via SnarkJS). The smart contract on Sepolia only verifies the proof and anchors the final decision.

## System Architecture

The project is divided into 4 modules:

1. **`ml-model/` (Python, scikit-learn)**
   - Trains a classifier on the German Credit dataset.
   - Exports quantized weights, scaler parameters, and `model_config.json`.

2. **`zero-knowledge/` (Circom, SnarkJS)**
   - Circom circuit replicating fixed-point model inference.
   - Builds `credit_classifier.wasm` and proving keys (Groth16).

3. **`blockchain/` (Solidity, Hardhat Ignition)**
   - `Groth16Verifier.sol` — on-chain proof verifier.
   - `CreditRegistry.sol` — verifies proof and stores `(isApproved, timestamp)` per user and application ID.

4. **`web/` (Angular 21, Tailwind CSS, ethers.js)**
   - SPA with wallet connection (MetaMask).
   - Loads `model_config.json`, preprocesses form inputs (StandardScaler + fixed-point), generates proof in-browser, anchors decision on Sepolia.

## Data Flow

```
Form (raw features)
  → StandardScaler + SCALE=1000 (model_config.json)
  → Circom private inputs x[4]
  → Groth16 proof + public signal y (0/1)
  → CreditRegistry.anchorCreditDecision()
  → On-chain: isApproved, timestamp, applicationId
```

Raw form values (`duration`, `credit_amount`, etc.) never leave the browser as plain calldata. Only the ZK proof and public decision bit are sent in the transaction.

Fixed-point features are encoded as **unsigned 32-bit integers** (two's complement) before being passed to the Circom circuit, because `Num2Bits(32)` requires non-negative field elements.

## Prerequisites

- **Node.js** 18+
- **Python 3** (for model training)
- **MetaMask** with Sepolia ETH
- **npm**

## Setup

### 1. Train the model (optional — artifacts already included)

```bash
cd ml-model
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # if present, or install sklearn/openml manually
python train.py
cp model_config.json ../web/public/model_config.json
```

After retraining, always copy the updated `model_config.json` to `web/public/` and rebuild/redeploy the Circom verifier if weights changed.

### 2. Build ZK artifacts (optional — already in `web/public/`)

```bash
cd zero-knowledge
# follow your existing circom/snarkjs build pipeline
cp build/credit_classifier_js/credit_classifier.wasm ../web/public/
cp keys/credit_classifier_0001.zkey ../web/public/
cp ../blockchain/contracts/Verifier.sol   # regenerate after circuit change
```

### 3. Deploy contracts to Sepolia

```bash
cd blockchain
npm install
npx hardhat compile
npx hardhat ignition deploy ignition/modules/CreditZKMLModule.ts --network sepolia --reset
```

Update `NG_APP_REGISTRY_ADDRESS` in `web/.env` (copy from `web/.env.example` if needed) with the deployed `CreditRegistry` address from the Ignition output. The value is injected at build time via `web/src/environments/environment.ts` (auto-generated on `npm start` / `npm run build`).

### 4. Run the frontend

```bash
cd web
npm install
ng serve
```

Open **http://localhost:4200/**

## Run Tests

### Frontend preprocessing (matches Python pipeline)

```bash
cd web
npm test
```

This verifies that `exampleRaw` from `model_config.json` produces the same fixed-point features (`[-240, -28, -870, -1015]`), score (`786`), and decision (`1`) as `ml-model/train.py`.

### Manual sanity check with example values

Use these form values (from `exampleRaw`):

| Field | Value |
|-------|-------|
| Duration | 18 |
| Credit Amount | 3190 |
| Installment Commitment | 2 |
| Age | 24 |

Expected model decision: **Credit approved**.

## What Is Stored On-Chain

Per `(userAddress, applicationId)` the registry stores:

- `isApproved` — model decision (0 or 1)
- `timestamp` — block time
- `exists` — replay protection flag

The contract does **not** persist raw features, the ZK proof, or model weights. Private inputs remain in the browser.

## Security & Privacy

- **Verify, don't trust:** The verifier checks the Groth16 proof against the deployed circuit.
- **Private inputs:** `x[4]` are witness inputs in Circom; only public output `y` is revealed in the proof.
- **Preprocessing parity:** The Angular app uses the same StandardScaler parameters and fixed-point arithmetic as the Python training pipeline.

## Project Structure

```
zkml-credit-project/
├── ml-model/           # Training + model_config.json
├── zero-knowledge/     # Circom circuit + keys
├── blockchain/       # Solidity + Hardhat Ignition
└── web/                # Angular frontend
    └── public/
        ├── model_config.json
        ├── credit_classifier.wasm
        └── credit_classifier_0001.zkey
```
