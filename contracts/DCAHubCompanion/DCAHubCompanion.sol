// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './DCAHubCompanionParameters.sol';
import './DCAHubCompanionSwapHandler.sol';
import './DCAHubCompanionWTokenPositionHandler.sol';

contract DCAHubCompanion is DCAHubCompanionParameters, DCAHubCompanionSwapHandler, DCAHubCompanionWTokenPositionHandler, IDCAHubCompanion {
  constructor(IDCAHub _hub, IWrappedProtocolToken _wToken) DCAHubCompanionParameters(_hub, _wToken) {}
}
