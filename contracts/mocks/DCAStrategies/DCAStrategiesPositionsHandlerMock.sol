// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAStrategies/DCAStrategies/DCAStrategiesPositionsHandler.sol';

contract DCAStrategiesPositionsHandlerMock is DCAStrategiesPositionsHandler {
  struct CreateCall {
    address owner;
    IDCAStrategies.PermissionSet[] permissionSets;
  }

  struct ApproveHubCalls {
    address token;
    IDCAHub hub;
    uint256 amount;
  }

  CreateCall[] private _createCalls;
  IDCAStrategies.ShareOfToken[] private _tokenShares;
  ApproveHubCalls[] private _approveHubCalls;
  bool public hasPermission;

  function getCreateCalls() external view returns (CreateCall[] memory) {
    return _createCalls;
  }

  function getApproveHubCalls() external view returns (ApproveHubCalls[] memory) {
    return _approveHubCalls;
  }

  function setTokenShares(IDCAStrategies.ShareOfToken[] calldata _tokens) external {
    for (uint256 i = 0; i < _tokens.length; i++) {
      _tokenShares.push(_tokens[i]);
    }
  }

  function setUserPositions(uint256 _id, Position memory _positionToSet) external {
    _userPositions[_id] = _positionToSet;
  }

  function setWithdrawPermissions(bool _toSet) external {
    hasPermission = _toSet;
  }

  function _getTokenShares(uint80, uint16) internal view override returns (IDCAStrategies.ShareOfToken[] memory) {
    return _tokenShares;
  }

  function approveHub(
    address _token,
    IDCAHub _hub,
    uint256 _amount
  ) external {
    _approveHub(_token, _hub, _amount);
  }

  function _approveHub(
    address _token,
    IDCAHub _hub,
    uint256 _amount
  ) internal override {
    _approveHubCalls.push(ApproveHubCalls(_token, _hub, _amount));
    super._approveHub(_token, _hub, _amount);
  }

  function _create(address _owner, IDCAStrategies.PermissionSet[] calldata _permissions) internal override returns (uint256 _mintId) {
    _createCalls.push();
    _createCalls[_createCalls.length - 1].owner = _owner;
    for (uint256 i = 0; i < _permissions.length; i++) {
      _createCalls[_createCalls.length - 1].permissionSets.push(_permissions[i]);
    }
    return 1;
  }

  function _hasWithdrawPermission(uint256, address) internal view override returns (bool _hasPermission) {
    return hasPermission;
  }

  function _getTotalShares() internal pure override returns (uint16 _total) {
    return 100e2;
  }
}
