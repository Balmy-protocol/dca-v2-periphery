// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAHubCompanion.sol';
import '../utils/Governable.sol';

abstract contract DCAHubCompanionParameters is Governable, IDCAHubCompanionParameters {
  IDCAHub public immutable hub;
  IWrappedProtocolToken public immutable wToken;
  address public constant PROTOCOL_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    address _governor
  ) Governable(_governor) {
    if (address(_hub) == address(0) || address(_wToken) == address(0)) revert IDCAHubCompanion.ZeroAddress();
    hub = _hub;
    wToken = _wToken;
  }
}
