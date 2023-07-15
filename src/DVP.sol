// SPDX-License-Identifier: MIT
// SATURN project (last updated v0.1.0)

pragma solidity 0.8.17;

import "./intf/IBilateralTradeDVP.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./Cash.sol";

contract DVP is IBilateralTradeDVP, ReentrancyGuard {
    Status public status;
    address public settlementOperator;
    address secondApprover;
    TradeDetailDVP public details;
    IRegister public register;
    Cash cashToken;

    event RequestedCash(uint indexed requestedCash);

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
        address _register,
        address _buyer,
        address _seller,
        address _cashTokenAddress
    ) {
        require(
            IRegister(_register).investorsAllowed(msg.sender) ||
                IRegister(_register).isBnD(msg.sender),
            "Sender must be a valid investor"
        );

        require(
            IRegister(_register).investorsAllowed(_buyer),
            "Buyer must be a valid investor"
        );

        settlementOperator = msg.sender;
        details.buyer = _buyer;
        details.seller = _seller;
        details.cashToken = _cashTokenAddress;
        details.securityToken = _register;
        status = Status.Draft;
        emit NotifyTradeDVP(msg.sender, _buyer, status, 0, 0, paymentID(), 0);
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
        TradeDetailDVP calldata _details,
        bytes calldata encryptedMetadata,
        EncryptedAESwithECIES[3] calldata encryptedSymmetricKeyForEachActor
    ) public {
        require(
            keccak256(encryptedMetadata) == _details.encryptedMetadaHash,
            "Metadata doe not match committed hash"
        );
        register = IRegister(details.securityToken);
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
            register.investorsAllowed(_details.seller) ||
                register.isBnD(_details.seller),
            "Seller must be a valid investor even on changing details"
        );

        require(
            details.cashToken == _details.cashToken,
            "Cannot Change CashToken Address"
        );
        require(
            address(register) == _details.securityToken,
            "Cannot Change securityToken Address"
        );

        cashToken = Cash(details.cashToken);
        details = _details;
        bytes8 paymentID_ = paymentID();
        // an event needs to be generated to enable the back end to know that the trade has been changed
        emit NotifyTradeDVP(
            _details.seller,
            _details.buyer,
            status,
            _details.quantity,
            _details.price,
            paymentID_,
            _details.encryptedMetadaHash
        );
        emit EncryptedMetaData(
            encryptedMetadata,
            _details.encryptedMetadaHash,
            encryptedSymmetricKeyForEachActor
        );
    }

    /**
     * @dev compare equality of two TradeDetailDVP structs :
     * This is called inside the first approve and is necessary to avoid the corner case in which the settlement operator front-runs (unintentionally)
     * the first trader (buyer or seller) by calling setDetails right before the first trader calls approve.
     */
    function checkTradeDetails(
        TradeDetailDVP memory _details,
        TradeDetailDVP memory _detailscopy
    ) internal pure returns (bool) {
        return (_details.encryptedMetadaHash ==
            _detailscopy.encryptedMetadaHash &&
            _details.quantity == _detailscopy.quantity &&
            _details.price == _detailscopy.price &&
            _details.cashToken == _detailscopy.cashToken &&
            _details.securityToken == _detailscopy.securityToken &&
            _details.buyer == _detailscopy.buyer &&
            _details.seller == _detailscopy.seller &&
            _details.tradeDate == _detailscopy.tradeDate &&
            _details.valueDate == _detailscopy.valueDate);
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
    function approve(
        TradeDetailDVP calldata _detailscopy
    ) public nonReentrant returns (Status) {
        TradeDetailDVP memory _details = details;
        if (
            (msg.sender == _details.seller || msg.sender == _details.buyer) &&
            status == Status.Draft
        ) {
            require(
                checkTradeDetails(_details, _detailscopy),
                "Details of trade are different"
            ); // This check is necessary to avoid the first agent (buyer or seller) getting front-runned (might be unintentional) by the settlement operator who could still call setDetails
            require(details.quantity > 0, "quantity not defined");
            require(details.tradeDate > 0, "trade date not defined");
            // Remove the control because it is functionally possible to need to create a back value trade
            // But add the control that the value is defined
            require(details.valueDate > 0, "value date not defined");

            // require(
            //     details.valueDate >= details.tradeDate,
            //     "value date not defined greater or equal than the trade date"
            // );

            if (msg.sender == _details.seller) {
                secondApprover = _details.buyer;
            } else {
                secondApprover = _details.seller;
            }

            status = Status.Pending;
            emit NotifyTradeDVP(
                _details.seller,
                _details.buyer,
                status,
                _details.quantity,
                _details.price,
                paymentID(),
                _details.encryptedMetadaHash
            );

            emit RequestedCash(
                (_details.quantity *
                    _details.price *
                    (10 ** cashToken.decimals())) / (10 ** register.decimals())
            );
            return (status);
        }

        if (
            (msg.sender == secondApprover && status == Status.Pending) ||
            status == Status.Accepted
        ) {
            if (status == Status.Pending) {
                status = Status.Accepted;
                emit NotifyTradeDVP(
                    _details.seller,
                    _details.buyer,
                    status,
                    _details.quantity,
                    _details.price,
                    paymentID(),
                    _details.encryptedMetadaHash
                );
            }
            if (msg.sender == settlementOperator) {
                // If secondApprover is same as SettlementOperator, do directly the atomic swap
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
                        (_details.quantity *
                            _details.price *
                            (10 ** cashToken.decimals())) /
                            (10 ** register.decimals())
                    ),
                    "the cash transfer has failed"
                );
                status = Status.Executed;
                emit NotifyTradeDVP(
                    _details.seller,
                    _details.buyer,
                    status,
                    _details.quantity,
                    _details.price,
                    paymentID(),
                    _details.encryptedMetadaHash
                );
                return (status);
            }
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
        TradeDetailDVP memory _details = details;
        require(status != Status.Rejected, "Trade already rejected");
        // seller can cancel the trade at any active state before the trade is executed
        if (msg.sender == _details.seller && (status != Status.Executed)) {
            status = Status.Rejected;
            emit NotifyTradeDVP(
                _details.seller,
                _details.buyer,
                status,
                _details.quantity,
                _details.price,
                paymentID(),
                _details.encryptedMetadaHash
            );
            return;
        }
        // buyer can cancel the trade when pending validation on his side or even after he has accepted the trade (but not when the seller prepares the trade (DRAFT))
        if (
            msg.sender == details.buyer &&
            (status == Status.Pending || status == Status.Accepted)
        ) {
            status = Status.Rejected;
            emit NotifyTradeDVP(
                _details.seller,
                _details.buyer,
                status,
                _details.quantity,
                _details.price,
                paymentID(),
                _details.encryptedMetadaHash
            );
            return;
        }
        if (msg.sender == settlementOperator && (status != Status.Executed)) {
            status = Status.Rejected;
            emit NotifyTradeDVP(
                _details.seller,
                _details.buyer,
                status,
                _details.quantity,
                _details.price,
                paymentID(),
                _details.encryptedMetadaHash
            );
            return;
        }
        require(false, "the trade cannot be rejected in this current status");
    }
}
