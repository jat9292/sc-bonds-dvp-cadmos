// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "./ITradeDVP.sol";

interface IBilateralTradeDVP is ITradeDVP {
    function setDetails(
        TradeDetailDVP calldata _details,
        bytes calldata encryptedMetadata,
        EncryptedAESwithECIES[] calldata encryptedSymmetricKeyForEachActor
    ) external;

    function approve(
        TradeDetailDVP calldata _detailscopy
    ) external returns (Status);

    function reject() external;
}
