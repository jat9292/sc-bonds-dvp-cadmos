// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "./ITradeDVP.sol";

interface IBilateralTradeDVP is ITradeDVP {
  function setDetails(TradeDetailDVP memory _details) external;
  function approve() external returns (Status); 
  function reject() external;
  function executeDVP(bytes memory metadata) external returns(Status);
 
}

