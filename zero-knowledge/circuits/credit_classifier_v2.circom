pragma circom 2.0.6;

include "circuits/comparators.circom";
include "circuits/bitify.circom";

// ===========================================================================
// Wersja 2 obwodu klasyfikatora: poprawka niedookreslenia rozkladu na iloraz
// i reszte, opisana w punkcie 5.1.4 pracy.
//
// W wersji 1 rownanie
//     absProd === absQuot * SCALE + absRem
// bylo jedynym warunkiem wiazacym iloraz z reszta. Jedno rownanie z dwiema
// niewiadomymi dopuszcza rodzine rozwiazan (absQuot - k, absRem + k * SCALE),
// co pozwalalo dowodzacemu przesunac wynik modelu o dowolna wielokrotnosc
// SCALE i odwrocic decyzje bez zmiany obwodu ani klucza weryfikujacego.
//
// Poprawka dodaje dwa ograniczenia:
//   1. 0 <= absRem < SCALE  - wymusza jednoznacznosc reszty, a przez to
//      jednoznacznosc ilorazu, bo absProd jest wyznaczone ograniczeniami.
//   2. absQuot mieszczacy sie w 32 bitach - zabezpieczenie dodatkowe,
//      odcinajace przypadki zawiniecia wartosci w ciele skonczonym.
// ===========================================================================

template CreditClassifierV2() {

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

        absQuot[i] <-- absProd[i] \ SCALE;
        absRem[i]  <-- absProd[i] % SCALE;
        absProd[i] === absQuot[i] * SCALE + absRem[i];

        // --- POPRAWKA: jednoznacznosc rozkladu na iloraz i reszte ---
        remInRange[i] = LessThan(16);
        remInRange[i].in[0] <== absRem[i];
        remInRange[i].in[1] <== SCALE;
        remInRange[i].out === 1;

        quotBits[i] = Num2Bits(32);
        quotBits[i].in <== absQuot[i];
        // ------------------------------------------------------------

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

    // |score| < 2^32 (wyprowadzenie w punkcie 3.2.3), wiec przesuniecie
    // o 2^43 z zapasem gwarantuje nieujemnosc argumentu komparatora.
    signal shiftedScore;
    shiftedScore <== score[4] + (1 << 43);

    component isPositive = GreaterEqThan(44);
    isPositive.in[0] <== shiftedScore;
    isPositive.in[1] <== (1 << 43);

    y <== isPositive.out;
}

component main = CreditClassifierV2();
