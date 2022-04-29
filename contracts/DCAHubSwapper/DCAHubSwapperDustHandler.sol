// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './DCAHubSwapperParameters.sol';
import '../utils/CollectableDust.sol';

abstract contract DCAHubSwapperDustHandler is DCAHubSwapperParameters, CollectableDust, IDCAHubSwapperDustHandler {
  function sendDust(
    address _to,
    address _token,
    uint256 _amount
  ) external onlyGovernor {
    _sendDust(_to, _token, _amount);
  }
}
