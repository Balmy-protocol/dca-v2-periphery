// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAStrategies/DCAStrategies/DCAStrategiesManagementHandler.sol';

contract DCAStrategiesManagementHandlerMock is DCAStrategiesManagementHandler {
  function getStrategy(uint80 _strategyId) external view override returns (Strategy memory) {
    return _strategies[_strategyId];
  }

  function getTokenShares(uint256 _strategyId, uint80 _version) external view returns (IDCAStrategies.ShareOfToken memory) {
    return _tokenShares[_getTokenSharesKey(_strategyId, _version)];
  }

  function getStrategyIdByName(string memory _strategyName) external view override returns (uint80) {
    return _strategyNames[_strategyName];
  }
}
