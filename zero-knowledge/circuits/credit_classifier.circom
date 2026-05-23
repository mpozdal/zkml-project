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
    // -----------------------------
    signal score[5];
    score[0] <== b;

    for (var i = 0; i < 4; i++) {
        score[i + 1] <== score[i] + xSigned[i] * w[i];
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