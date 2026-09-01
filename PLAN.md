# Plan Działania — Praca Magisterska: ZKML Credit Classifier (Client-Side)

## Cel pracy

Zbudowanie prototypu systemu, w którym **cała logika** (inferencja ML, generowanie dowodu ZK, interakcja z blockchainem) działa **po stronie klienta** (w przeglądarce), bez żadnego serwera backendowego. Blockchain pełni rolę publicznego audytora — przechowuje jedynie krótki dowód (proof), hashe i decyzję, a dane prywatne użytkownika nigdy nie opuszczają jego urządzenia.

---

## Stan obecny repozytorium

| Moduł | Status | Opis |
|---|---|---|
| `ml-model/` | **Gotowy** | Trening Logistic Regression (Scikit-Learn) na German Credit Dataset, ekstrakcja wag/biasu do `input.json` |
| `zero-knowledge/` | **Gotowy** | Obwód Circom `credit_classifier.circom`, skompilowany WASM, klucze proving/verification (Groth16) |
| `blockchain/` | **Brak** | Smart kontrakt Solidity (weryfikator) — do zaimplementowania |
| `web/` | **Brak** | Frontend Angular — do zaimplementowania |

---

## Architektura Client-Side

```
┌─────────────────────────────────────────────────────┐
│                    PRZEGLĄDARKA                      │
│                                                     │
│  ┌──────────┐   ┌───────────┐   ┌───────────────┐  │
│  │ Angular  │──▶│ SnarkJS   │──▶│  Viem / Web3  │  │
│  │ Frontend │   │ (WASM)    │   │  (Wallet)     │  │
│  └──────────┘   └───────────┘   └───────┬───────┘  │
│       │          proof.json             │           │
│       │          public.json            │           │
│       ▼                                 ▼           │
│  Dane klienta                  MetaMask / Wallet    │
│  (prywatne,                    (podpis tx)          │
│   nigdy nie opuszczają                              │
│   przeglądarki)                                     │
└─────────────────────────────────────────────────────┘
                                          │
                                          ▼
                              ┌───────────────────┐
                              │   Blockchain       │
                              │   (Ethereum /      │
                              │    Hardhat local)  │
                              │                    │
                              │ CreditRegistry.sol │
                              │ - verifyProof()    │
                              │ - hash wejścia     │
                              │ - hash wyniku      │
                              │ - model ID         │
                              │ - replay protection│
                              └───────────────────┘
```

**Kluczowa zasada:** Żaden serwer nie przetwarza danych. Przeglądarka:
1. Posiada wagi modelu ML (publiczne, wbudowane w obwód ZK)
2. Przyjmuje dane klienta (prywatne inputs)
3. Generuje ZK-SNARK proof lokalnie (via SnarkJS + WASM)
4. Wysyła proof + publiczne sygnały do smart kontraktu przez wallet

---

## Plan pracy — podział na fazy

### FAZA 0: Przygotowanie środowiska i narzędzi
**Priorytet:** Krytyczny | **Zależności:** Brak

- [ ] Zainstalować Node.js 18+, Angular CLI, Hardhat
- [ ] Skonfigurować edytor (VSCode + rozszerzenia: Solidity, Angular)
- [ ] Sprawdzić, czy istniejące artefakty ZK (`.wasm`, `.zkey`) działają z SnarkJS w Node.js (test poza przeglądarką)
- [ ] Zweryfikować `input.json` — uruchomić `snarkjs groth16 fullprove` z CLI i sprawdzić, czy proof jest poprawny

**Weryfikacja:** Proof generuje się poprawnie z CLI, `snarkjs groth16 verify` zwraca `true`.

---

### FAZA 1: Smart Kontrakt (Solidity / Hardhat)
**Priorytet:** Wysoki | **Zależności:** Faza 0
**Katalog:** `blockchain/`

#### 1.1 Inicjalizacja projektu Hardhat
- [ ] `mkdir blockchain && cd blockchain && npx hardhat init` (TypeScript project)
- [ ] Zainstalować zależności: `@nomicfoundation/hardhat-toolbox`

#### 1.2 Wygenerowanie kontraktu weryfikatora
- [ ] Użyć SnarkJS do wygenerowania Solidity verifier:
  ```
  snarkjs zkey export solidityverifier credit_classifier_0000.zkey Verifier.sol
  ```
- [ ] Przenieść `Verifier.sol` do `blockchain/contracts/`

#### 1.3 Kontrakt CreditRegistry.sol
- [ ] Napisać kontrakt `CreditRegistry.sol` z następującą logiką:

| Funkcja | Opis |
|---|---|
| `submitProof(proof, publicSignals)` | Weryfikuje proof przez Verifier, zapisuje wynik on-chain |
| `getDecision(clientHash)` | Zwraca decyzję kredytową dla danego hasha klienta |

**Dane przechowywane on-chain:**

| Element | Typ Solidity | Opis |
|---|---|---|
| Proof zk-SNARK | weryfikowany w locie, nie przechowywany | Weryfikacja poprawności |
| Hash wejścia klienta | `bytes32` | Dowód, że dane są spójne |
| Decyzja (0/1) | `uint8` | Wynik klasyfikacji |
| Model ID | `bytes32` | Identyfikator modelu AI |
| Timestamp | `uint256` | Kiedy dokonano weryfikacji |
| Nonce / replay protection | `mapping(bytes32 => bool)` | Zapobieganie powtórnemu użyciu proofów |

#### 1.4 Testy kontraktu
- [ ] Napisać testy w Hardhat (TypeScript):
  - Test z poprawnym proofem → sukces
  - Test z niepoprawnym proofem → revert
  - Test replay protection → revert przy ponownym użyciu
- [ ] Uruchomić: `npx hardhat test`

#### 1.5 Skrypt deploy
- [ ] Napisać `scripts/deploy.ts` do deployu na lokalne Hardhat node
- [ ] Zapisać adres kontraktu i ABI (potrzebne do frontendu)

**Weryfikacja:** Testy przechodzą, deploy na `localhost` działa, kontrakt poprawnie weryfikuje proof i odrzuca fałszywy.

---

### FAZA 2: Frontend Angular (Client-Side)
**Priorytet:** Wysoki | **Zależności:** Faza 0, Faza 1
**Katalog:** `web/`

#### 2.1 Inicjalizacja projektu
- [ ] `ng new web --style=scss --routing=true --ssr=false`
- [ ] Zainstalować zależności:
  ```
  npm install snarkjs viem tailwindcss @tailwindcss/postcss
  ```
- [ ] Skonfigurować Tailwind CSS
- [ ] Skonfigurować `angular.json` aby serwować pliki ZK assets (`credit_classifier.wasm`, `credit_classifier_0000.zkey`, `verification_key.json`)

#### 2.2 Struktura komponentów

```
web/src/app/
├── pages/
│   ├── home/              # Strona główna z opisem systemu
│   ├── classify/          # Formularz + generowanie proof
│   └── verify/            # Sprawdzenie statusu on-chain
├── services/
│   ├── zk-proof.service.ts     # SnarkJS: generowanie i weryfikacja proof
│   ├── blockchain.service.ts   # Viem: interakcja z kontraktem
│   └── credit-model.service.ts # Logika modelu ML (wagi, preprocessing)
├── models/
│   └── credit.model.ts         # Interfejsy TypeScript
└── shared/
    └── components/              # Współdzielone komponenty UI
```

#### 2.3 Serwis ZK Proof (`zk-proof.service.ts`)
- [ ] Załadować `.wasm` i `.zkey` z assets (fetch)
- [ ] Zaimplementować `generateProof(inputs)`:
  ```typescript
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputSignals,
    '/assets/zk/credit_classifier.wasm',
    '/assets/zk/credit_classifier_0000.zkey'
  );
  ```
- [ ] Zaimplementować `verifyProofLocally(proof, publicSignals)` — weryfikacja po stronie klienta przed wysłaniem na chain
- [ ] Zaimplementować `formatProofForContract(proof, publicSignals)` — konwersja na calldata Solidity

#### 2.4 Serwis Blockchain (`blockchain.service.ts`)
- [ ] Integracja z MetaMask przez Viem:
  ```typescript
  import { createWalletClient, createPublicClient, custom } from 'viem';
  import { hardhat } from 'viem/chains';
  ```
- [ ] Funkcje:
  - `connectWallet()` — połączenie z MetaMask
  - `submitProof(proof, publicSignals)` — wywołanie `CreditRegistry.submitProof()`
  - `getDecision(clientHash)` — odczyt decyzji z blockchaina
  - `listenForEvents()` — nasłuchiwanie zdarzeń kontraktu

#### 2.5 Serwis Modelu ML (`credit-model.service.ts`)
- [ ] Przechowywać wagi i bias modelu (z `input.json` / hardcoded jako stałe publiczne)
- [ ] Zaimplementować preprocessing danych:
  - Normalizacja (StandardScaler z wartościami mean/std z treningu)
  - Skalowanie do integer (SCALE = 1000)
- [ ] Zaimplementować `prepareZkInputs(rawFeatures)`:
  - Przyjmuje surowe dane klienta (duration, credit_amount, installment_commitment, age)
  - Zwraca gotowy obiekt input dla SnarkJS

#### 2.6 Strona Classify (formularz)
- [ ] Formularz z polami:
  - Czas trwania kredytu (duration) — slider / input
  - Kwota kredytu (credit_amount) — input numeryczny
  - Rata (installment_commitment) — select 1-4
  - Wiek (age) — input numeryczny
- [ ] Przycisk "Klasyfikuj i generuj dowód"
- [ ] Wizualizacja procesu krok po kroku:
  1. Preprocessing danych ✔
  2. Generowanie ZK Proof (z progress barem — to trwa ~10-30s w przeglądarce) ✔
  3. Weryfikacja lokalna ✔
  4. Wynik: KREDYT PRZYZNANY / ODMÓWIONY
  5. Przycisk "Zapisz dowód na blockchainie" → wywołanie MetaMask

#### 2.7 Strona Verify
- [ ] Input na hash klienta
- [ ] Wyświetlenie danych z blockchaina:
  - Decyzja
  - Timestamp
  - Model ID
  - Status dowodu

#### 2.8 Strona Home
- [ ] Opis systemu (po angielsku lub polsku — do decyzji)
- [ ] Schemat architektury
- [ ] Wyjaśnienie co to ZK-SNARK i dlaczego jest ważny

**Weryfikacja:** Formularz działa, proof generuje się w przeglądarce, MetaMask otwiera się z transakcją, po zatwierdzeniu decyzja jest widoczna na stronie Verify.

---

### FAZA 3: Integracja end-to-end
**Priorytet:** Wysoki | **Zależności:** Faza 1, Faza 2

- [ ] Uruchomić Hardhat node (`npx hardhat node`)
- [ ] Zdeployować kontrakt
- [ ] Skonfigurować MetaMask na lokalną sieć Hardhat (chainId: 31337)
- [ ] Przetestować pełny flow:
  1. Użytkownik wchodzi na stronę
  2. Łączy wallet (MetaMask)
  3. Wpisuje dane kredytowe
  4. Klika "Klasyfikuj"
  5. Proof generuje się w przeglądarce (~10-30 sekund)
  6. Wynik wyświetla się natychmiast
  7. Klika "Zapisz na blockchainie"
  8. MetaMask prosi o potwierdzenie transakcji
  9. Po potwierdzeniu — decyzja zapisana on-chain
  10. Na stronie Verify — dane widoczne

- [ ] Nagrać demo (screen recording) całego flow

**Weryfikacja:** Cały scenariusz działa od początku do końca bez użycia żadnego serwera.

---

### FAZA 4: Testy i benchmarki (wartość naukowa)
**Priorytet:** Średni | **Zależności:** Faza 3

#### 4.1 Benchmarki wydajności client-side
- [ ] Zmierzyć czas generowania proof w przeglądarce (różne urządzenia / przeglądarki)
- [ ] Zmierzyć rozmiar plików ZK assets (WASM + zkey)
- [ ] Porównać z generowaniem proof server-side (Node.js)
- [ ] Zmierzyć koszt gas transakcji `submitProof()`
- [ ] Zestawić wyniki w tabeli / wykresach (do pracy magisterskiej)

#### 4.2 Testy bezpieczeństwa
- [ ] Próba przesłania fałszywego proofu → kontrakt odrzuca
- [ ] Próba replay attack → kontrakt odrzuca
- [ ] Weryfikacja, że dane prywatne nie wyciekają (analiza calldata transakcji)

#### 4.3 Testy użyteczności
- [ ] Czy UX jest zrozumiały dla osoby nietechnicznej?
- [ ] Jak długo trwa cały proces?

---

### FAZA 5: Dokumentacja i praca pisemna
**Priorytet:** Średni | **Zależności:** Faza 3, Faza 4

- [ ] Opisać architekturę systemu (diagram, opis komponentów)
- [ ] Opisać protokół ZK-SNARK (Groth16) — teoria
- [ ] Opisać obwód Circom (jak replikuje logistic regression)
- [ ] Opisać wyniki benchmarków
- [ ] Sformułować wnioski naukowe:
  - Blockchain jako audytor AI bez naruszania prywatności
  - Praktyczne wykorzystanie ZK w inferencji ML
  - Client-side vs server-side — porównanie podejść
  - Ramy dla AI governance i zaufanej automatyzacji
  - Ograniczenia (rozmiar modelu, złożoność obwodu)

---

## Co przechowujemy na blockchainie — podsumowanie

| Element | Przechowywany jako | Cel |
|---|---|---|
| Proof zk-SNARK | Weryfikowany w locie (`verifyProof()`) | Potwierdzenie poprawności obliczenia |
| Hash wejścia klienta | `bytes32 clientHash` | Dowód, że dane wejściowe są spójne |
| Hash wyniku | `bytes32 resultHash` | Spójność z obliczeniem |
| Decyzja (0/1) | `uint8 decision` | Wynik klasyfikacji |
| Model ID | `bytes32 modelId` | Identyfikacja, jaki model wygenerował wynik |
| Timestamp | `uint256 timestamp` | Kiedy weryfikacja miała miejsce |

---

## Stos technologiczny — podsumowanie

| Warstwa | Technologia | Uzasadnienie |
|---|---|---|
| ML Training (offline) | Python, Scikit-Learn | Prosty model, łatwa ekstrakcja wag |
| Obwód ZK | Circom 2.0 + SnarkJS | Standard branżowy, działa w przeglądarce (WASM) |
| Proof generation | SnarkJS (browser, WASM) | **Pełne client-side** — brak serwera |
| Smart kontrakt | Solidity (Hardhat) | Weryfikator on-chain |
| Frontend | Angular 21 + Tailwind CSS | SPA, nowoczesny framework |
| Web3 | Viem | Type-safe, lekka alternatywa dla ethers.js |
| Wallet | MetaMask | Najpopularniejszy wallet Ethereum |
| Sieć testowa | Hardhat Network (local) | Szybkie testowanie bez kosztów |

---

## Ważne szczegóły implementacyjne

### SnarkJS w przeglądarce
- Plik `.zkey` może być duży (~kilka MB) — warto dodać progress bar przy ładowaniu
- Generowanie proofu trwa ~10-30s w przeglądarce (zależy od złożoności obwodu i CPU)
- Warto użyć Web Worker, żeby nie blokować UI thread

### Preprocessing danych w przeglądarce
- StandardScaler wymaga wartości `mean` i `std` z treningu — trzeba je wyeksportować z Pythona i wbudować w frontend
- Skalowanie integer (SCALE = 1000) musi być identyczne jak w `train.py`

### Prywatność
- `client_input` to **prywatne sygnały** w obwodzie Circom — nie trafiają do public signals
- `weights`, `bias`, `expected_decision` to **publiczne sygnały** — widoczne on-chain
- Dane klienta (duration, credit_amount, itd.) nigdy nie opuszczają przeglądarki

### Rozszerzenia na przyszłość (opcjonalne)
- Testnet Ethereum (Sepolia) zamiast Hardhat local
- Większy model ML (np. decision tree konwertowany do obwodu ZK)
- IPFS do przechowywania metadanych modelu
- Porównanie z innymi systemami ZK (PLONK, STARKs)

---

## Sugerowana kolejność implementacji

```
Tydzień 1-2:  FAZA 0 + FAZA 1 (środowisko + smart kontrakt)
Tydzień 3-5:  FAZA 2 (frontend Angular — największa część pracy)
Tydzień 6:    FAZA 3 (integracja end-to-end)
Tydzień 7-8:  FAZA 4 (testy, benchmarki)
Tydzień 9-12: FAZA 5 (pisanie pracy magisterskiej)
```

> **Uwaga:** Harmonogram jest orientacyjny. Faza 2 (frontend) to najobszerniejsza część implementacji — obejmuje logikę ZK w przeglądarce, integrację z walletem i kompletny UI.
