// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.22;

import '../../libraries/ModifyPositionWithRate.sol';

contract ModifyPositionWithRateMock {
  function modifyRate(
    IDCAHub _hub,
    uint256 _positionId,
    uint120 _newRate
  ) external {
    ModifyPositionWithRate.modifyRate(_hub, _positionId, _newRate);
  }

  function modifySwaps(
    IDCAHub _hub,
    uint256 _positionId,
    uint32 _newSwaps
  ) external {
    ModifyPositionWithRate.modifySwaps(_hub, _positionId, _newSwaps);
  }

  function modifyRateAndSwaps(
    IDCAHub _hub,
    uint256 _positionId,
    uint120 _newRate,
    uint32 _newSwaps
  ) external {
    ModifyPositionWithRate.modifyRateAndSwaps(_hub, _positionId, _newRate, _newSwaps);
  }
}
