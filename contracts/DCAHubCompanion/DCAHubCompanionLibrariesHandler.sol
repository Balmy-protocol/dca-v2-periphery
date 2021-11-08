// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../libraries/InputBuilding.sol';
import '../libraries/SecondsUntilNextSwap.sol';
import './DCAHubCompanionParameters.sol';

abstract contract DCAHubCompanionLibrariesHandler is DCAHubCompanionParameters, IDCAHubCompanionLibrariesHandler {
  function getNextSwapInfo(Pair[] calldata _pairs) external view returns (IDCAHub.SwapInfo memory) {
    (address[] memory _tokens, IDCAHub.PairIndexes[] memory _indexes) = InputBuilding.buildGetNextSwapInfoInput(_pairs);
    return hub.getNextSwapInfo(_tokens, _indexes);
  }

  function secondsUntilNextSwap(Pair[] calldata _pairs) external view returns (uint256[] memory) {
    return SecondsUntilNextSwap.secondsUntilNextSwap(hub, _pairs);
  }
}
