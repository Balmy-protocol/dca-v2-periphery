// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesPositionsHandler is IDCAStrategiesPositionsHandler {
  using SafeERC20 for IERC20;

  mapping(uint256 => Position) internal _userPositions;

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function deposit(IDCAStrategies.DepositParams calldata _parameters) external returns (uint256) {
    // get tokens data
    IDCAStrategies.ShareOfToken[] memory _tokens = _getTokenShares(_parameters.strategyId, _parameters.version);
    if (_tokens.length == 0) revert InvalidStrategy();

    // extract money from user
    IERC20(_parameters.from).safeTransferFrom(msg.sender, address(this), _parameters.amount);

    // approve hub (if needed)
    _approveHub(_parameters.from, _parameters.hub, _parameters.amount);

    // deposit in loop
    uint256[] memory _positions = _depositLoop(_parameters, _tokens);

    // mint NFT
    uint256 _positionId = _create(_parameters.owner, _parameters.permissions);

    // save position
    _userPositions[_positionId] = Position({
      hub: _parameters.hub,
      strategyId: _parameters.strategyId,
      strategyVersion: _parameters.version,
      positions: _positions
    });

    emit Deposited(
      msg.sender,
      _parameters.owner,
      _positionId,
      _parameters.from,
      _parameters.strategyId,
      _parameters.version,
      _parameters.swapInterval,
      _parameters.permissions
    );

    return _positionId;
  }

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function userPosition(uint256 _positionId) external view returns (Position memory _position) {
    return _userPositions[_positionId];
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

  function _create(address _owner, IDCAStrategies.PermissionSet[] calldata _permissions) internal virtual returns (uint256 _mintId) {}

  function _getTotalShares() internal pure virtual returns (uint16 _total) {}

  function _approveHub(
    address _token,
    IDCAHub _hub,
    uint256 _amount
  ) internal virtual {
    uint256 _allowance = IERC20(_token).allowance(address(this), address(_hub));
    if (_allowance < _amount) {
      if (_allowance > 0) {
        IERC20(_token).approve(address(_hub), 0); // We do this because some tokens (like USDT) fail if we don't
      }
      IERC20(_token).approve(address(_hub), type(uint256).max);
    }
  }

  function _depositLoop(IDCAStrategies.DepositParams calldata _parameters, IDCAStrategies.ShareOfToken[] memory _tokens)
    internal
    returns (uint256[] memory)
  {
    uint16 _total = _getTotalShares();
    uint256 _amountSpent;
    uint256[] memory _positions = new uint256[](_tokens.length);

    for (uint256 i = 0; i < _tokens.length; ) {
      IDCAStrategies.ShareOfToken memory _token = _tokens[i];
      uint256 _toDeposit = i < _tokens.length - 1 ? (_parameters.amount * _token.share) / _total : _parameters.amount - _amountSpent;

      IDCAPermissionManager.PermissionSet[] memory _permissions = new IDCAPermissionManager.PermissionSet[](0);
      _positions[i] = _parameters.hub.deposit(
        _parameters.from,
        _token.token,
        _toDeposit,
        _parameters.amountOfSwaps,
        _parameters.swapInterval,
        address(this),
        _permissions
      );

      _amountSpent += _toDeposit;

      unchecked {
        i++;
      }
    }

    return _positions;
  }
}
