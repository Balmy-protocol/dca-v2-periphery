// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionTakeWithdrawAndSwapHandler.sol';

contract DCAHubCompanionTakeWithdrawAndSwapHandlerMock is DCAHubCompanionTakeWithdrawAndSwapHandler {
  constructor(address _swapperRegistry) SwapAdapter(_swapperRegistry) {}
}
