// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesManagementHandler is IDCAStrategiesManagementHandler {
  struct StrategyOwnerAndVersion {
    address owner;
    uint16 latestVersion;
  }

  /// @inheritdoc IDCAStrategiesManagementHandler
  mapping(string => uint80) public strategyIdByName;
  /// @inheritdoc IDCAStrategiesManagementHandler
  uint80 public strategyCounter;
  mapping(uint80 => StrategyOwnerAndVersion) internal _strategies;
  mapping(uint80 => string) internal _strategyNameById;
  mapping(bytes32 => IDCAStrategies.ShareOfToken[]) internal _tokenShares;

  /// @inheritdoc IDCAStrategiesManagementHandler
  function getStrategy(uint80 _strategyId) external view override returns (Strategy memory) {
    StrategyOwnerAndVersion memory _strategy = _strategies[_strategyId];
    IDCAStrategies.ShareOfToken[] memory _tokens = _tokenShares[_getStrategyAndVersionKey(_strategyId, _strategy.latestVersion)];
    return Strategy({owner: _strategy.owner, name: _strategyNameById[_strategyId], currentVersion: _strategy.latestVersion, tokens: _tokens});
  }

  /// @inheritdoc IDCAStrategiesManagementHandler
  function createStrategy(
    string memory _strategyName,
    IDCAStrategies.ShareOfToken[] memory _tokens,
    address _owner
  ) external override returns (uint80 _strategyId) {
    if (_owner == address(0)) revert IDCAStrategies.ZeroAddress();
    if (strategyIdByName[_strategyName] != 0) revert NameAlreadyExists();
    if (bytes(_strategyName).length > 32) revert NameTooLong();
    if (_checkTokenSharesSanity(_tokens) == false) revert InvalidTokenShares();

    _strategyId = ++strategyCounter;
    bytes32 _key = _getStrategyAndVersionKey(_strategyId, 1);
    for (uint256 i = 0; i < _tokens.length; ) {
      _tokenShares[_key].push(_tokens[i]);
      unchecked {
        i++;
      }
    }

    _strategies[_strategyId] = StrategyOwnerAndVersion({owner: _owner, latestVersion: 1});
    strategyIdByName[_strategyName] = _strategyId;
    _strategyNameById[_strategyId] = _strategyName;

    emit StrategyCreated(_strategyId, _strategyName, _tokens, _owner);
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

  function _checkTokenSharesSanity(IDCAStrategies.ShareOfToken[] memory _tokens) internal pure returns (bool) {
    // TODO
    return true;
  }

  function _getStrategyAndVersionKey(uint256 _strategyId, uint16 _version) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_strategyId, _version));
  }
}
