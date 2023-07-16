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

    event InitializedDVP(address indexed settlementOperator, bytes8 paymentID);

    event NotifyTradeDVP(
        address indexed buyer,
        address indexed seller,
        bytes32 indexed encryptedMetadataHash,
        Status status,
        address settlementOperator,
        address cashToken,
        address cashTokenExecutor,
        address securityToken,
        uint256 quantity,
        uint256 price,
        bytes8 paymentID
    );
    struct EncryptedAESwithECIES {
        bytes iv;
        bytes ephemPublicKey;
        bytes ciphertext;
        bytes mac;
    }
    event EncryptedMetaData(
        bytes32 indexed encryptedMetadataHash,
        bytes encryptedMetadata,
        EncryptedAESwithECIES[] encryptedSymmetricKeyForEachActor
    );
}
