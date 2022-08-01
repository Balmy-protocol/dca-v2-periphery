// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/swappers/solidity/contracts/extensions/GetBalances.sol';
import '@mean-finance/swappers/solidity/contracts/extensions/RevokableWithGovernor.sol';
import './DCAHubCompanionLibrariesHandler.sol';
import './DCAHubCompanionHubProxyHandler.sol';
import './DCAHubCompanionTakeSendAndSwapHandler.sol';
import './utils/Multicall.sol';

contract DCAHubCompanion is
  DCAHubCompanionLibrariesHandler,
  DCAHubCompanionHubProxyHandler,
  DCAHubCompanionTakeSendAndSwapHandler,
  RevokableWithGovernor,
  GetBalances,
  Multicall,
  IDCAHubCompanion
{
  constructor(address _swapperRegistry, address _governor) SwapAdapter(_swapperRegistry) Governable(_governor) {}
}
