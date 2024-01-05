// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7;

import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHub.sol';

/// @title Modify Position With Rate Library
/// @notice Provides functions modify a position by using rate/amount of swaps
library ModifyPositionWithRate {
  /// @notice Modifies the rate of a position. Could request more funds or return deposited funds
  /// depending on whether the new rate is greater than the previous one.
  /// @param _hub The address of the DCA Hub
  /// @param _positionId The position's id
  /// @param _newRate The new rate to set
  function modifyRate(
    IDCAHub _hub,
    uint256 _positionId,
    uint120 _newRate
  ) internal {
    IDCAHub.UserPosition memory _position = _hub.userPosition(_positionId);
    if (_newRate != _position.rate) {
      _modify(_hub, _positionId, _position, _newRate, _position.swapsLeft);
    }
  }

  /// @notice Modifies the amount of swaps of a position. Could request more funds or return
  /// deposited funds depending on whether the new amount of swaps is greater than the swaps left.
  /// @param _hub The address of the DCA Hub
  /// @param _positionId The position's id
  /// @param _newSwaps The new amount of swaps
  function modifySwaps(
    IDCAHub _hub,
    uint256 _positionId,
    uint32 _newSwaps
  ) internal {
    IDCAHub.UserPosition memory _position = _hub.userPosition(_positionId);
    if (_newSwaps != _position.swapsLeft) {
      _modify(_hub, _positionId, _position, _position.rate, _newSwaps);
    }
  }

  /// @notice Modifies both the rate and amount of swaps of a position. Could request more funds or return
  /// deposited funds depending on whether the new parameters require more or less than the current unswapped funds.
  /// @param _hub The address of the DCA Hub
  /// @param _positionId The position's id
  /// @param _newRate The new rate to set
  /// @param _newSwaps The new amount of swaps
  function modifyRateAndSwaps(
    IDCAHub _hub,
    uint256 _positionId,
    uint120 _newRate,
    uint32 _newSwaps
  ) internal {
    IDCAHub.UserPosition memory _position = _hub.userPosition(_positionId);
    if (_position.rate != _newRate && _newSwaps != _position.swapsLeft) {
      _modify(_hub, _positionId, _position, _newRate, _newSwaps);
    }
  }

  function _modify(
    IDCAHub _hub,
    uint256 _positionId,
    IDCAHub.UserPosition memory _position,
    uint120 _newRate,
    uint32 _newAmountOfSwaps
  ) private {
    uint256 _totalNecessary = uint256(_newRate) * _newAmountOfSwaps;
    if (_totalNecessary >= _position.remaining) {
      _hub.increasePosition(_positionId, _totalNecessary - _position.remaining, _newAmountOfSwaps);
    } else {
      _hub.reducePosition(_positionId, _position.remaining - _totalNecessary, _newAmountOfSwaps, msg.sender);
    }
  }
}
