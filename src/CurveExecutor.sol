// SPDX-License-Identifier: MIT
// SATURN project (last updated v0.1.0)

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Cash.sol";

interface ICurveDeposit {
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external;

    function get_dx(
        int128 i,
        int128 j,
        uint256 dy
    ) external view returns (uint256);
}

contract CurveExecutor is Ownable {
    uint256 internal constant MAX_INT =
        0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    address immutable eurToken;
    address immutable usdToken;
    int128 constant i = 0; // identifier of buyerSourceCashToken in Pool Curve (entry of forex operation) --> EUR
    int128 constant j = 1; // identifier of payment cashToken in Pool Curve (output of forex operation) --> USD
    address immutable poolCurve; // Mariana/Pool  Curve  address
    address immutable dvp; //Address of DVP smart contract

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address eurToken_,
        address usdToken_,
        address poolCurve_,
        address dvp_
    ) {
        eurToken = eurToken_;
        usdToken = usdToken_;
        poolCurve = poolCurve_;
        dvp = dvp_;
        Cash(eurToken).approve(poolCurve, MAX_INT);
    }

    function requestTransfer(
        address cashToken,
        address /*securityToken*/,
        address _buyer,
        address _seller,
        uint256 settlementAmount
    ) external {
        require(msg.sender == dvp, "unAuthorized");
        require(cashToken == usdToken, "unsupported currency");

        uint256 dx = ICurveDeposit(poolCurve).get_dx(i, j, settlementAmount);
        Cash(eurToken).transferFrom(_buyer, address(this), dx);
        ICurveDeposit(poolCurve).exchange(i, j, dx, settlementAmount);

        Cash(usdToken).transfer(_seller, settlementAmount);
    }
}
