// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './DCAHubCompanionParameters.sol';

abstract contract DCAHubCompanionWTokenPositionHandler is DCAHubCompanionParameters, IDCAHubCompanionWTokenPositionHandler {
  using SafeERC20 for IERC20;

  constructor() {
    approveWTokenForHub();
  }

  function depositUsingProtocolToken(
    address _from,
    address _to,
    uint256 _amount,
    uint32 _amountOfSwaps,
    uint32 _swapInterval,
    address _owner,
    IDCAPermissionManager.PermissionSet[] calldata _permissions,
    bytes calldata _miscellaneous
  ) external payable returns (uint256 _positionId) {
    if (_from != PROTOCOL_TOKEN || _to == PROTOCOL_TOKEN) revert InvalidTokens();

    _wrap(_amount);
    IDCAPermissionManager.PermissionSet[] memory _newPermissions = _addPermissionsToThisContract(_permissions);
    _positionId = _miscellaneous.length > 0
      ? hub.deposit(address(wToken), _to, _amount, _amountOfSwaps, _swapInterval, _owner, _newPermissions, _miscellaneous)
      : hub.deposit(address(wToken), _to, _amount, _amountOfSwaps, _swapInterval, _owner, _newPermissions);
  }

  function withdrawSwappedUsingProtocolToken(uint256 _positionId, address payable _recipient)
    external
    checkPermission(_positionId, IDCAPermissionManager.Permission.WITHDRAW)
    returns (uint256 _swapped)
  {
    _swapped = hub.withdrawSwapped(_positionId, address(this));
    _unwrapAndSend(_swapped, _recipient);
  }

  function withdrawSwappedManyUsingProtocolToken(uint256[] calldata _positionIds, address payable _recipient)
    external
    returns (uint256 _swapped)
  {
    for (uint256 i; i < _positionIds.length; i++) {
      _checkPermissionOrFail(_positionIds[i], IDCAPermissionManager.Permission.WITHDRAW);
    }
    IDCAHub.PositionSet[] memory _positionSets = new IDCAHub.PositionSet[](1);
    _positionSets[0].token = address(wToken);
    _positionSets[0].positionIds = _positionIds;
    uint256[] memory _withdrawn = hub.withdrawSwappedMany(_positionSets, address(this));
    _swapped = _withdrawn[0];
    _unwrapAndSend(_swapped, _recipient);
  }

  function increasePositionUsingProtocolToken(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps
  ) external payable checkPermission(_positionId, IDCAPermissionManager.Permission.INCREASE) {
    _wrap(_amount);
    hub.increasePosition(_positionId, _amount, _newSwaps);
  }

  function reducePositionUsingProtocolToken(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps,
    address payable _recipient
  ) external checkPermission(_positionId, IDCAPermissionManager.Permission.REDUCE) {
    hub.reducePosition(_positionId, _amount, _newSwaps, address(this));
    _unwrapAndSend(_amount, _recipient);
  }

  function terminateUsingProtocolTokenAsFrom(
    uint256 _positionId,
    address payable _recipientUnswapped,
    address _recipientSwapped
  ) external checkPermission(_positionId, IDCAPermissionManager.Permission.TERMINATE) returns (uint256 _unswapped, uint256 _swapped) {
    (_unswapped, _swapped) = hub.terminate(_positionId, address(this), _recipientSwapped);
    _unwrapAndSend(_unswapped, _recipientUnswapped);
  }

  function terminateUsingProtocolTokenAsTo(
    uint256 _positionId,
    address _recipientUnswapped,
    address payable _recipientSwapped
  ) external checkPermission(_positionId, IDCAPermissionManager.Permission.TERMINATE) returns (uint256 _unswapped, uint256 _swapped) {
    (_unswapped, _swapped) = hub.terminate(_positionId, _recipientUnswapped, address(this));
    _unwrapAndSend(_swapped, _recipientSwapped);
  }

  function approveWTokenForHub() public {
    wToken.approve(address(hub), type(uint256).max);
  }

  receive() external payable {}

  function _unwrapAndSend(uint256 _amount, address payable _recipient) internal {
    if (_amount > 0) {
      // Unwrap wToken
      wToken.withdraw(_amount);

      // Send protocol token to recipient
      _recipient.transfer(_amount);
    }
  }

  function _wrap(uint256 _amount) internal {
    if (msg.value != _amount) revert InvalidAmountOfProtocolTokenReceived();

    if (_amount > 0) {
      // Convert to wToken
      wToken.deposit{value: _amount}();
    }
  }

  function _addPermissionsToThisContract(IDCAPermissionManager.PermissionSet[] calldata _permissionSets)
    internal
    view
    returns (IDCAPermissionManager.PermissionSet[] memory _newPermissionSets)
  {
    // Copy permission sets to the new array
    _newPermissionSets = new IDCAPermissionManager.PermissionSet[](_permissionSets.length + 1);
    for (uint256 i; i < _permissionSets.length; i++) {
      _newPermissionSets[i] = _permissionSets[i];
    }

    // Create new list that contains all permissions
    IDCAPermissionManager.Permission[] memory _permissions = new IDCAPermissionManager.Permission[](4);
    for (uint256 i; i < 4; i++) {
      _permissions[i] = IDCAPermissionManager.Permission(i);
    }

    // Assign all permisisons to this contract
    _newPermissionSets[_permissionSets.length] = IDCAPermissionManager.PermissionSet({operator: address(this), permissions: _permissions});
  }
}
