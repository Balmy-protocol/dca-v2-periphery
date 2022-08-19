// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesPositionsHandler is IDCAStrategiesPositionsHandler {
  // TODO: add function similar to this one https://github.com/Mean-Finance/dca-v2-core/blob/main/contracts/interfaces/IDCAHub.sol#L243

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function deposit(
    uint80 _strategyId,
    address _from,
    uint256 _amount,
    uint32 _amountOfSwaps,
    uint32 _swapInterval,
    address _owner,
    PermissionSet[] memory _permissions
  ) external override returns (uint256) {}

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function withdrawSwapped(uint256 _positionId, address _recipient) external override returns (uint256) {}

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function increasePosition(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps
  ) external override {}

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function reducePosition(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps,
    address _recipient
  ) external override {}

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function terminate(
    uint256 _positionId,
    address _recipientUnswapped,
    address _recipientSwapped
  ) external override returns (uint256 _unswapped, uint256 _swapped) {}

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function syncPositionToLatestStrategyVersion(uint256 _positionId) external override {}

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function increaseAndSyncPositionToLatestStrategyVersion(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps
  ) external override {}

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function reduceAndSyncPositionToLatestStrategyVersion(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps,
    address _recipient
  ) external {}
}
