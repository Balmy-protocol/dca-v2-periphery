// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAStrategies/DCAStrategies/DCAStrategiesPermissionsHandler.sol';

contract DCAStrategiesPermissionsHandlerMock is DCAStrategiesPermissionsHandler {
  uint256 private _blockNumber;

  constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {}

  function _getBlockNumber() internal view override returns (uint256) {
    if (_blockNumber > 0) {
      return _blockNumber;
    } else {
      return super._getBlockNumber();
    }
  }

  function getBlockNumber() external view returns (uint256) {
    return _getBlockNumber();
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
    _setPermissions(_id, _permissions);
  }
}
