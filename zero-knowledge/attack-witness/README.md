# Atak C: fałszowanie świadka bez zmiany obwodu

Katalog zawiera materiał dowodowy do punktu 5.1.2 i 5.1.3 pracy: wykazanie
niedookreślenia obwodu `credit_classifier.circom` oraz weryfikację poprawki.

## Na czym polega podatność

Iloraz i reszta w dzieleniu ze znakiem są przypisywane strzałką `<--`, a wiąże
je jedno równanie:

```
absProd[i] === absQuot[i] * SCALE + absRem[i];
```

Jedno równanie z dwiema niewiadomymi ma jeden stopień swobody: dla dowolnego
`k` para `(absQuot - k, absRem + k * SCALE)` również je spełnia. Brakuje
warunku `0 <= absRem < SCALE`, który czyni rozkład jednoznacznym. Dowodzący
może więc przesunąć wynik modelu o wielokrotność `SCALE` i odwrócić decyzję.

## Odtworzenie ataku

Obwód `credit_classifier_forged.circom` różni się od uczciwego **wyłącznie**
treścią przypisań `<--`. Przypisania te nie tworzą ograniczeń, więc wynikowy
plik R1CS jest identyczny co do bajtu, a oryginalne klucze pozostają ważne.

```bash
# 1. Potwierdzenie tożsamości układu ograniczeń
circom attack-witness/credit_classifier_forged.circom --r1cs --wasm \
  -l node_modules/circomlib -o attack-witness
shasum -a 256 build/credit_classifier.r1cs \
  attack-witness/credit_classifier_forged.r1cs
# oba skróty: 4b83693c5e464b5bff6ddfcb1ddf3b38cf803aeea7f84675338e2a2e978e0ada

# 2. Wygenerowanie sfałszowanego świadka i dowodu ORYGINALNYM kluczem
cd attack-witness
node credit_classifier_forged_js/generate_witness.js \
  credit_classifier_forged_js/credit_classifier_forged.wasm \
  ../attack/input.json forged.wtns
npx snarkjs groth16 prove ../keys/credit_classifier_0001.zkey forged.wtns \
  forged_proof.json forged_public.json

# 3. Weryfikacja ORYGINALNYM kluczem weryfikującym
npx snarkjs groth16 verify ../keys/verification_key.json \
  forged_public.json forged_proof.json
# [INFO] snarkJS: OK!   -- przy y = 1, gdy uczciwy świadek daje y = 0
```

Skutek w łańcuchu potwierdza test `blockchain/test/WitnessForgeryAttack.test.ts`:
rzeczywisty kontrakt `Groth16Verifier` przyjmuje dowód, a `CreditRegistry`
zapisuje zgodę kredytową, której model nie wystawił.

## Weryfikacja poprawki

Obwód `circuits/credit_classifier_v2.circom` dodaje ograniczenie zakresu reszty
oraz ograniczenie zakresu ilorazu. Ten sam atak przeprowadzony wobec wersji 2
(`credit_classifier_v2_forged.circom`) nie ma spełniającego przypisania:

```bash
cd attack-witness
node credit_classifier_v2_forged_js/generate_witness.js \
  credit_classifier_v2_forged_js/credit_classifier_v2_forged.wasm \
  ../attack/input.json forged_v2.wtns
# Error: Assert Failed. Error in template LessThan_2
```

Uczciwy świadek wobec wersji 2 nadal daje `y = 0`. Koszt poprawki: wzrost
z 233 do 445 ograniczeń, wciąż w granicach konfiguracji o potędze 12.

## Wdrożenie poprawki

Poprawka wymaga ponownej kompilacji, nowej drugiej fazy konfiguracji kluczy,
nowego weryfikatora w Solidity oraz ponownego wdrożenia obu kontraktów, bo
adres weryfikatora w `CreditRegistry` jest niemodyfikowalny.
