// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionSwapHandler.sol';
import './DCAHubCompanionParameters.sol';

contract DCAHubCompanionSwapHandlerMock is DCAHubCompanionSwapHandler, DCAHubCompanionParametersMock {
  mapping(address => bytes[]) private _dexCalledWith;

  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    address _governor
  ) DCAHubCompanionParametersMock(_hub, _wToken, _governor) {}

  function _callDex(address _dex, bytes memory _data) internal override {
    _dexCalledWith[_dex].push(_data);
  }

  function callsToDex(address _dex) external view returns (bytes[] memory) {
    return _dexCalledWith[_dex];
  }
}
