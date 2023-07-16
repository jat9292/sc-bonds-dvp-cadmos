// SPDX-License-Identifier: MIT
// SATURN project (last updated v0.1.0)

pragma solidity 0.8.17;

import "./intf/IBilateralTradeDVP.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./Cash.sol";

interface CashTokenExecutor {
    function requestTransfer(
        address cashToken,
        address _buyer,
        address _seller,
        uint256 settlementAmount
    ) external;
}

contract DVP is IBilateralTradeDVP, Initializable, ReentrancyGuard {
    Status public status;
    address public settlementOperator;
    address secondApprover;
    TradeDetailDVP public details;

    event RequestedCash(uint indexed requestedCash);

    /**
     * @dev As the smart contract is meant to be used behind a proxy we disable the initializer for the implemntation smart contract
     */
    constructor() {
        _disableInitializers();
    }

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
    function initialize(address _settlementOperator) public initializer {
        settlementOperator = _settlementOperator;
        status = Status.Draft;
        emit InitializedDVP(_settlementOperator, paymentID());
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
     * - details struct buyer gets buyer address - cannot be changed if already set
     * - details struct seller gets seller address - cannot be changed if already set
     * - we map the register contract to interact with it - cannot be changed if already set
     * - we map the cashToken contract to interact with it - cannot be changed if already set
     * - we map the cashTokenExecutor contract to interact with it - cannot be changed if already set
     */
    function setDetails(
        TradeDetailDVP calldata _details,
        bytes calldata encryptedMetadata,
        EncryptedAESwithECIES[] calldata encryptedSymmetricKeyForEachActor
    ) public {
        require(
            keccak256(encryptedMetadata) == _details.encryptedMetadaHash,
            "Metadata doe not match committed hash"
        );

        require(
            msg.sender == settlementOperator,
            "Only the settlementOperator can update this trade"
        );
        require(
            status == Status.Draft,
            "Cannot change the trade details unless in draft status"
        );

        require(
            details.cashToken == _details.cashToken ||
                details.cashToken == address(0),
            "Cannot Change CashToken Address"
        );
        require(
            details.cashTokenExecutor == _details.cashTokenExecutor ||
                details.cashToken == address(0),
            "Cannot Change cashTokenExecutor Address"
        );
        require(
            details.securityToken == _details.securityToken ||
                details.cashToken == address(0),
            "Cannot Change securityToken Address"
        );
        require(
            details.buyer == _details.buyer || details.buyer == address(0),
            "Cannot Change buyer Address"
        );
        require(
            details.seller == _details.securityToken ||
                details.seller == address(0),
            "Cannot Change seller Address"
        );

        details = _details;
        // an event needs to be generated to enable the back end to know that the trade has been changed
        emit NotifyTradeDVP(
            _details.buyer,
            _details.seller,
            status,
            settlementOperator,
            _details.cashToken,
            _details.cashTokenExecutor,
            _details.securityToken,
            _details.quantity,
            _details.price,
            _details.encryptedMetadaHash,
            paymentID()
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
            _details.cashTokenExecutor == _detailscopy.cashTokenExecutor &&
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
        Cash cashToken = Cash(_details.cashToken);
        CashTokenExecutor cashTokenExecutor = CashTokenExecutor(
            _details.cashTokenExecutor
        );
        IRegister securityToken = IRegister(_details.securityToken);
        uint256 cashToTransfer = (_details.quantity *
            _details.price *
            (10 ** cashToken.decimals())) / (10 ** securityToken.decimals());

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
                _details.buyer,
                _details.seller,
                status,
                settlementOperator,
                _details.cashToken,
                _details.cashTokenExecutor,
                _details.securityToken,
                _details.quantity,
                _details.price,
                _details.encryptedMetadaHash,
                paymentID()
            );

            emit RequestedCash(cashToTransfer);
            return (status);
        }

        if (
            (msg.sender == secondApprover && status == Status.Pending) ||
            status == Status.Accepted
        ) {
            if (status == Status.Pending) {
                status = Status.Accepted;
                emit NotifyTradeDVP(
                    _details.buyer,
                    _details.seller,
                    status,
                    settlementOperator,
                    _details.cashToken,
                    _details.cashTokenExecutor,
                    _details.securityToken,
                    _details.quantity,
                    _details.price,
                    _details.encryptedMetadaHash,
                    paymentID()
                );
            }
            if (msg.sender == settlementOperator) {
                // If secondApprover is same as SettlementOperator, do directly the atomic swap
                require(
                    securityToken.transferFrom(
                        _details.seller,
                        _details.buyer,
                        _details.quantity
                    ),
                    "the bond transfer has failed"
                );

                if (details.cashTokenExecutor == details.cashToken) {
                    //If cashTokenExecutor is cashToken then directly call transferFrom on the token
                    require(
                        cashToken.transferFrom(
                            _details.buyer,
                            _details.seller,
                            cashToTransfer
                        ),
                        "the cash transfer has failed"
                    );
                } else {
                    //Else we have to check that the transfer effectively took place
                    uint256 startingSellerBalance = cashToken.balanceOf(
                        _details.seller
                    );
                    cashTokenExecutor.requestTransfer(
                        address(cashToken),
                        _details.buyer,
                        _details.seller,
                        cashToTransfer
                    );
                    require(
                        cashToken.balanceOf(_details.seller) ==
                            startingSellerBalance + cashToTransfer,
                        "the cash transfer has failed"
                    );
                }
                status = Status.Executed;
                emit NotifyTradeDVP(
                    _details.buyer,
                    _details.seller,
                    status,
                    settlementOperator,
                    _details.cashToken,
                    _details.cashTokenExecutor,
                    _details.securityToken,
                    _details.quantity,
                    _details.price,
                    _details.encryptedMetadaHash,
                    paymentID()
                );
                return (status);
            }
            return (status);
        }

        require(false, "the trade cannot be approved in this current status");
        return (status); //unreachable but needed to avoid compilation warning
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
        // seller can cancel the trade when pending validation on his side or even after he has accepted the trade (but not when the settlementOperator prepares the trade (DRAFT))
        if (
            msg.sender == _details.seller &&
            (status == Status.Pending || status == Status.Accepted)
        ) {
            status = Status.Rejected;
            emit NotifyTradeDVP(
                _details.buyer,
                _details.seller,
                status,
                settlementOperator,
                _details.cashToken,
                _details.cashTokenExecutor,
                _details.securityToken,
                _details.quantity,
                _details.price,
                _details.encryptedMetadaHash,
                paymentID()
            );
            return;
        }
        // buyer can cancel the trade when pending validation on his side or even after he has accepted the trade (but not when the settlementOperator prepares the trade (DRAFT))
        if (
            msg.sender == details.buyer &&
            (status == Status.Pending || status == Status.Accepted)
        ) {
            status = Status.Rejected;
            emit NotifyTradeDVP(
                _details.buyer,
                _details.seller,
                status,
                settlementOperator,
                _details.cashToken,
                _details.cashTokenExecutor,
                _details.securityToken,
                _details.quantity,
                _details.price,
                _details.encryptedMetadaHash,
                paymentID()
            );
            return;
        }
        if (msg.sender == settlementOperator && (status != Status.Executed)) {
            status = Status.Rejected;
            emit NotifyTradeDVP(
                _details.buyer,
                _details.seller,
                status,
                settlementOperator,
                _details.cashToken,
                _details.cashTokenExecutor,
                _details.securityToken,
                _details.quantity,
                _details.price,
                _details.encryptedMetadaHash,
                paymentID()
            );
            return;
        }
        require(false, "the trade cannot be rejected in this current status");
    }
}
