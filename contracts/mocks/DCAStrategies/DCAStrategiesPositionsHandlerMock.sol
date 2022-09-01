// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAStrategies/DCAStrategies/DCAStrategiesPositionsHandler.sol';

contract DCAStrategiesPositionsHandlerMock is DCAStrategiesPositionsHandler {
  struct CreateCall {
    address owner;
    IDCAStrategies.PermissionSet[] permissionSets;
  }

  CreateCall[] private _createCalls;
  IDCAStrategies.ShareOfToken[] private _tokenShares;

  function getCreateCalls() external view returns (CreateCall[] memory) {
    return _createCalls;
  }

  function setTokenShares(IDCAStrategies.ShareOfToken[] calldata _tokens) external {
    for (uint256 i = 0; i < _tokens.length; i++) {
      _tokenShares.push(_tokens[i]);
    }
  }

  function _getTokenShares(uint80, uint16) internal view override returns (IDCAStrategies.ShareOfToken[] memory) {
    return _tokenShares;
  }

  function _create(address _owner, IDCAStrategies.PermissionSet[] calldata _permissions) internal override returns (uint256 _mintId) {
    _createCalls.push();
    _createCalls[_createCalls.length - 1].owner = _owner;
    for (uint256 i = 0; i < _permissions.length; i++) {
      _createCalls[_createCalls.length - 1].permissionSets.push(_permissions[i]);
    }
    return 1;
  }

  function _getTotal() internal pure override returns (uint16 _total) {
    return 100e2;
  }
}
