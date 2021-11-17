// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAKeep3rJob/DCAKeep3rJob.sol';

contract DCAKeep3rJobMock is DCAKeep3rJob {
  bytes public companionCalledWith;

  constructor(IDCAHubCompanion _companion, address _governor) DCAKeep3rJob(_companion, _governor) {}

  function _callCompanion(bytes memory _data) internal override {
    companionCalledWith = _data;
  }
}
