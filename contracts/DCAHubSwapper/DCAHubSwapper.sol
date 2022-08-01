// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './DCAHubSwapperSwapHandler.sol';

contract DCAHubSwapper is DCAHubSwapperSwapHandler, IDCAHubSwapper {
  constructor(address _swapperRegistry) DCAHubSwapperSwapHandler(_swapperRegistry) {}
}
