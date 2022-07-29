// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './DCAHubCompanionParameters.sol';
import './DCAHubCompanionWTokenPositionHandler.sol';
import './DCAHubCompanionLibrariesHandler.sol';
import './DCAHubCompanionHubProxyHandler.sol';
import './utils/Multicall.sol';

contract DCAHubCompanion is
  DCAHubCompanionParameters,
  DCAHubCompanionWTokenPositionHandler,
  DCAHubCompanionLibrariesHandler,
  DCAHubCompanionHubProxyHandler,
  Multicall,
  IDCAHubCompanion
{
  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    address _governor
  ) DCAHubCompanionParameters(_hub, _hub.permissionManager(), _wToken, _governor) {}
}
