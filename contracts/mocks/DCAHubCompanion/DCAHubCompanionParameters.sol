// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionParameters.sol';

contract DCAHubCompanionParametersMock is DCAHubCompanionParameters {
  constructor(
    IDCAHub _hub,
    IDCAPermissionManager _permissionManager,
    IWrappedProtocolToken _wToken,
    address _governor
  ) DCAHubCompanionParameters(_hub, _permissionManager, _wToken, _governor) {}
}
