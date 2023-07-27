// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './DCAHubCompanionLibrariesHandler.sol';
import './DCAHubCompanionHubProxyHandler.sol';
import '../utils/BaseCompanion.sol';

contract DCAHubCompanion is DCAHubCompanionLibrariesHandler, DCAHubCompanionHubProxyHandler, BaseCompanion, IDCAHubCompanion {
  constructor(
    address _swapperRegistry,
    address _governor,
    IPermit2 _permit2
  ) BaseCompanion(_swapperRegistry, _governor, _permit2) {}
}
