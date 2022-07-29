// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './DCAHubCompanionLibrariesHandler.sol';
import './DCAHubCompanionHubProxyHandler.sol';
import './utils/Multicall.sol';

contract DCAHubCompanion is DCAHubCompanionLibrariesHandler, DCAHubCompanionHubProxyHandler, Multicall, IDCAHubCompanion {}
