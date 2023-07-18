// SPDX-License-Identifier: MIT
// SATURN project (last updated v0.1.0)

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Cash.sol";



contract FakeCurvePool {

    address immutable eurToken;
    address immutable usdToken;
    uint256 wad = 1e18;
    uint256 constant eurusd = 110*1e16; //1.10
        /* ========== CONSTRUCTOR ========== */

    constructor(address eurToken_, address usdToken_) {
        eurToken = eurToken_;
        usdToken = usdToken_;
    }


    function get_dx(
        int128 i,
        int128 j,
        uint256 dy
    ) external view returns (uint256){
        require(i==0, " Trade not supported by FakePoolCurve");
        require(j==1, " Trade not supported by FakePoolCurve");
        uint256 dx = dy*wad/eurusd;
        return dx;

    } 


function exchange(
    int128 i,
    int128 j,
    uint256 dx,
    uint256 min_dy
  ) external {
        require(i==0, " Trade not supported by FakePoolCurve");
        require(j==1, " Trade not supported by FakePoolCurve");
        uint256 dy = dx*eurusd/wad;
        require(dy>=min_dy, " Unsufficient output amount");
        Cash(eurToken).transferFrom(
                            msg.sender,
                            address(this),
                            dx
                        );
        Cash(usdToken).transferFrom(
                            address(this),
                            msg.sender,
                            dy
                        );
  }

}


