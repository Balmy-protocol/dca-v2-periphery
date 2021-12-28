// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionWTokenPositionHandler.sol';
import './DCAHubCompanionParameters.sol';

contract DCAHubCompanionWTokenPositionHandlerMock is DCAHubCompanionWTokenPositionHandler, DCAHubCompanionParametersMock {
  constructor(
    IDCAHub _hub,
    IDCAPermissionManager _permissionManager,
    IWrappedProtocolToken _wToken
  ) DCAHubCompanionParametersMock(_hub, _permissionManager, _wToken, address(1)) {}
}
