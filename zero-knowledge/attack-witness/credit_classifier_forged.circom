pragma circom 2.0.6;

include "circuits/comparators.circom";
include "circuits/bitify.circom";

// ===========================================================================
// Obwod o UKLADZIE OGRANICZEN IDENTYCZNYM z credit_classifier.circom.
//
// Rozni sie wylacznie sposobem wyliczania swiadka: przypisania nieograniczone
// (strzalka <--) dla ilorazu i reszty sa przesuniete o stala FORGE. Poniewaz
// przypisania <-- nie tworza ograniczen, powstaly plik R1CS jest bit w bit
// taki sam jak dla obwodu uczciwego, a wiec ten sam klucz dowodzacy i ten sam
// klucz weryfikujacy pozostaja wazne.
//
// Rownanie absProd === absQuot * SCALE + absRem nadal jest spelnione, bo
// para (absQuot - FORGE, absRem + FORGE * SCALE) je spelnia. Brakuje jednak
// ograniczenia 0 <= absRem < SCALE, ktore wymuszaloby jednoznacznosc rozkladu
// na iloraz i reszte. Ten brak jest przedmiotem punktu 5.1.4 pracy.
// ===========================================================================

template CreditClassifierForged(FORGE) {

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

    for (var i = 0; i < 4; i++) {
        products[i] <== xSigned[i] * w[i];
        prodNeg[i] <== wNeg[i] * (1 - xBits[i].out[31]) + (1 - wNeg[i]) * xBits[i].out[31];

        negDoubleProd[i] <== 2 * products[i];
        absProd[i] <== products[i] - prodNeg[i] * negDoubleProd[i];

        // Jedyna zmiana wzgledem obwodu uczciwego: przesuniecie rozkladu.
        if (i == 0) {
            absQuot[i] <-- absProd[i] \ SCALE - FORGE;
            absRem[i]  <-- absProd[i] % SCALE + FORGE * SCALE;
        } else {
            absQuot[i] <-- absProd[i] \ SCALE;
            absRem[i]  <-- absProd[i] % SCALE;
        }
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

component main = CreditClassifierForged(1000);
