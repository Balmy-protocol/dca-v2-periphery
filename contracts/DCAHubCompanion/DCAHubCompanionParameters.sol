// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAHubCompanion.sol';

abstract contract DCAHubCompanionParameters is IDCAHubCompanionParameters {
  IDCAHub public immutable hub;
  // solhint-disable-next-line var-name-mixedcase
  IWETH9 public immutable WETH;

  // solhint-disable-next-line var-name-mixedcase
  constructor(IDCAHub _hub, IWETH9 _WETH) {
    if (address(_hub) == address(0) || address(_WETH) == address(0)) revert IDCAHubCompanion.ZeroAddress();
    hub = _hub;
    WETH = _WETH;
  }
}
