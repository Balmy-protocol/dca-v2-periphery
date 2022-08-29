// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAStrategies/DCAStrategies/DCAStrategiesManagementHandler.sol';

contract DCAStrategiesManagementHandlerMock is DCAStrategiesManagementHandler {
  constructor(uint8 _maxTokenShares) DCAStrategiesManagementHandler(_maxTokenShares) {}
}
