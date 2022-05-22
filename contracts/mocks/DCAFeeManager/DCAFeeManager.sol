// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAFeeManager/DCAFeeManager.sol';

contract DCAFeeManagerMock is DCAFeeManager {
  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    address _governor
  ) DCAFeeManager(_hub, _wToken, _governor) {}

  function setPosition(
    address _from,
    address _to,
    uint256 _positionId
  ) external {
    positions[getPositionKey(_from, _to)] = _positionId;
  }
}
