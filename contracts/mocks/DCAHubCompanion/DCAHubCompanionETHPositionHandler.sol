// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionETHPositionHandler.sol';
import './DCAHubCompanionParameters.sol';

contract DCAHubCompanionETHPositionHandlerMock is DCAHubCompanionETHPositionHandler, DCAHubCompanionParametersMock {
  // solhint-disable-next-line var-name-mixedcase
  constructor(IDCAHub _hub, IWETH9 _WETH) DCAHubCompanionParametersMock(_hub, _WETH) {}
}
