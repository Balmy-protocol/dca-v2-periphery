// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './DCAHubCompanionParameters.sol';
import './DCAHubCompanionSwapHandler.sol';
import './DCAHubCompanionETHPositionHandler.sol';

contract DCAHubCompanion is DCAHubCompanionParameters, DCAHubCompanionSwapHandler, DCAHubCompanionETHPositionHandler, IDCAHubCompanion {
  // solhint-disable-next-line var-name-mixedcase
  constructor(IDCAHub _hub, IWETH9 _WETH) DCAHubCompanionParameters(_hub, _WETH) {}
}
