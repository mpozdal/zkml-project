pragma circom 2.0.6;

include "circuits/comparators.circom";
include "circuits/bitify.circom";

// ===========================================================================
// ARTEFAKT BADAWCZY - NIE JEST CZESCIA SYSTEMU PRODUKCYJNEGO
// ===========================================================================
// Kopia CreditClassifier z jedna zmieniona waga, uzywana wylacznie do
// zasymulowania ataku polegajacego na podmianie wag modelu.
//
// Waga cechy "duration" zostala odwrocona: -274 -> +274. Napastnik udaje,
// ze dlugi okres kredytowania podnosi wiarygodnosc zamiast ja obnizac.
// Dzieki temu wniosek odrzucany przez uczciwy model (score -534) zostaje
// zaakceptowany przez model podmieniony (score +562).
//
// Tablica wNeg musi isc w parze ze znakami w tablicy w.
// ===========================================================================
template CreditClassifierTampered() {

    signal input x[4];
    signal output y;

    var w[4] = [274, -236, -189, 359];
    var b = 916;
    var SCALE = 1000;

    component xBits[4];
    signal xSigned[4];

    for (var i = 0; i < 4; i++) {
        xBits[i] = Num2Bits(32);
        xBits[i].in <== x[i];

        xSigned[i] <== x[i] - xBits[i].out[31] * (1 << 32);
    }

    var wNeg[4] = [0, 1, 1, 0];
    signal products[4];
    signal prodNeg[4];
    signal negDoubleProd[4];
    signal absProd[4];
    signal absQuot[4];
    signal absRem[4];
    signal remIsZero[4];
    signal negQuot[4];
    signal posQuot[4];
    signal negBranch[4];
    signal quotients[4];
    signal score[5];

    for (var i = 0; i < 4; i++) {
        products[i] <== xSigned[i] * w[i];
        prodNeg[i] <== wNeg[i] * (1 - xBits[i].out[31]) + (1 - wNeg[i]) * xBits[i].out[31];

        negDoubleProd[i] <== 2 * products[i];
        absProd[i] <== products[i] - prodNeg[i] * negDoubleProd[i];

        absQuot[i] <-- absProd[i] \ SCALE;
        absRem[i] <-- absProd[i] % SCALE;
        absProd[i] === absQuot[i] * SCALE + absRem[i];

        remIsZero[i] <== IsZero()(absRem[i]);
        negQuot[i] <== 0 - absQuot[i] - (1 - remIsZero[i]);
        posQuot[i] <== absQuot[i] - prodNeg[i] * absQuot[i];
        negBranch[i] <== prodNeg[i] * negQuot[i];
        quotients[i] <== posQuot[i] + negBranch[i];
    }

    score[0] <== b;

    for (var i = 0; i < 4; i++) {
        score[i + 1] <== score[i] + quotients[i];
    }

    signal shiftedScore;
    shiftedScore <== score[4] + (1 << 43);

    component isPositive = GreaterEqThan(44);
    isPositive.in[0] <== shiftedScore;
    isPositive.in[1] <== (1 << 43);

    y <== isPositive.out;
}

component main = CreditClassifierTampered();
