// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAKeep3rJob.sol';
import '../utils/Governable.sol';

contract DCAKeep3rJob is Governable, IDCAKeep3rJob {
  IDCAHubCompanion public companion;
  mapping(address => bool) public canAddressSignWork;

  constructor(IDCAHubCompanion _companion, address _governor) Governable(_governor) {
    if (address(_companion) == address(0)) revert ZeroAddress();
    companion = _companion;
  }

  function setCompanion(IDCAHubCompanion _companion) external onlyGovernor {
    if (address(_companion) == address(0)) revert ZeroAddress();
    companion = _companion;
    emit NewCompanionSet(_companion);
  }

  function setIfAddressCanSign(address _address, bool _canSign) external onlyGovernor {
    if (_address == address(0)) revert ZeroAddress();
    canAddressSignWork[_address] = _canSign;
    emit ModifiedAddressPermission(_address, _canSign);
  }
}
