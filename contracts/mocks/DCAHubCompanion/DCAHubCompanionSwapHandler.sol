// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionSwapHandler.sol';
import './DCAHubCompanionParameters.sol';

contract DCAHubCompanionSwapHandlerMock is DCAHubCompanionSwapHandler, DCAHubCompanionParametersMock {
  bytes[] public zrxCalledWith;

  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    // solhint-disable-next-line var-name-mixedcase
    address _ZRX,
    address _governor
  ) DCAHubCompanionParametersMock(_hub, _wToken, _governor) DCAHubCompanionSwapHandler(_ZRX) {}

  function _call0x(address, bytes memory _data) internal override {
    zrxCalledWith.push(_data);
  }
}
