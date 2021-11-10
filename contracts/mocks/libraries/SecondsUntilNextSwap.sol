// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../libraries/SecondsUntilNextSwap.sol';

contract SecondsUntilNextSwapMock {
  function secondsUntilNextSwap(
    IDCAHub _hub,
    address _tokenA,
    address _tokenB
  ) external view returns (uint256) {
    return SecondsUntilNextSwap.secondsUntilNextSwap(_hub, _tokenA, _tokenB);
  }

  function secondsUntilNextSwap(IDCAHub _hub, Pair[] calldata _pairs) external view returns (uint256[] memory) {
    return SecondsUntilNextSwap.secondsUntilNextSwap(_hub, _pairs);
  }
}
