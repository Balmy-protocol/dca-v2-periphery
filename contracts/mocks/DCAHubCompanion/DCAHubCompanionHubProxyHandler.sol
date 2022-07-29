// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionHubProxyHandler.sol';
import './DCAHubCompanionParameters.sol';

contract DCAHubCompanionHubProxyHandlerMock is DCAHubCompanionHubProxyHandler, DCAHubCompanionParametersMock {
  constructor(
    IDCAHub _hub,
    IDCAPermissionManager _permissionManager,
    address _governor
  ) DCAHubCompanionParametersMock(_hub, _permissionManager, IWrappedProtocolToken(address(1)), _governor) {}
}
