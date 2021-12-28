// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './DCAHubCompanionParameters.sol';

abstract contract DCAHubCompanionMulticallHandler is DCAHubCompanionParameters, IDCAHubCompanionMulticallHandler {
  using SafeERC20 for IERC20Metadata;

  function withdrawSwappedProxy(uint256 _positionId, address _recipient) external returns (uint256 _swapped) {
    if (!permissionManager.hasPermission(_positionId, msg.sender, IDCAPermissionManager.Permission.WITHDRAW))
      revert IDCAHubCompanion.UnauthorizedCaller();
    _swapped = hub.withdrawSwapped(_positionId, _recipient);
  }

  function withdrawSwappedManyProxy(IDCAHub.PositionSet[] calldata _positions, address _recipient)
    external
    returns (uint256[] memory _withdrawn)
  {
    for (uint256 i; i < _positions.length; i++) {
      for (uint256 j; j < _positions[i].positionIds.length; j++) {
        if (!permissionManager.hasPermission(_positions[i].positionIds[j], msg.sender, IDCAPermissionManager.Permission.WITHDRAW))
          revert IDCAHubCompanion.UnauthorizedCaller();
      }
    }
    _withdrawn = hub.withdrawSwappedMany(_positions, _recipient);
  }

  function increasePositionProxy(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps
  ) external {
    if (!permissionManager.hasPermission(_positionId, msg.sender, IDCAPermissionManager.Permission.INCREASE))
      revert IDCAHubCompanion.UnauthorizedCaller();
    IERC20Metadata _from = hub.userPosition(_positionId).from;
    _from.safeTransferFrom(msg.sender, address(this), _amount);
    _from.approve(address(hub), _amount);
    hub.increasePosition(_positionId, _amount, _newSwaps);
  }

  function reducePositionProxy(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps,
    address _recipient
  ) external {
    if (!permissionManager.hasPermission(_positionId, msg.sender, IDCAPermissionManager.Permission.REDUCE))
      revert IDCAHubCompanion.UnauthorizedCaller();
    hub.reducePosition(_positionId, _amount, _newSwaps, _recipient);
  }

  function terminateProxy(
    uint256 _positionId,
    address _recipientUnswapped,
    address _recipientSwapped
  ) external returns (uint256 _unswapped, uint256 _swapped) {
    if (!permissionManager.hasPermission(_positionId, msg.sender, IDCAPermissionManager.Permission.TERMINATE))
      revert IDCAHubCompanion.UnauthorizedCaller();
    (_unswapped, _swapped) = hub.terminate(_positionId, _recipientUnswapped, _recipientSwapped);
  }
}
