// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesManagementHandler is IDCAStrategiesManagementHandler {
  function getStrategy(uint80 _strategyId) external view override returns (Strategy memory) {}

  function getStrategyIdByName(string memory _strategyName) external view override returns (uint80 _strategyId) {}

  function createStrategy(
    string memory _strategyName,
    ShareOfToken[] memory _tokens,
    address _owner
  ) external override returns (uint80 _strategyId) {}

  function updateStrategyTokens(uint80 _strategyId, ShareOfToken[] memory _tokens) external override {}

  function updateStrategyName(uint80 _strategyId, string memory _newStrategyName) external override {}

  function transferStrategyOwnership(uint80 _strategyId, address _newOwner) external override {}

  function acceptStrategyOwnership(uint80 _strategyId) external override {}

  function cancelStrategyOwnershipTransfer(uint80 _strategyId, address _newOwner) external override {}
}
