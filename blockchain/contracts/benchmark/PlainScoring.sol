// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @dev Wariant odniesienia dla hipotezy H2: rejestr, ktory liczy model
 *      bezposrednio w lancuchu, bez dowodu z wiedza zerowa.
 *
 *      Cechy wnioskodawcy sa jawnymi argumentami transakcji, co jest
 *      dokladnie ta wlasnoscia, ktorej wariant z dowodem pozwala uniknac.
 *      Kontrakt sluzy wylacznie do pomiaru kosztu gazu w funkcji liczby
 *      cech, dlatego wagi generowane sa arytmetycznie jako stale kodu -
 *      ich wartosci nie wplywaja na koszt, istotna jest liczba mnozen,
 *      dzielen i dodan oraz rozmiar danych wywolania.
 */
contract PlainScoring {
    int256 private constant SCALE = 1000;
    int256 private constant BIAS = 916;

    struct CreditApplication {
        bool isApproved;
        uint256 timestamp;
        bool exists;
        bytes32 inputHash;
    }

    mapping(address => mapping(uint256 => CreditApplication))
        public userApplications;

    event CreditAnchoredPlain(
        address indexed user,
        uint256 indexed applicationId,
        bytes32 indexed inputHash,
        bool isApproved
    );

    function anchorPlainDecision(
        uint256 applicationId,
        int256[] calldata features
    ) external {
        require(
            !userApplications[msg.sender][applicationId].exists,
            "Application ID already used."
        );

        int256 score = BIAS;
        uint256 n = features.length;

        for (uint256 i = 0; i < n; ++i) {
            score += (features[i] * _weight(i)) / SCALE;
        }

        bool isApproved = score >= 0;
        bytes32 inputHash = keccak256(abi.encode(features));

        userApplications[msg.sender][applicationId] = CreditApplication({
            isApproved: isApproved,
            timestamp: block.timestamp,
            exists: true,
            inputHash: inputHash
        });

        emit CreditAnchoredPlain(
            msg.sender,
            applicationId,
            inputHash,
            isApproved
        );
    }

    function _weight(uint256 i) private pure returns (int256) {
        return int256(uint256(i)) * 7 - 274;
    }
}
