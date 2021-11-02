// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './DCAHubCompanionParameters.sol';

abstract contract DCAHubCompanionWTokenPositionHandler is DCAHubCompanionParameters, IDCAHubCompanionWTokenPositionHandler {
  using SafeERC20 for IERC20;

  IDCAPermissionManager public immutable permissionManager;

  // solhint-disable-next-line private-vars-leading-underscore
  address private constant PROTOCOL_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor() {
    permissionManager = hub.permissionManager();
  }

  function depositUsingProtocolToken(
    address _from,
    address _to,
    uint256 _amount,
    uint32 _amountOfSwaps,
    uint32 _swapInterval,
    address _owner,
    IDCAPermissionManager.PermissionSet[] calldata _permissions
  ) external payable returns (uint256 _positionId) {
    if ((_from == PROTOCOL_TOKEN) == (_to == PROTOCOL_TOKEN)) revert InvalidTokens();

    address _convertedFrom = _from;
    address _convertedTo = _to;
    if (_from == PROTOCOL_TOKEN) {
      _wrapAndApprove(_amount);
      _convertedFrom = address(wToken);
    } else {
      IERC20(_from).safeTransferFrom(msg.sender, address(this), _amount);
      IERC20(_from).approve(address(hub), _amount);
      _convertedTo = address(wToken);
    }

    // Create position
    _positionId = hub.deposit(
      _convertedFrom,
      _convertedTo,
      _amount,
      _amountOfSwaps,
      _swapInterval,
      _owner,
      _addPermissionsToThisContract(_permissions)
    );

    emit ConvertedDeposit(_positionId, _from, _convertedFrom, _to, _convertedTo);
  }

  function withdrawSwappedUsingProtocolToken(uint256 _positionId, address payable _recipient) external returns (uint256 _swapped) {
    if (!permissionManager.hasPermission(_positionId, msg.sender, IDCAPermissionManager.Permission.WITHDRAW)) revert UnauthorizedCaller();
    _swapped = hub.withdrawSwapped(_positionId, address(this));
    _unwrapAndSend(_swapped, _recipient);
  }

  function withdrawSwappedManyUsingProtocolToken(uint256[] calldata _positionIds, address payable _recipient)
    external
    returns (uint256 _swapped)
  {
    for (uint256 i; i < _positionIds.length; i++) {
      if (!permissionManager.hasPermission(_positionIds[i], msg.sender, IDCAPermissionManager.Permission.WITHDRAW)) revert UnauthorizedCaller();
    }
    IDCAHub.PositionSet[] memory _positionSets = new IDCAHub.PositionSet[](1);
    _positionSets[0].token = address(wToken);
    _positionSets[0].positionIds = _positionIds;
    uint256[] memory _withdrawn = hub.withdrawSwappedMany(_positionSets, address(this));
    _swapped = _withdrawn[0];
    _unwrapAndSend(_swapped, _recipient);
  }

  function increasePositionUsingProtocolToken(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps
  ) external payable {
    if (!permissionManager.hasPermission(_positionId, msg.sender, IDCAPermissionManager.Permission.INCREASE)) revert UnauthorizedCaller();
    _wrapAndApprove(_amount);
    hub.increasePosition(_positionId, _amount, _newSwaps);
  }

  function reducePositionUsingProtocolToken(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps,
    address payable _recipient
  ) external {
    if (!permissionManager.hasPermission(_positionId, msg.sender, IDCAPermissionManager.Permission.REDUCE)) revert UnauthorizedCaller();
    hub.reducePosition(_positionId, _amount, _newSwaps, address(this));
    _unwrapAndSend(_amount, _recipient);
  }

  function terminateUsingProtocolTokenAsFrom(
    uint256 _positionId,
    address payable _recipientUnswapped,
    address _recipientSwapped
  ) external returns (uint256 _unswapped, uint256 _swapped) {
    if (!permissionManager.hasPermission(_positionId, msg.sender, IDCAPermissionManager.Permission.TERMINATE)) revert UnauthorizedCaller();
    (_unswapped, _swapped) = hub.terminate(_positionId, address(this), _recipientSwapped);
    _unwrapAndSend(_unswapped, _recipientUnswapped);
  }

  function terminateUsingProtocolTokenAsTo(
    uint256 _positionId,
    address _recipientUnswapped,
    address payable _recipientSwapped
  ) external returns (uint256 _unswapped, uint256 _swapped) {
    if (!permissionManager.hasPermission(_positionId, msg.sender, IDCAPermissionManager.Permission.TERMINATE)) revert UnauthorizedCaller();
    (_unswapped, _swapped) = hub.terminate(_positionId, _recipientUnswapped, address(this));
    _unwrapAndSend(_swapped, _recipientSwapped);
  }

  function _unwrapAndSend(uint256 _amount, address payable _recipient) internal {
    // Unwrap wToken
    wToken.withdraw(_amount);

    // Send protocol token to recipient
    _recipient.transfer(_amount);
  }

  function _wrapAndApprove(uint256 _amount) internal {
    if (msg.value != _amount) revert InvalidAmountOfProtocolTokenReceived();

    // Convert to wToken
    wToken.deposit{value: _amount}();

    // Approve token for the hub
    wToken.approve(address(hub), _amount); // TODO: Consider approving max possible on deployment to make calls cheaper
  }

  function _addPermissionsToThisContract(IDCAPermissionManager.PermissionSet[] calldata _permissionSets)
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
