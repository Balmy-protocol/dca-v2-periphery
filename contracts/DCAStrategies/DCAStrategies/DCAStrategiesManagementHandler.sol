// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesManagementHandler is IDCAStrategiesManagementHandler {
  /// @inheritdoc IDCAStrategiesManagementHandler
  function getStrategy(uint80 _strategyId) external view override returns (IDCAStrategies.Strategy memory) {}

  /// @inheritdoc IDCAStrategiesManagementHandler
  function getStrategyIdByName(string memory _strategyName) external view override returns (uint80 _strategyId) {}

  /// @inheritdoc IDCAStrategiesManagementHandler
  function createStrategy(
    string memory _strategyName,
    IDCAStrategies.ShareOfToken[] memory _tokens,
    address _owner
  ) external override returns (uint80 _strategyId) {}

  /// @inheritdoc IDCAStrategiesManagementHandler
  function updateStrategyTokens(uint80 _strategyId, IDCAStrategies.ShareOfToken[] memory _tokens) external override {}

  /// @inheritdoc IDCAStrategiesManagementHandler
  function updateStrategyName(uint80 _strategyId, string memory _newStrategyName) external override {}

  /// @inheritdoc IDCAStrategiesManagementHandler
  function transferStrategyOwnership(uint80 _strategyId, address _newOwner) external override {}

  /// @inheritdoc IDCAStrategiesManagementHandler
  function acceptStrategyOwnership(uint80 _strategyId) external override {}

  /// @inheritdoc IDCAStrategiesManagementHandler
  function cancelStrategyOwnershipTransfer(uint80 _strategyId) external override {}
}
