// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAHubCompanion.sol';
import '../utils/Governable.sol';

abstract contract DCAHubCompanionParameters is Governable, IDCAHubCompanionParameters {
  IDCAHub public immutable hub;
  IDCAPermissionManager public immutable permissionManager;
  IWrappedProtocolToken public immutable wToken;
  address public constant PROTOCOL_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  mapping(address => bool) public tokenHasApprovalIssue;

  constructor(
    IDCAHub _hub,
    IDCAPermissionManager _permissionManager,
    IWrappedProtocolToken _wToken,
    address _governor
  ) Governable(_governor) {
    if (address(_hub) == address(0) || address(_permissionManager) == address(0) || address(_wToken) == address(0))
      revert IDCAHubCompanion.ZeroAddress();
    hub = _hub;
    wToken = _wToken;
    permissionManager = _permissionManager;
  }

  function setTokensWithApprovalIssues(address[] calldata _addresses, bool[] calldata _hasIssue) external onlyGovernor {
    if (_addresses.length != _hasIssue.length) revert InvalidTokenApprovalParams();
    for (uint256 i; i < _addresses.length; i++) {
      tokenHasApprovalIssue[_addresses[i]] = _hasIssue[i];
    }
    emit TokenWithApprovalIssuesSet(_addresses, _hasIssue);
  }
}
