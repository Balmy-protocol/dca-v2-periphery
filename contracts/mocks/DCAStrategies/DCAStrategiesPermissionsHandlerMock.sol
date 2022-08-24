// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAStrategies/DCAStrategies/DCAStrategiesPermissionsHandler.sol';

contract DCAStrategiesPermissionsHandlerMock is DCAStrategiesPermissionsHandler {
  struct SetPermissionCall {
    uint256 tokenId;
    IDCAStrategies.PermissionSet[] permissionSets;
  }

  uint256 private _blockNumber;
  SetPermissionCall[] private _setPermissionsCalls;

  constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) EIP712(_name, '1') {}

  function getSetPermissionCall() external view returns (SetPermissionCall[] memory) {
    return _setPermissionsCalls;
  }

  function _getBlockNumber() internal view override returns (uint256) {
    if (_blockNumber > 0) {
      return _blockNumber;
    } else {
      return super._getBlockNumber();
    }
  }

  function setBlockNumber(uint256 __blockNumber) external {
    _blockNumber = __blockNumber;
  }

  function burnCounter() external view returns (uint256) {
    return _burnCounter;
  }

  function mintCounter() external view returns (uint256) {
    return _mintCounter;
  }

  function mint(address _owner, IDCAStrategies.PermissionSet[] calldata _permissions) external {
    _mint(_owner, _permissions);
  }

  function burn(uint256 _id) external {
    _burn(_id);
  }

  function setPermissions(uint256 _id, IDCAStrategies.PermissionSet[] calldata _permissions) external {
    super._setPermissions(_id, _permissions);
  }

  function _setPermissions(uint256 _id, IDCAStrategies.PermissionSet[] calldata _permissions) internal override {
    _setPermissionsCalls.push();
    _setPermissionsCalls[_setPermissionsCalls.length - 1].tokenId = _id;
    for (uint256 i = 0; i < _permissions.length; i++) {
      _setPermissionsCalls[_setPermissionsCalls.length - 1].permissionSets.push(_permissions[i]);
    }
    super._setPermissions(_id, _permissions);
  }
}
