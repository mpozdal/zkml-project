# ZKML Credit Classifier 🏦🛡️

A master's thesis project demonstrating the use of **Zero-Knowledge Machine Learning (ZKML)** in the financial sector. The system enables the verification of a client's creditworthiness based on an AI model, **without revealing their sensitive financial data** on the blockchain or to external servers.

All cryptographic computations (ZK-SNARK proof generation) are performed locally in the client's browser (Edge Computing / WebAssembly), and the smart contract on the blockchain only verifies the mathematical correctness of this proof.

## 🏗️ System Architecture

The project is divided into 4 main modules, reflecting the full lifecycle of a ZKML system:

1. **`ml-model/` (Python, Scikit-Learn)**
   * Training a classification model on historical financial data (e.g., German Credit Dataset).
   * Extraction of model weights and bias into a format accepted by cryptographic circuits.

2. **`zero-knowledge/` (Circom, SnarkJS)**
   * Mathematical `.circom` circuit replicating the ML model's logic.
   * Compilation to WebAssembly (`.wasm`) and generation of proving and verifying keys (`.zkey`, `.json`) using the Groth16 protocol.

3. **`blockchain/` (Solidity, Hardhat)**
   * `CreditRegistry.sol` smart contract acting as an On-Chain Verifier.
   * Ensures that the ZK-SNARK proof is mathematically valid, and upon success, anchors the decision on-chain with Replay Protection.

4. **`web/` (Angular 21, Tailwind CSS, Viem)**
   * User interface implemented as a Single Page Application (SPA).
   * The `snarkjs` module runs directly in the browser to generate the proof based on the provided inputs.
   * Web3 network integration using the Viem library.

## 🚀 How to Run Locally

### Prerequisites
* **Node.js** (v18+)
* **Angular CLI** (`npm install -g @angular/cli`)
* Yarn / NPM

### Step 1: Start the Local Blockchain
Open a terminal, navigate to the blockchain directory, and start the local node:

```bash
cd blockchain
npx hardhat node
```

*(The node must run in the background. Copy one of the generated private keys if you want to test transactions from a different account).*

### Step 2: Deploy the Smart Contract (If needed)
In a new terminal window (inside the `blockchain` folder), run:

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

*(Ensure the deployed contract address matches the `CONTRACT_ADDRESS` variable in the Angular service).*

### Step 3: Start the Frontend Application
Navigate to the main web app directory, install dependencies, and start the development server:

```bash
cd web
npm install
ng serve
```

The application will be available at: **http://localhost:4200/**

## 🔒 Security & Privacy
* **"Don't Trust, Verify" Principle:** The smart contract accepts the transaction only if the proof mathematically aligns with the bank's public model weights.
* **Data Protection:** Financial variables, such as income or credit history, are treated as Private Inputs in the Circom circuit and **never** reach the network (Call Data) or database. Only the client hash and the public decision are recorded.
