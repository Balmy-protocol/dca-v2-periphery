// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionDustHandler.sol';
import './DCAHubCompanionParameters.sol';

contract DCAHubCompanionDustHandlerMock is DCAHubCompanionDustHandler, DCAHubCompanionParametersMock {
  constructor(address _governor) DCAHubCompanionParametersMock(IDCAHub(address(1)), IWrappedProtocolToken(address(1)), _governor) {}
}
