// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IVerifier {
    function verifyProof(
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[3] calldata publicSignals
    ) external view returns (bool);
}

contract CreditRegistry is Ownable, Pausable {
    IVerifier public immutable verifier;

    struct CreditApplication {
        bool isApproved;
        uint256 timestamp;
        bool exists;
        bytes32 modelHash;
        bytes32 inputHash;
    }

    mapping(address => mapping(bytes32 => CreditApplication))
        public applications;

    event CreditAnchored(
        address indexed user,
        bytes32 indexed applicationId,
        bool isApproved,
        bytes32 modelHash
    );

    constructor(address _verifier) Ownable(msg.sender) {
        verifier = IVerifier(_verifier);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function anchorCreditDecision(
        bytes32 applicationId,
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[3] calldata publicSignals
    ) external whenNotPaused {
        require(
            !applications[msg.sender][applicationId].exists,
            "Duplicate application"
        );

        require(
            verifier.verifyProof(proofA, proofB, proofC, publicSignals),
            "Invalid proof"
        );

        bytes32 modelHash = bytes32(publicSignals[0]);
        bytes32 inputHash = bytes32(publicSignals[1]);
        bool isApproved = publicSignals[2] == 1;

        applications[msg.sender][applicationId] = CreditApplication({
            isApproved: isApproved,
            timestamp: block.timestamp,
            exists: true,
            modelHash: modelHash,
            inputHash: inputHash
        });

        emit CreditAnchored(msg.sender, applicationId, isApproved, modelHash);
    }
}
