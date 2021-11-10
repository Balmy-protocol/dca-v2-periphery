// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionDustHandler.sol';

contract DCAHubCompanionDustHandlerMock is DCAHubCompanionDustHandler {
  constructor(address _governor) DCAHubCompanionDustHandler(_governor) {}
}
