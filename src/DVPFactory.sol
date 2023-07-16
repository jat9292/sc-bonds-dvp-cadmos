// SPDX-License-Identifier: MIT
// SATURN project (last updated v0.1.0)

pragma solidity 0.8.17;

import "./intf/IDVP.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";


contract DVPFactory is Ownable, Pausable
{
     /* ========== CONSTANTS ========== */

     address public immutable dvpImplementation;  // Address of the DVP Implementation

     /* ========== STATE VARIABLES ========== */

     mapping(address => bool) private _isDVP; // True iff DVP deployed to this address by Factory


     /* ========== CONSTRUCTOR ========== */

    constructor(
        address dvpImplementation_
    ) {
        dvpImplementation =  dvpImplementation_;
    }

    /* ========== VIEWS ========== */

    /// @notice Returns true iff tocheck is the address of a DVP smart contract deployed by this factory
    function isDVP(
        address tocheck
    ) public view  returns (bool) {
        return _isDVP[tocheck];
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _cloneDVP() internal returns (address DVP_){
        DVP_ = Clones.clone(dvpImplementation);
        _isDVP[DVP_] = true;
        IDVP(DVP_).initialize(
            msg.sender //settlementOperator is msg.sender
        );
        emit DVPDeployed(
            msg.sender,
            DVP_
        );
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// @notice Deploys a DVP smart contract, SettlementOperator is msg.sender
    /// @return DVP_ address of the Deployed DVP smart contract
    function createDVP()
        external
        whenNotPaused
        returns (address DVP_)
    {
        DVP_ = _cloneDVP();
    }

        /* ========== RESTRICTED FUNCTIONS ========== */

    /// @dev Used by Admin to pause the factory
    function pause()
        external
        onlyOwner
    {
        _pause();
    }

    /// @dev Used by Admin to unpause the factory
    function unPause()
        external
        onlyOwner
    {
        _unpause();
    }

    /* ========== EVENTS ========== */

    event DVPDeployed(
            address indexed settlementOperator,
            address DVPSmartContract
        );

}