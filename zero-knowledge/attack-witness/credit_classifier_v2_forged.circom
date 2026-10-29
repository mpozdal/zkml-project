pragma circom 2.0.6;

include "circuits/comparators.circom";
include "circuits/bitify.circom";

// ===========================================================================
// Ten sam atak co w credit_classifier_forged.circom, ale wobec obwodu po
// poprawce (wersja 2). Sluzy do wykazania, ze dodane ograniczenia zakresu
// reszty odcinaja rodzine falszywych swiadkow: generacja swiadka konczy sie
// bledem, bo absRem = 1 000 000 nie spelnia warunku absRem < SCALE.
// ===========================================================================

template CreditClassifierV2Forged(FORGE) {

    signal input x[4];
    signal output y;

    var w[4] = [-274, -236, -189, 359];
    var b = 916;
    var SCALE = 1000;

    component xBits[4];
    signal xSigned[4];

    for (var i = 0; i < 4; i++) {
        xBits[i] = Num2Bits(32);
        xBits[i].in <== x[i];

        xSigned[i] <== x[i] - xBits[i].out[31] * (1 << 32);
    }

    var wNeg[4] = [1, 1, 1, 0];
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

    component remInRange[4];
    component quotBits[4];

    for (var i = 0; i < 4; i++) {
        products[i] <== xSigned[i] * w[i];
        prodNeg[i] <== wNeg[i] * (1 - xBits[i].out[31]) + (1 - wNeg[i]) * xBits[i].out[31];

        negDoubleProd[i] <== 2 * products[i];
        absProd[i] <== products[i] - prodNeg[i] * negDoubleProd[i];

        if (i == 0) {
            absQuot[i] <-- absProd[i] \ SCALE - FORGE;
            absRem[i]  <-- absProd[i] % SCALE + FORGE * SCALE;
        } else {
            absQuot[i] <-- absProd[i] \ SCALE;
            absRem[i]  <-- absProd[i] % SCALE;
        }
        absProd[i] === absQuot[i] * SCALE + absRem[i];

        remInRange[i] = LessThan(16);
        remInRange[i].in[0] <== absRem[i];
        remInRange[i].in[1] <== SCALE;
        remInRange[i].out === 1;

        quotBits[i] = Num2Bits(32);
        quotBits[i].in <== absQuot[i];

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

component main = CreditClassifierV2Forged(1000);
