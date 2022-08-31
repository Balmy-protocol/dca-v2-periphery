// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesPositionsHandler is IDCAStrategiesPositionsHandler {
  // TODO: add function similar to this one https://github.com/Mean-Finance/dca-v2-core/blob/main/contracts/interfaces/IDCAHub.sol#L243

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function deposit(IDCAStrategies.DepositParams calldata parameters) external returns (uint256) {
    IDCAStrategies.StrategyOwnerAndVersion memory _strategy = _getStrategiesOwnerAndVersion(parameters.strategyId);
    IDCAStrategies.ShareOfToken[] memory _tokens = _getTokenShares(parameters.strategyId, _strategy.latestVersion);

    IERC20(parameters.from).transferFrom(msg.sender, address(this), parameters.amount);

    for (uint256 i = 0; i < _tokens.length; i++) {
      // uint256 _toDeposit = (parameters.amount * _tokens[i].share) / _TOTAL;
      // _approveHub();
      // IDCAPermissionManager.PermissionSet[] memory _permissions = new IDCAPermissionManager.PermissionSet[](0);
      // parameters.hub.deposit(
      //   parameters.from,
      //   _tokens[i].token,
      //   _toDeposit,
      //   parameters.amountOfSwaps,
      //   parameters.swapInterval,
      //   address(this),
      //   _permissions
      // );
    }

    uint256 _positionId = _create(parameters.owner, parameters.permissions);

    emit Deposited(
      msg.sender,
      parameters.owner,
      _positionId,
      parameters.from,
      parameters.strategyId,
      _strategy.latestVersion,
      parameters.swapInterval,
      parameters.permissions
    );

    return _positionId;
  }

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

  function _getTokenShares(uint80 _strategyId, uint16 _version) internal virtual returns (IDCAStrategies.ShareOfToken[] memory) {}

  function _getStrategiesOwnerAndVersion(uint80 _strategyId) internal virtual returns (IDCAStrategies.StrategyOwnerAndVersion memory) {}

  function _create(address _owner, IDCAStrategies.PermissionSet[] calldata _permissions) internal virtual returns (uint256 _mintId) {}

  function _approveHub() internal {
    // here I will approve the ERC20 tokens, if approval is needed
  }
}
