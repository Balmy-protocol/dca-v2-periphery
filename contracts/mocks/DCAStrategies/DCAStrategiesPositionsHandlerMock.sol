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
    _tokenShares.push();
    for (uint256 i = 0; i < _tokens.length; i++) {
      _tokenShares[_tokenShares.length - 1].token = _tokens[i].token;
      _tokenShares[_tokenShares.length - 1].share = _tokens[i].share;
    }
  }

  function _getTokenShares(uint80 _strategyId, uint16 _version) internal view override returns (IDCAStrategies.ShareOfToken[] memory) {
    _strategyId; // shh
    _version; // shh
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
}
