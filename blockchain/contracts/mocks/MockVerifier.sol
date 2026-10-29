// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @dev Controllable mock for IVerifier used in tests.
 *      Call setResult(false) before a test to simulate an invalid proof.
 */
contract MockVerifier {
    bool private _result = true;

    function setResult(bool result) external {
        _result = result;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[1] calldata
    ) external view returns (bool) {
        return _result;
    }
}
