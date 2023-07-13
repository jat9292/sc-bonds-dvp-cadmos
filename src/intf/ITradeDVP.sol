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
        address securityToken;
        address buyer;
        address seller;
        uint256 tradeDate;
        uint256 valueDate;
        bytes8 paymentID;
    }

    function status() external view returns (Status);

    function paymentID() external view returns (bytes8);

    event NotifyTradeDVP(
        address indexed seller,
        address indexed buyer,
        Status indexed status,
        uint256 quantity,
        uint256 price,
        bytes8 paymentID,
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
