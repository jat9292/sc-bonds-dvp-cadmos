// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IDVP {
    /**
     * @dev when the smart contract is initialized :
     * - variable settlementOperator is set
     * - details struct buyer gets buyer address
     * - details struct seller gets seller address
     * - we map the register contract to interact with it
     * - we map the cashToken contract to interact with it
     * - we map the cashTokenExecutor contract to interact with it
     * - status of current contract is Draft
     */
    function initialize(address settlementOperator, address _buyer, address _seller, address _register, address _cashTokenAddress, address _cashTokenExecutorAddress) external;
}
