// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHub.sol';
import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAPermissionManager.sol';

/// @notice This contract will be used to migrate from the beta version of Mean v2, to the stable version
contract BetaMigrator {
  /// @notice Emitted when a position is migrated
  /// @param positionId The position's id
  event Migrated(uint256 positionId);

  /// @notice Thrown when the zero address is given
  error ZeroAddress();

  struct Signature {
    IDCAPermissionManager.PermissionSet[] permissions;
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
  }

  /// @notice Returns the address of the Hub used for the beta
  IDCAHub public betaHub;

  /// @notice Returns the address of the new stable Hub
  IDCAHub public stableHub;

  constructor(IDCAHub _betaHub, IDCAHub _stableHub) {
    if (address(_betaHub) == address(0) || address(_stableHub) == address(0)) revert ZeroAddress();
    betaHub = _betaHub;
    stableHub = _stableHub;
  }

  /// @notice Executes a migration from the beta version, to the new stable version. Will terminate the position in beta,
  /// send the swapped tokens to the owner, and then create a new position in the new hub with the unswapped balance
  /// @dev Due to a bug in the beta version, only `TERMINATE` should be given as permissions
  /// @param _positionId The id of the position to migrate
  /// @param _signature The signature to give permissions to this contract
  function migrate(uint256 _positionId, Signature calldata _signature) external {
    IDCAPermissionManager _permissionManager = betaHub.permissionManager();
    address _owner = _permissionManager.ownerOf(_positionId);

    // Fetch position
    IDCAHub.UserPosition memory _position = betaHub.userPosition(_positionId);

    // Give myself permissions
    _permissionManager.permissionPermit(_signature.permissions, _positionId, _signature.deadline, _signature.v, _signature.r, _signature.s);

    // Terminate the position. Send swapped to owner and unswapped to myself
    (uint256 _unswapped, ) = betaHub.terminate(_positionId, address(this), _owner);

    // Approve Hub for deposit
    _position.from.approve(address(stableHub), _unswapped);

    // Create position for owner
    stableHub.deposit(
      address(_position.from),
      address(_position.to),
      _unswapped,
      _position.swapsLeft,
      _position.swapInterval,
      _owner,
      new IDCAPermissionManager.PermissionSet[](0)
    );

    // Emit event
    emit Migrated(_positionId);
  }
}
