// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAHubCompanion.sol';

abstract contract DCAHubCompanionParameters is IDCAHubCompanionParameters {
  /// @inheritdoc IDCAHubCompanionParameters
  IDCAHub public immutable hub;
  /// @inheritdoc IDCAHubCompanionParameters
  IDCAPermissionManager public immutable permissionManager;
  /// @inheritdoc IDCAHubCompanionParameters
  IWrappedProtocolToken public immutable wToken;
  /// @inheritdoc IDCAHubCompanionParameters
  address public constant PROTOCOL_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor(
    IDCAHub _hub,
    IDCAPermissionManager _permissionManager,
    IWrappedProtocolToken _wToken,
    address
  ) {
    if (address(_hub) == address(0) || address(_permissionManager) == address(0) || address(_wToken) == address(0))
      revert IDCAHubCompanion.ZeroAddress();
    hub = _hub;
    wToken = _wToken;
    permissionManager = _permissionManager;
  }

  function _checkPermissionOrFail(uint256 _positionId, IDCAPermissionManager.Permission _permission) internal view {
    if (!permissionManager.hasPermission(_positionId, msg.sender, _permission)) revert IDCAHubCompanion.UnauthorizedCaller();
  }

  modifier checkPermission(uint256 _positionId, IDCAPermissionManager.Permission _permission) {
    _checkPermissionOrFail(_positionId, _permission);
    _;
  }
}
