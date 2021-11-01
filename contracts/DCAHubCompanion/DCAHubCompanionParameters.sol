// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAHubCompanion.sol';

abstract contract DCAHubCompanionParameters is IDCAHubCompanionParameters {
  IDCAHub public immutable hub;
  IWrappedProtocolToken public immutable wToken;

  // solhint-disable-next-line var-name-mixedcase
  constructor(IDCAHub _hub, IWrappedProtocolToken _wToken) {
    if (address(_hub) == address(0) || address(_wToken) == address(0)) revert IDCAHubCompanion.ZeroAddress();
    hub = _hub;
    wToken = _wToken;
  }
}
