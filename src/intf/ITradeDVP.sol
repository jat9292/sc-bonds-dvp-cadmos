// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;
import "./IRegister.sol";

interface ITradeDVP {
    enum Status {
        Draft,
        Pending,
        Rejected,
        Accepted,
        Executed,
        Paid
    }

    struct TradeDetailDVP {
        bytes32 encryptedMetadaHash;
        uint256 quantity;
        uint256 price;
        address cashToken;
        address cashTokenExecutor;
        address securityToken;
        address buyer;
        address seller;
        uint256 tradeDate;
        uint256 valueDate;
    }

    function status() external view returns (Status);

    function paymentID() external view returns (bytes8);

    event InitializedDVP(
        address indexed settlementOperator,
        address indexed buyer,
        address indexed seller,
        address cashToken,
        address cashTokenExecutor,
        address securityToken,
        bytes8  paymentID
    );

    event NotifyTradeDVP(
        address indexed buyer,
        address indexed seller,
        Status indexed status,
        uint256 quantity,
        uint256 price,
        bytes32 encryptedMetadataHash
    );
    struct EncryptedAESwithECIES {
        bytes iv;
        bytes ephemPublicKey;
        bytes ciphertext;
        bytes mac;
    }
    event EncryptedMetaData(
        bytes encryptedMetadata,
        bytes32 encryptedMetadataHash,
        EncryptedAESwithECIES[3] encryptedSymmetricKeyForEachActor
    );
}
