// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './DCAHubCompanionParameters.sol';

abstract contract DCAHubCompanionETHPositionHandler is DCAHubCompanionParameters, IDCAHubCompanionETHPositionHandler {
  // solhint-disable-next-line private-vars-leading-underscore
  address private constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  function depositUsingETH(
    address _to,
    uint256 _amount,
    uint32 _amountOfSwaps,
    uint32 _swapInterval,
    address _owner,
    IDCAPermissionManager.PermissionSet[] calldata _permissions
  ) external payable returns (uint256 _positionId) {
    // Convert ETH to WETH
    WETH.deposit{value: _amount}();

    // Approve token for the hub
    WETH.approve(address(hub), _amount);

    // Create position
    _positionId = hub.deposit(address(WETH), _to, _amount, _amountOfSwaps, _swapInterval, _owner, _addPermissionsThisContract(_permissions));

    emit ConvertedDeposit(_positionId, ETH, address(WETH));
  }

  function _addPermissionsThisContract(IDCAPermissionManager.PermissionSet[] calldata _permissionSets)
    internal
    view
    returns (IDCAPermissionManager.PermissionSet[] memory _newPermissionSets)
  {
    // Copy permission sets to the new array
    _newPermissionSets = new IDCAPermissionManager.PermissionSet[](_permissionSets.length + 1);
    for (uint256 i; i < _permissionSets.length; i++) {
      _newPermissionSets[i] = _permissionSets[i];
    }

    // Create new list that contains all permissions
    IDCAPermissionManager.Permission[] memory _permissions = new IDCAPermissionManager.Permission[](4);
    for (uint256 i; i < 4; i++) {
      _permissions[i] = IDCAPermissionManager.Permission(i);
    }

    // Assign all permisisons to this contract
    _newPermissionSets[_permissionSets.length] = IDCAPermissionManager.PermissionSet({operator: address(this), permissions: _permissions});
  }
}
