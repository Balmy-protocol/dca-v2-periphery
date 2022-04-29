// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubSwapper/DCAHubSwapperSwapHandler.sol';
import './DCAHubSwapperParameters.sol';

contract DCAHubSwapperSwapHandlerMock is DCAHubSwapperSwapHandler, DCAHubSwapperParametersMock {
  mapping(address => bytes[]) private _dexCalledWith;

  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    address _governor
  ) DCAHubSwapperParametersMock(_hub, _wToken, _governor) {}

  function _callDex(address _dex, bytes memory _data) internal override {
    _dexCalledWith[_dex].push(_data);
  }

  function callsToDex(address _dex) external view returns (bytes[] memory) {
    return _dexCalledWith[_dex];
  }
}
