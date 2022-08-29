// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesManagementHandler is IDCAStrategiesManagementHandler {
  struct StrategyOwnerAndVersion {
    address owner;
    uint16 latestVersion;
  }
  /// @inheritdoc IDCAStrategiesManagementHandler
  mapping(uint80 => address) public strategiesPendingOwners;
  /// @inheritdoc IDCAStrategiesManagementHandler
  mapping(bytes32 => uint80) public strategyIdByName;
  /// @inheritdoc IDCAStrategiesManagementHandler
  uint80 public strategyCounter;
  uint16 internal constant _TOTAL = 100e2;
  /// @inheritdoc IDCAStrategiesManagementHandler
  // solhint-disable-next-line var-name-mixedcase
  uint8 public immutable MAX_TOKEN_SHARES;
  mapping(uint80 => StrategyOwnerAndVersion) internal _strategies;
  mapping(uint80 => bytes32) internal _strategyNameById;
  mapping(bytes32 => IDCAStrategies.ShareOfToken[]) internal _tokenShares;

  constructor(uint8 _maxTokenShares) {
    if (_maxTokenShares == 0) revert InvalidMaxTokenShares();
    MAX_TOKEN_SHARES = _maxTokenShares;
  }

  /// @inheritdoc IDCAStrategiesManagementHandler
  function getStrategy(uint80 _strategyId) external view returns (Strategy memory) {
    StrategyOwnerAndVersion memory _strategy = _strategies[_strategyId];
    IDCAStrategies.ShareOfToken[] memory _tokens = _tokenShares[_getStrategyAndVersionKey(_strategyId, _strategy.latestVersion)];
    return Strategy({owner: _strategy.owner, name: _strategyNameById[_strategyId], currentVersion: _strategy.latestVersion, tokens: _tokens});
  }

  /// @inheritdoc IDCAStrategiesManagementHandler
  function createStrategy(
    bytes32 _strategyName,
    IDCAStrategies.ShareOfToken[] memory _tokens,
    address _owner
  ) external returns (uint80 _strategyId) {
    if (_owner == address(0)) revert IDCAStrategies.ZeroAddress();
    if (strategyIdByName[_strategyName] != 0) revert NameAlreadyExists();
    _checkTokenSharesSanity(_tokens);

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
  function updateStrategyTokens(uint80 _strategyId, IDCAStrategies.ShareOfToken[] memory _tokens) external {
    StrategyOwnerAndVersion memory _strategy = _strategies[_strategyId];
    if (msg.sender != _strategy.owner) revert OnlyStratOwner();
    _checkTokenSharesSanity(_tokens);

    uint16 _newVersion = _strategy.latestVersion + 1;
    _strategies[_strategyId].latestVersion = _newVersion;

    bytes32 _key = _getStrategyAndVersionKey(_strategyId, _newVersion);
    for (uint256 i = 0; i < _tokens.length; ) {
      _tokenShares[_key].push(_tokens[i]);
      unchecked {
        i++;
      }
    }

    emit StrategyTokensUpdated(_strategyId, _tokens);
  }

  /// @inheritdoc IDCAStrategiesManagementHandler
  function updateStrategyName(uint80 _strategyId, bytes32 _newStrategyName) external {
    if (msg.sender != _strategies[_strategyId].owner) revert OnlyStratOwner();
    if (strategyIdByName[_newStrategyName] != 0) revert NameAlreadyExists();

    delete strategyIdByName[_strategyNameById[_strategyId]];
    strategyIdByName[_newStrategyName] = _strategyId;
    _strategyNameById[_strategyId] = _newStrategyName;

    emit StrategyNameUpdated(_strategyId, _newStrategyName);
  }

  /// @inheritdoc IDCAStrategiesManagementHandler
  function transferStrategyOwnership(uint80 _strategyId, address _newOwner) external {
    if (msg.sender != _strategies[_strategyId].owner) revert OnlyStratOwner();

    strategiesPendingOwners[_strategyId] = _newOwner;

    emit TransferOwnershipInitiated(_strategyId, _newOwner);
  }

  /// @inheritdoc IDCAStrategiesManagementHandler
  function acceptStrategyOwnership(uint80 _strategyId) external {
    if (msg.sender != strategiesPendingOwners[_strategyId]) revert OnlyPendingOwner();

    delete strategiesPendingOwners[_strategyId];
    _strategies[_strategyId].owner = msg.sender;

    emit TransferOwnershipAccepted(_strategyId, msg.sender);
  }

  /// @inheritdoc IDCAStrategiesManagementHandler
  function cancelStrategyOwnershipTransfer(uint80 _strategyId) external {
    if (msg.sender != _strategies[_strategyId].owner) revert OnlyStratOwner();

    delete strategiesPendingOwners[_strategyId];

    emit TransferOwnershipCancelled(_strategyId);
  }

  function _checkTokenSharesSanity(IDCAStrategies.ShareOfToken[] memory _tokens) internal view {
    uint256 _length = _tokens.length;
    if (_length <= 1) revert InvalidLength(); // need to have more than one item
    if (_length > MAX_TOKEN_SHARES) revert TokenSharesExceedAmount();

    uint256 _shares = 0;
    for (uint256 i = 0; i < _length; i++) {
      uint16 _share = _tokens[i].share;
      if (_share == 0) revert ShareIsEmpty(); // need to be more than 0%
      _shares += _share;
    }

    if (_shares != _TOTAL) revert InvalidTokenShares(); // need to be equal 100%
  }

  function _getStrategyAndVersionKey(uint256 _strategyId, uint16 _version) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_strategyId, _version));
  }
}
