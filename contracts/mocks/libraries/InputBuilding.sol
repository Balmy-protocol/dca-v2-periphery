// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../libraries/InputBuilding.sol';

contract InputBuildingMock {
  function buildGetNextSwapInfoInput(Pair[] calldata _pairs)
    external
    pure
    returns (address[] memory _tokens, IDCAHub.PairIndexes[] memory _pairsToSwap)
  {
    return InputBuilding.buildGetNextSwapInfoInput(_pairs);
  }

  function buildSwapInput(Pair[] calldata _pairs, IDCAHub.AmountOfToken[] memory _toBorrow)
    external
    pure
    returns (
      address[] memory _tokens,
      IDCAHub.PairIndexes[] memory _pairsToSwap,
      uint256[] memory _borrow
    )
  {
    return InputBuilding.buildSwapInput(_pairs, _toBorrow);
  }
}
