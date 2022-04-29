// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubSwapper/DCAHubSwapperDustHandler.sol';
import './DCAHubSwapperParameters.sol';

contract DCAHubSwapperDustHandlerMock is DCAHubSwapperDustHandler, DCAHubSwapperParametersMock {
  constructor(address _governor) DCAHubSwapperParametersMock(IDCAHub(address(1)), IWrappedProtocolToken(address(1)), _governor) {}
}
