// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAStrategies/DCAStrategies/DCAStrategiesManagementHandler.sol';

contract DCAStrategiesManagementHandlerMock is DCAStrategiesManagementHandler {
  function getTokenShares(uint80 _strategyId, uint96 _version) external view returns (IDCAStrategies.ShareOfToken[] memory) {
    return _tokenShares[_getStrategyAndVersionKey(_strategyId, _version)];
  }
}
