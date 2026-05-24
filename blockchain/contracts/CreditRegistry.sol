// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IVerifier {
    function verifyProof(
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[1] calldata publicSignals
    ) external view returns (bool);
}

contract CreditRegistry is Ownable, Pausable {
    IVerifier public immutable verifier;

    struct CreditApplication {
        bool isApproved;
        uint256 timestamp;
        bool exists;
    }

    mapping(address => mapping(uint256 => CreditApplication))
        public userApplications;

    event CreditAnchored(
        address indexed user,
        uint256 indexed applicationId,
        bool isApproved
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
        uint256 applicationId,
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[1] calldata publicSignals
    ) external whenNotPaused {
        require(
            !userApplications[msg.sender][applicationId].exists,
            "Application ID already used."
        );

        require(
            verifier.verifyProof(proofA, proofB, proofC, publicSignals),
            "Invalid ZK proof."
        );

        bool isApproved = publicSignals[0] == 1;

        userApplications[msg.sender][applicationId] = CreditApplication({
            isApproved: isApproved,
            timestamp: block.timestamp,
            exists: true
        });

        emit CreditAnchored(msg.sender, applicationId, isApproved);
    }
}
