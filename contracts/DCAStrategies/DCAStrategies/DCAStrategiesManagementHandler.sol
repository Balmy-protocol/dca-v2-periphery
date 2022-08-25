// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesManagementHandler is IDCAStrategiesManagementHandler {
  mapping(uint80 => Strategy) internal _strategies;
  mapping(string => uint80) internal _strategyNames;
  mapping(bytes32 => IDCAStrategies.ShareOfToken) internal _tokenShares;
  uint80 public strategyCounter; // NOTE: could we use _mintCounter from DCAStrategiesPermissionsHandler?

  function _checkTokenSharesSanity(IDCAStrategies.ShareOfToken memory _tokens) internal pure returns (bool) {
    // TODO
    return true;
  }

  function _getTokenSharesKey(uint256 _strategyId, uint80 _version) internal pure returns (bytes32) {
    // NOTE:
    return keccak256(abi.encodePacked(_strategyId, _version));
  }

  /// @inheritdoc IDCAStrategiesManagementHandler
  function getStrategy(uint80 _strategyId) external view virtual override returns (IDCAStrategies.Strategy memory) {}

  /// @inheritdoc IDCAStrategiesManagementHandler
  function getStrategyIdByName(string memory _strategyName) external view virtual override returns (uint80 _strategyId) {}

  /// @inheritdoc IDCAStrategiesManagementHandler
  function createStrategy(
    string memory _strategyName,
    IDCAStrategies.ShareOfToken memory _tokens,
    address _owner
  ) external override returns (uint80 _strategyId) {
    if (_owner == address(0)) revert IDCAStrategies.ZeroAddress(); // NOTE: should users be able to assign ownership to any address? what if they use it for scamming? e.g: give ownership of a strategy to vitalik.eth and use it to trick users into buying shitcoins
    if (_strategyNames[_strategyName] != 0) revert NameAlreadyExists();
    if (_checkTokenSharesSanity(_tokens) == false) revert BadTokenShares();

    _strategyId = ++strategyCounter;
    Strategy memory _newStrategy = Strategy({owner: _owner, name: _strategyName, version: 1});
    _strategies[_strategyId] = _newStrategy;
    _tokenShares[_getTokenSharesKey(_strategyId, 1)] = _tokens;
    _strategyNames[_strategyName] = _strategyId;

    emit StrategyCreated(_strategyId, _newStrategy, _tokens);
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
