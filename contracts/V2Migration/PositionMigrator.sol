// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHub.sol';
import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAPermissionManager.sol';

/// @notice This contract will be used to migrate position from one DCAHub to the other
contract PositionMigrator {
  /// @notice Emitted when a position is migrated
  /// @param sourceHub The hub that contains the position to migrate
  /// @param sourcePositionId The id of the position that will be migrated
  /// @param targetHub The hub where the position will me migrated into
  /// @param targetPositionId The id of the new position
  event Migrated(IDCAHub sourceHub, uint256 sourcePositionId, IDCAHub targetHub, uint256 targetPositionId);

  struct Signature {
    IDCAPermissionManager.PermissionSet[] permissions;
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
  }

  /// @notice Migrates a position from one hub, into another one. Will terminate the position on the source hub,
  /// send the swapped tokens to the owner, and then create a new position in the new hub with the unswapped balance
  /// @dev If the source hub is the beta version, due to a bug, only `TERMINATE` should be given as permissions
  /// @param _sourceHub The hub that contains the position to migrate
  /// @param _positionId The id of the position to migrate
  /// @param _signature The signature to give permissions to this contract
  /// @param _targetHub The hub where the position will me migrated into
  function migrate(
    IDCAHub _sourceHub,
    uint256 _positionId,
    Signature calldata _signature,
    IDCAHub _targetHub
  ) external {
    IDCAPermissionManager _permissionManager = _sourceHub.permissionManager();
    address _owner = _permissionManager.ownerOf(_positionId);

    // Fetch position
    IDCAHub.UserPosition memory _position = _sourceHub.userPosition(_positionId);

    // Give myself permissions
    _permissionManager.permissionPermit(_signature.permissions, _positionId, _signature.deadline, _signature.v, _signature.r, _signature.s);

    // Terminate the position. Send swapped to owner and unswapped to myself
    (uint256 _unswapped, ) = _sourceHub.terminate(_positionId, address(this), _owner);

    // Approve Hub for deposit
    _position.from.approve(address(_targetHub), _unswapped);

    // Create position for owner
    uint256 _newPositionId = _targetHub.deposit(
      address(_position.from),
      address(_position.to),
      _unswapped,
      _position.swapsLeft,
      _position.swapInterval,
      _owner,
      new IDCAPermissionManager.PermissionSet[](0)
    );

    // Emit event
    emit Migrated(_sourceHub, _positionId, _targetHub, _newPositionId);
  }
}
