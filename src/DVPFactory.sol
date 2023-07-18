// SPDX-License-Identifier: MIT
// SATURN project (last updated v0.1.0)

pragma solidity 0.8.17;

import "./intf/IDVP.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract DVPFactory is Ownable, Pausable {
    /* ========== CONSTANTS ========== */

    address public immutable dvpImplementation; // Address of the DVP Implementation

    /* ========== CONSTRUCTOR ========== */

    constructor(address dvpImplementation_) {
        dvpImplementation = dvpImplementation_;
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _cloneDVP() internal returns (address DVP_) {
        DVP_ = Clones.clone(dvpImplementation);
        IDVP(DVP_).initialize(
            msg.sender //settlementOperator is msg.sender
        );
        emit DVPDeployed(DVP_);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// @notice Deploys a DVP smart contract, SettlementOperator is msg.sender
    /// @return DVP_ address of the Deployed DVP smart contract
    function createDVP() external returns (address DVP_) {
        DVP_ = _cloneDVP();
    }

    /* ========== EVENTS ========== */

    event DVPDeployed(address DVPSmartContract);
}
