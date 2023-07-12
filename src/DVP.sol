// SPDX-License-Identifier: MIT
// SATURN project (last updated v0.1.0)

pragma solidity 0.8.17;

import "./intf/IBilateralTrade.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./Cash.sol";

contract DVP is IBilateralTrade, ReentrancyGuard {
    IRegister public register;
    Status public status;
    address public settlementOperator;
    TradeDetail public details;
    Cash cashToken;


    /**
     * @dev when the smart contract deploys :
     * - we check that deployer has been whitelisted
     * - we check that buyer has been whitelisted
     * - we map the register contract to interact with it
     * - variable settlementOperator gets msg.sender address
     * - details struct buyer gets buyer address
     * - status of current contract is Draft
     * The constructor cannot be checked by the register by looking ain the hash of
     * the runtime bytecode because this hash does not cover the constructor.
     * so controls in the constructors are to be replicated in the first interaction with a function
     */
    constructor(
        IRegister _register,
        address _buyer,
        address _seller,
        address _cashTokenAddress
    ) {
        require(
            _register.investorsAllowed(msg.sender) ||
                _register.isBnD(msg.sender),
            "Sender must be a valid investor"
        );

        require(
            _register.investorsAllowed(_buyer),
            "Buyer must be a valid investor"
        );

        register = _register;
        settlementOperator = msg.sender;
        details.buyer = _buyer;
        details.seller = _seller;
        bytes8 paymentID_ = paymentID();
        details.paymentID = paymentID_;
        status = Status.Draft;
        cashToken = Cash(_cashTokenAddress);
        emit NotifyTrade(msg.sender, _buyer, status, 0, 0, paymentID_);
    }

    /**
     * @dev gets the buyer address
     */
    function buyerAccount() public view returns (address) {
        return details.buyer;
    }

    /**
     * @dev produces a unique payment identifier
     */
    function paymentID() public view returns (bytes8) {
        uint64 low = uint64(uint160(address(this)));
        return bytes8(low);
    }

    /**
     * @dev enables the sellerAccount address to update the bilateral trade detail
     * can be called only if status of current contract is Draft
     can be called only if buyer updated is whitelisted
    */
    function setDetails(
        TradeDetail memory _details,
        uint _requestedCash
    ) public {
        require(
            msg.sender == settlementOperator,
            "Only the settlementOperator can update this trade"
        );
        require(
            status == Status.Draft,
            "Cannot change the trade details unless in draft status"
        );
        require(
            register.investorsAllowed(_details.buyer),
            "Buyer must be a valid investor even on changing details"
        );
        require(
            register.investorsAllowed(_details.seller),
            "Seller must be a valid investor even on changing details"
        );
        details = _details;
        // an event needs to be generated to enable the back end to know that the trade has been changed
        emit NotifyTrade(
            _details.seller,
            _details.buyer,
            status,
            _details.quantity,
            _details.price,
            _details.paymentID
        );
        requestedCash = _requestedCash;
        emit RequestedCash(_requestedCash);
    }

    /**
     * @dev enables the approval of the bilateral trade in 2 steps :
     * 1) caller is seller account address and smart contract is in status Draft
     * --> status becomes Pending and emits an event
     * 2) Caller is buyer account address and smart contract is in status Pending
     * --> transfer the tokens from B&D account to buyer
     ** --> NEW (DVP) Cash Token is transfered from buyer to seller (buyer must pre-approve the cash token on DVP contract)
     * --> status becomes Accepted and emits an event
     */
    function approve() public returns (Status) {
        if (msg.sender == details.seller && status == Status.Draft) {
            require(details.quantity > 0, "quantity not defined");
            require(details.tradeDate > 0, "trade date not defined");
            // Remove the control because it is functionally possible to need to create a back value trade
            // But add the control that the value is defined
            require(details.valueDate > 0, "value date not defined");

            // require(
            //     details.valueDate >= details.tradeDate,
            //     "value date not defined greater or equal than the trade date"
            // );
            status = Status.Pending;
            _details = details;
            emit NotifyTrade(
                _details.seller,
                _details.buyer,
                status,
                _details.quantity,
                _details.price,
                _details.paymentID
            );
            emit RequestedCash(_details.quantity*_details.price);
            return (status);
        }

        if (msg.sender == details.buyer && status == Status.Pending) {
            status = Status.Accepted;
            _details = details;
            emit NotifyTrade(
                _details.seller,
                _details.buyer,
                status,
                _details.quantity,
                _details.price,
                _details.paymentID
            );
            return (status);
        }

        if (msg.sender == settlementOperator && status == Status.Accepted) {
            _details = details;
            status = Status.Executed;
            require(
                register.transferFrom(
                    _details.seller,
                    _details.buyer,
                    _details.quantity
                ),
                "the bond transfer has failed"
            );
            require(
                cashToken.transferFrom(
                    _details.buyer,
                    _details.seller,
                    _details.quantity*_details.price
                ),
                "the cash transfer has failed"
            );
            emit NotifyTrade(
                _details.seller,
                _details.buyer,
                status,
                _details.quantity,
                _details.price,
                _details.paymentID
            );
            return (status);
        }
        require(false, "the trade cannot be approved in this current status");
        return (status);
    }

    /**
     * @dev enables the rejection of the bilateral trade in 2 possibilites :
     * 1) caller is seller account address and smart contract is in status Draft or Pending
     * --> status becomes Rejected and emits an event
     * 2) Caller is buyer account address and smart contract is in status Pending
     * --> status becomes Rejected and emits an event
     */
    function reject() public {
        _details = details;
        require(status != Status.Rejected, "Trade already rejected");
        // seller can cancel the trade at any active state before the trade is executed
        if (msg.sender == _details.seller && (status != Status.Executed)) {
            status = Status.Rejected;
            emit NotifyTrade(
                _details.seller,
                _details.buyer,
                status,
                _details.quantity,
                _details.price,
                _details.paymentID
            );
            return;
        }
        // buyer can cancel the trade when pending validation on his side or even after he has accepted the trade (but not when the seller prepares the trade (DRAFT))
        if (
            msg.sender == details.buyer &&
            (status == Status.Pending || status == Status.Accepted)
        ) {
            status = Status.Rejected;
            emit NotifyTrade(
                _details.seller,
                _details.buyer,
                status,
                _details.quantity,
                _details.price,
                _details.paymentID
            );
            return;
        }
        require(false, "the trade cannot be rejected in this current status");
    }
}
