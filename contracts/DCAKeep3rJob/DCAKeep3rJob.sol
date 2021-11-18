// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAKeep3rJob.sol';
import '../utils/Governable.sol';

contract DCAKeep3rJob is Governable, IDCAKeep3rJob {
  IDCAHubCompanion public immutable companion;

  constructor(IDCAHubCompanion _companion, address _governor) Governable(_governor) {
    if (address(_companion) == address(0)) revert ZeroAddress();
    companion = _companion;
  }
}
