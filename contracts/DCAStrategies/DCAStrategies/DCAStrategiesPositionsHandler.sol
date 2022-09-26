// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesPositionsHandler is IDCAStrategiesPositionsHandler {
  using SafeERC20 for IERC20;

  enum Action {
    NOTHING,
    REDUCE,
    INCREASE,
    DEPOSIT
  }

  struct Task {
    Action action;
    uint256 positionId;
    uint256 amount;
  }

  struct Data {
    uint8 currentPositionsIndex;
    uint8 newPositionsIndex;
    uint256 totalRemaining;
    uint256 amountSpent;
    IDCAHub.UserPosition positionMetadata;
  }

  mapping(uint256 => Position) internal _userPositions;

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function userPosition(uint256 _positionId) external view returns (Position memory _position) {
    return _userPositions[_positionId];
  }

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
      _parameters.permissions,
      _positions
    );

    return _positionId;
  }

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function withdrawSwapped(uint256 _positionId, address _recipient)
    external
    onlyWithPermission(_positionId, IDCAStrategies.Permission.WITHDRAW)
    returns (TokenAmounts[] memory _tokenAmounts)
  {
    Position memory _position = _userPositions[_positionId];
    IDCAHub _hub = IDCAHub(_position.hub);
    _tokenAmounts = new TokenAmounts[](_position.positions.length);
    for (uint256 i = 0; i < _position.positions.length; ) {
      // TODO: Test how much cheaper it would be to not return the token (and avoid the call to `hub.userPosition)
      _tokenAmounts[i].amount = _hub.withdrawSwapped(_position.positions[i], _recipient);
      _tokenAmounts[i].token = address(_hub.userPosition(_position.positions[i]).to);

      unchecked {
        i++;
      }
    }

    emit Withdrew(msg.sender, _recipient, _positionId, _tokenAmounts);
  }

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function increasePosition(
    uint256 _positionId,
    address _fromToken,
    uint256 _amount,
    uint32 _newSwaps
  ) external onlyWithPermission(_positionId, IDCAStrategies.Permission.INCREASE) {
    Position memory _position = _userPositions[_positionId];
    IDCAStrategies.ShareOfToken[] memory _tokens = _getTokenShares(_position.strategyId, _position.strategyVersion);

    if (_amount > 0) {
      // extract money from user
      IERC20(_fromToken).safeTransferFrom(msg.sender, address(this), _amount);

      // approve hub (if needed)
      _approveHub(_fromToken, _position.hub, _amount);
    }

    uint16 _total = _getTotalShares();
    uint256 _amountSpent;
    for (uint256 i = 0; i < _position.positions.length; ) {
      uint256 _toIncrease = _calculateOptimalAmount(i == _position.positions.length - 1, _amount, _tokens[i].share, _total, _amountSpent);

      _position.hub.increasePosition(_position.positions[i], _toIncrease, _newSwaps);

      _amountSpent += _toIncrease;

      unchecked {
        i++;
      }
    }

    emit Increased(msg.sender, _positionId, _amount, _newSwaps);
  }

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function reducePosition(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps,
    address _recipient
  ) external onlyWithPermission(_positionId, IDCAStrategies.Permission.REDUCE) {
    Position memory _position = _userPositions[_positionId];
    IDCAStrategies.ShareOfToken[] memory _tokens = _getTokenShares(_position.strategyId, _position.strategyVersion);

    uint16 _total = _getTotalShares();
    uint256 _amountSpent;
    for (uint256 i = 0; i < _position.positions.length; ) {
      uint256 _toReduce = _calculateOptimalAmount(i == _position.positions.length - 1, _amount, _tokens[i].share, _total, _amountSpent);

      _position.hub.reducePosition(_position.positions[i], _toReduce, _newSwaps, _recipient);

      _amountSpent += _toReduce;

      unchecked {
        i++;
      }
    }

    emit Reduced(msg.sender, _positionId, _amount, _newSwaps, _recipient);
  }

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function terminate(
    uint256 _positionId,
    address _recipientUnswapped,
    address _recipientSwapped
  ) external onlyWithPermission(_positionId, IDCAStrategies.Permission.TERMINATE) returns (uint256 _unswapped, TokenAmounts[] memory _swapped) {
    Position memory _position = _userPositions[_positionId];
    IDCAStrategies.ShareOfToken[] memory _tokens = _getTokenShares(_position.strategyId, _position.strategyVersion);

    _swapped = new TokenAmounts[](_position.positions.length);
    for (uint256 i = 0; i < _position.positions.length; ) {
      (uint256 __unswapped, uint256 __swapped) = _position.hub.terminate(_position.positions[i], _recipientUnswapped, _recipientSwapped);

      _swapped[i].amount = __swapped;
      _swapped[i].token = _tokens[i].token;

      _unswapped += __unswapped;

      unchecked {
        i++;
      }
    }

    emit Terminated(msg.sender, _recipientUnswapped, _recipientSwapped, _positionId, _unswapped, _swapped);
  }

  /// @inheritdoc IDCAStrategiesPositionsHandler
  function syncPositionToNewVersion(
    uint256 _positionId,
    uint16 _newVersion,
    address _recipientUnswapped,
    address _recipientSwapped,
    uint256 _totalAmount,
    uint32 _newAmountSwaps
  ) external onlyWithPermission(_positionId, IDCAStrategies.Permission.SYNC) {
    Position memory _position = _userPositions[_positionId];
    IDCAStrategies.ShareOfToken[] memory _newTokenShares = _getTokenShares(_position.strategyId, _newVersion);

    (Data memory _data, Task[] memory _tasks) = _syncBlock(_position, _totalAmount, _newTokenShares, _newAmountSwaps, _recipientSwapped);

    // If get to this place, then we just need to terminate existing positions
    while (_data.currentPositionsIndex < _position.positions.length) {
      (uint256 _unswapped, ) = _position.hub.terminate(_position.positions[_data.currentPositionsIndex], address(this), _recipientSwapped);
      _data.totalRemaining += _unswapped;
      _data.currentPositionsIndex++;
    }

    // If get to this place, then we just need to deposit
    while (_data.newPositionsIndex < _newTokenShares.length) {
      IDCAStrategies.ShareOfToken memory _newTokenShare = _newTokenShares[_data.newPositionsIndex];
      uint256 _correspondingToPosition = _calculateOptimalAmount(
        _data.newPositionsIndex == _newTokenShares.length - 1,
        _totalAmount,
        _newTokenShare.share,
        _getTotalShares(),
        _data.amountSpent
      );
      _tasks[_data.newPositionsIndex] = Task({action: Action.DEPOSIT, amount: _correspondingToPosition, positionId: 0});
      _data.amountSpent += _correspondingToPosition;
      _data.newPositionsIndex++;
    }

    // extract (increase) or send (reduce)
    if (_totalAmount > _data.totalRemaining) {
      IERC20(_data.positionMetadata.from).safeTransferFrom(msg.sender, address(this), _totalAmount - _data.totalRemaining);
    } else if (_totalAmount < _data.totalRemaining) {
      IERC20(_data.positionMetadata.from).safeTransfer(_recipientUnswapped, _data.totalRemaining - _totalAmount);
    }

    uint256 _auxPositionId = _positionId;

    // perform deposit and increase
    for (uint256 i = 0; i < _tasks.length; ) {
      Task memory _task = _tasks[i];

      if (_task.action == Action.INCREASE) {
        _position.hub.increasePosition(_task.positionId, _task.amount, _newAmountSwaps);
      } else if (_task.action == Action.DEPOSIT) {
        _task.positionId = _position.hub.deposit(
          address(_data.positionMetadata.from),
          _newTokenShares[i].token,
          _task.amount,
          _newAmountSwaps,
          _data.positionMetadata.swapInterval,
          address(this),
          new IDCAPermissionManager.PermissionSet[](0)
        );
      }

      if (i < _userPositions[_auxPositionId].positions.length) {
        if (_task.positionId != _userPositions[_auxPositionId].positions[i]) {
          _userPositions[_auxPositionId].positions[i] = _task.positionId;
        }
      } else {
        _userPositions[_auxPositionId].positions.push(_task.positionId);
      }

      unchecked {
        i++;
      }
    }

    for (uint256 i = _tasks.length; i < _position.positions.length; ) {
      _userPositions[_positionId].positions.pop();

      unchecked {
        i++;
      }
    }

    emit Synced(msg.sender, _positionId, _newVersion, _recipientUnswapped, _recipientSwapped, _totalAmount, _newAmountSwaps);
  }

  function _getTokenShares(uint80 _strategyId, uint16 _version) internal virtual returns (IDCAStrategies.ShareOfToken[] memory) {}

  function _create(address _owner, IDCAStrategies.PermissionSet[] calldata _permissions) internal virtual returns (uint256 _mintId) {}

  function _getTotalShares() internal pure virtual returns (uint16 _total) {}

  function _hasPermission(
    uint256 _id,
    address _account,
    IDCAStrategies.Permission _permission
  ) internal view virtual returns (bool _result) {}

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
    returns (uint256[] memory _positions)
  {
    uint16 _total = _getTotalShares();
    uint256 _amountSpent;
    _positions = new uint256[](_tokens.length);

    for (uint256 i = 0; i < _tokens.length; ) {
      IDCAStrategies.ShareOfToken memory _token = _tokens[i];
      uint256 _toDeposit = _calculateOptimalAmount(i == _tokens.length - 1, _parameters.amount, _token.share, _total, _amountSpent);

      _positions[i] = _parameters.hub.deposit(
        _parameters.from,
        _token.token,
        _toDeposit,
        _parameters.amountOfSwaps,
        _parameters.swapInterval,
        address(this),
        new IDCAPermissionManager.PermissionSet[](0)
      );

      _amountSpent += _toDeposit;

      unchecked {
        i++;
      }
    }
  }

  function _calculateOptimalAmount(
    bool _isLastOne,
    uint256 _amount,
    uint256 _share,
    uint256 _total,
    uint256 _amountSpent
  ) internal pure returns (uint256 _optimal) {
    if (_amount == 0) return 0;
    // if isn't the last one, assign the share of amount. If it's the last one, assign the leftover
    return !_isLastOne ? (_amount * _share) / _total : _amount - _amountSpent;
  }

  function _syncBlock(
    Position memory _position,
    uint256 _totalAmount,
    IDCAStrategies.ShareOfToken[] memory _newTokenShares,
    uint32 _newAmountSwaps,
    address _recipientSwapped
  ) internal returns (Data memory _data, Task[] memory _tasks) {
    // _currentPositionsIndex -  old positions index
    // _newPositionsIndex -  new positions index
    // _totalRemaining - cash. The amount of money ready to use. (Used to know if need to send whats left or request whats missing)
    _tasks = new Task[](_newTokenShares.length); // an array containing required tasks

    // will iterate while arrays are not finished
    while (_data.currentPositionsIndex < _position.positions.length && _data.newPositionsIndex < _newTokenShares.length) {
      uint256 _currentPositionId = _position.positions[_data.currentPositionsIndex];
      IDCAStrategies.ShareOfToken memory _newTokenShare = _newTokenShares[_data.newPositionsIndex];
      IDCAHub.UserPosition memory _userPosition = _position.hub.userPosition(_currentPositionId);

      if (address(_data.positionMetadata.from) == address(0)) {
        _data.positionMetadata = _userPosition;
      }

      uint256 _correspondingToPosition = _calculateOptimalAmount(
        _data.newPositionsIndex == _newTokenShares.length - 1,
        _totalAmount,
        _newTokenShare.share,
        _getTotalShares(),
        _data.amountSpent
      );

      if (address(_userPosition.to) == _newTokenShare.token) {
        // same token. Need to update position
        if (_userPosition.remaining > _correspondingToPosition) {
          // reduce
          _position.hub.reducePosition(_currentPositionId, _userPosition.remaining - _correspondingToPosition, _newAmountSwaps, address(this));
          _tasks[_data.newPositionsIndex] = Task({action: Action.REDUCE, positionId: _currentPositionId, amount: 0});
        } else if (_userPosition.remaining < _correspondingToPosition) {
          // increase
          _tasks[_data.newPositionsIndex] = Task({
            action: Action.INCREASE,
            positionId: _currentPositionId,
            amount: _correspondingToPosition - _userPosition.remaining
          });
        } else {
          // do nothing
          _tasks[_data.newPositionsIndex] = Task({action: Action.NOTHING, positionId: _currentPositionId, amount: 0});
        }
        _data.totalRemaining += _userPosition.remaining;
        _data.newPositionsIndex++;
        _data.currentPositionsIndex++;
        _data.amountSpent += _correspondingToPosition;
      } else if (_newTokenShare.token > address(_userPosition.to)) {
        // then position needs to be deleted
        _position.hub.terminate(_currentPositionId, address(this), _recipientSwapped);
        _data.totalRemaining += _userPosition.remaining;
        _data.currentPositionsIndex++;
      } else {
        // then just create a new position
        _tasks[_data.newPositionsIndex] = Task({action: Action.DEPOSIT, positionId: 0, amount: _correspondingToPosition});
        _data.newPositionsIndex++;
        _data.amountSpent += _correspondingToPosition;
      }
    }
  }

  modifier onlyWithPermission(uint256 _positionId, IDCAStrategies.Permission _permission) {
    if (!_hasPermission(_positionId, msg.sender, _permission)) revert NoPermissions();
    _;
  }
}