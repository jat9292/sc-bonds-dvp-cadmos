// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;
import "./IRegister.sol";

interface ITrade {
  enum Status {Draft, Pending, Rejected, Accepted, Executed, Paid}
  
  struct TradeDetail {
    bytes encryptedMetadaHash,
    uint256 quantity;
    uint256 price;
    address cashToken;
    address securityToken;
    address buyer;
    address seller;
    uint256 tradeDate;
    uint256 valueDate;
    bytes8 paymentID;
  }

  function register() external view returns (IRegister);
  function status() external view returns (Status);
  function paymentID() external view returns (bytes8);
  function getDetails() external view returns(TradeDetail memory);
  function sellerAccount() external view returns (address);
  function buyerAccount() external view returns (address);

  event NotifyTrade(address indexed seller, address indexed buyer, Status indexed status, uint256 quantity, uint256 price, bytes8 paymentID, bytes metadata);
}