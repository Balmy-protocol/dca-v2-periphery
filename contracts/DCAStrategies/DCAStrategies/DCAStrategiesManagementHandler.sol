// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesManagementHandler is IDCAStrategiesManagementHandler {
  struct StrategyOwnerAndVersion {
    address owner;
    uint96 latestVersion;
  }

  mapping(uint80 => StrategyOwnerAndVersion) internal _strategies;
  mapping(string => uint80) public getStrategyIdByName;
  mapping(uint80 => string) public getStrategyNameById;
  mapping(bytes32 => IDCAStrategies.ShareOfToken) internal _tokenShares;
  uint80 public strategyCounter;

  function _checkTokenSharesSanity(IDCAStrategies.ShareOfToken memory _tokens) internal pure returns (bool) {
    // TODO
    return true;
  }

  function _getStrategyAndVersionKey(uint256 _strategyId, uint80 _version) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_strategyId, _version));
  }

  /// @inheritdoc IDCAStrategiesManagementHandler
  function getStrategy(uint80 _strategyId) external view override returns (Strategy memory) {
    StrategyOwnerAndVersion memory _strategy = _strategies[_strategyId];
    return Strategy({owner: _strategy.owner, name: getStrategyNameById[_strategyId], currentVersion: _strategy.latestVersion});
  }

  /// @inheritdoc IDCAStrategiesManagementHandler
  function createStrategy(
    string memory _strategyName,
    IDCAStrategies.ShareOfToken memory _tokens,
    address _owner
  ) external override returns (uint80 _strategyId) {
    if (_owner == address(0)) revert IDCAStrategies.ZeroAddress();
    if (getStrategyIdByName[_strategyName] != 0) revert NameAlreadyExists();
    if (bytes(_strategyName).length < 32) revert NameTooLong();
    if (_checkTokenSharesSanity(_tokens) == false) revert BadTokenShares();

    _strategyId = ++strategyCounter;
    StrategyOwnerAndVersion memory _newStrategy = StrategyOwnerAndVersion({owner: _owner, latestVersion: 1});
    _strategies[_strategyId] = _newStrategy;
    _tokenShares[_getStrategyAndVersionKey(_strategyId, 1)] = _tokens;
    getStrategyIdByName[_strategyName] = _strategyId;

    // emit StrategyCreated(_strategyId, _newStrategy, _tokens);
  }

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
