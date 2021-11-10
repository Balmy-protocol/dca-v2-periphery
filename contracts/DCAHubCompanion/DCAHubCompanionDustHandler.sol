// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAHubCompanion.sol';
import '../utils/CollectableDust.sol';
import '../utils/Governable.sol';

abstract contract DCAHubCompanionDustHandler is CollectableDust, Governable, IDCAHubCompanionDustHandler {
  constructor(address _governor) Governable(_governor) {}

  function sendDust(
    address _to,
    address _token,
    uint256 _amount
  ) external onlyGovernor {
    _sendDust(_to, _token, _amount);
  }
}
