pragma circom 2.0.6;

include "circuits/comparators.circom";
include "circuits/bitify.circom";

template CreditClassifier() {

    // -----------------------------
    // INPUTS & OUTPUTS
    // -----------------------------
    signal input x[4];
    signal output y;

    // -----------------------------
    // CONSTANTS
    // -----------------------------
    var w[4] = [-274, -236, -189, 359];
    var b = 916;
    var SCALE = 1000;

    // -----------------------------
    // RANGE CHECK & SIGNED CONVERSION
    // -----------------------------
    component xBits[4];
    signal xSigned[4];

    for (var i = 0; i < 4; i++) {
        xBits[i] = Num2Bits(32);
        xBits[i].in <== x[i];

        xSigned[i] <== x[i] - xBits[i].out[31] * (1 << 32);
    }

    // -----------------------------
    // ACCUMULATOR
    // Fixed-point dot product: sum((xSigned[i] * w[i]) // SCALE) + bias
    // Uses unsigned division on |product| to match Python // semantics.
    // -----------------------------
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

    // -----------------------------
    // SIGN CHECK (score >= 0)
    // -----------------------------
    // Max score to ~2.27 * 10^12 (mieści się w 42 bitach). 
    // Dodajemy 2^43, aby zagwarantować, że wynik będzie zawsze dodatni.
    signal shiftedScore;
    shiftedScore <== score[4] + (1 << 43);

    // Sprawdzamy czy score >= 0  =>  czy shiftedScore >= 2^43
    component isPositive = GreaterEqThan(44); 
    isPositive.in[0] <== shiftedScore;
    isPositive.in[1] <== (1 << 43);

    y <== isPositive.out;
}

// -----------------------------
// MAIN COMPONENT DECLARATION
// -----------------------------
// Wejścia 'x' pozostają prywatne, wyjście 'y' jest automatycznie publiczne.
component main = CreditClassifier();