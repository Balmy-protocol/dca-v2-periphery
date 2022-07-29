// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionHubProxyHandler.sol';

contract DCAHubCompanionHubProxyHandlerMock is DCAHubCompanionHubProxyHandler {
  struct DepositProxyCall {
    IDCAHub hub;
    address from;
    address to;
    uint256 amount;
    uint32 amountOfSwaps;
    uint32 swapInterval;
    address owner;
    IDCAPermissionManager.PermissionSet[] permissions;
    bytes miscellaneous;
  }

  DepositProxyCall[] private _depositProxyCalls;

  function depositProxyCalls() external view returns (DepositProxyCall[] memory) {
    return _depositProxyCalls;
  }

  function depositProxy(
    IDCAHub _hub,
    address _from,
    address _to,
    uint256 _amount,
    uint32 _amountOfSwaps,
    uint32 _swapInterval,
    address _owner,
    IDCAPermissionManager.PermissionSet[] calldata _permissions,
    bytes calldata _miscellaneous
  ) public payable override returns (uint256 _positionId) {
    _depositProxyCalls.push();
    DepositProxyCall storage _ref = _depositProxyCalls[_depositProxyCalls.length - 1];
    _ref.hub = _hub;
    _ref.from = _from;
    _ref.to = _to;
    _ref.amount = _amount;
    _ref.amountOfSwaps = _amountOfSwaps;
    _ref.swapInterval = _swapInterval;
    _ref.owner = _owner;
    _ref.miscellaneous = _miscellaneous;
    for (uint256 i = 0; i < _permissions.length; i++) {
      _ref.permissions.push(_permissions[i]);
    }
    return super.depositProxy(_hub, _from, _to, _amount, _amountOfSwaps, _swapInterval, _owner, _permissions, _miscellaneous);
  }
}
