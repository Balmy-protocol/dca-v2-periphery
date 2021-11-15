// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './DCAHubCompanionParameters.sol';
import './DCAHubCompanionSwapHandler.sol';
import './DCAHubCompanionWTokenPositionHandler.sol';
import './DCAHubCompanionDustHandler.sol';
import './DCAHubCompanionLibrariesHandler.sol';

contract DCAHubCompanion is
  DCAHubCompanionParameters,
  DCAHubCompanionSwapHandler,
  DCAHubCompanionWTokenPositionHandler,
  DCAHubCompanionDustHandler,
  DCAHubCompanionLibrariesHandler,
  IDCAHubCompanion
{
  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    address _governor,
    // solhint-disable-next-line var-name-mixedcase
    address _ZRX
  ) DCAHubCompanionParameters(_hub, _wToken, _governor) DCAHubCompanionSwapHandler(_ZRX) {}
}
