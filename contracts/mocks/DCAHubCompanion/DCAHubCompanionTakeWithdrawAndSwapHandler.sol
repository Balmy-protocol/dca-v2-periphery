// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionTakeSendAndSwapHandler.sol';

contract DCAHubCompanionTakeSendAndSwapHandlerMock is DCAHubCompanionTakeSendAndSwapHandler {
  constructor(address _swapperRegistry) SwapAdapter(_swapperRegistry) {}
}
