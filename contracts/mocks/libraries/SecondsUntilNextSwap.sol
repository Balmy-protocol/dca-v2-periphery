// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.22;

import '../../libraries/SecondsUntilNextSwap.sol';

contract SecondsUntilNextSwapMock {
  function secondsUntilNextSwap(
    IDCAHub _hub,
    address _tokenA,
    address _tokenB,
    bool _calculatePrivilegedAvailability
  ) external view returns (uint256) {
    return SecondsUntilNextSwap.secondsUntilNextSwap(_hub, _tokenA, _tokenB, _calculatePrivilegedAvailability);
  }

  function secondsUntilNextSwap(
    IDCAHub _hub,
    Pair[] calldata _pairs,
    bool _calculatePrivilegedAvailability
  ) external view returns (uint256[] memory) {
    return SecondsUntilNextSwap.secondsUntilNextSwap(_hub, _pairs, _calculatePrivilegedAvailability);
  }
}
