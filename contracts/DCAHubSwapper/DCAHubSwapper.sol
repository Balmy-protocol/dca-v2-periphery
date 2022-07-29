// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './DCAHubSwapperDustHandler.sol';
import './DCAHubSwapperParameters.sol';
import './DCAHubSwapperSwapHandler.sol';

contract DCAHubSwapper is DCAHubSwapperParameters, DCAHubSwapperSwapHandler, DCAHubSwapperDustHandler, IDCAHubSwapper {
  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    address _governor,
    address _swapperRegistry
  ) DCAHubSwapperParameters(_hub, _wToken, _governor) DCAHubSwapperSwapHandler(_swapperRegistry) {}
}
