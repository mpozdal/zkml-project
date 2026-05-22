pragma circom 2.0.6;

include "circuits/comparators.circom";

template CreditClassifier(n_inputs) {
    signal input client_input[n_inputs];
    signal input weights[n_inputs];
    signal input bias;
    signal input expected_decision;

    signal intermediate_products[n_inputs];
    signal cumulative_sum[n_inputs];

    for (var i = 0; i < n_inputs; i++) {
        intermediate_products[i] <== client_input[i] * weights[i];
    }

    cumulative_sum[0] <== intermediate_products[0];
    for (var i = 1; i < n_inputs; i++) {
        cumulative_sum[i] <== cumulative_sum[i-1] + intermediate_products[i];
    }

    signal final_score;
    final_score <== cumulative_sum[n_inputs-1] + bias;

    component isGreaterThanZero = GreaterThan(252);
    isGreaterThanZero.in[0] <== final_score;
    isGreaterThanZero.in[1] <== 0;

    isGreaterThanZero.out === expected_decision;
}

component main {public [weights, bias, expected_decision]} = CreditClassifier(4);