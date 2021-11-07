// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionSwapHandler.sol';
import './DCAHubCompanionParameters.sol';

contract DCAHubCompanionSwapHandlerMock is DCAHubCompanionSwapHandler, DCAHubCompanionParametersMock {
  constructor(IDCAHub _hub, IWrappedProtocolToken _wToken) DCAHubCompanionParametersMock(_hub, _wToken) {}
}
