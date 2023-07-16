// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IDVP {
    /**
     * @dev when the smart contract is initialized :
     * - variable settlementOperator is set
     * - status of current contract is Draft
     */
    function initialize(address settlementOperator) external;
}
