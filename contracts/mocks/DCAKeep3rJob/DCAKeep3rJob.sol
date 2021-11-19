// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAKeep3rJob/DCAKeep3rJob.sol';

contract DCAKeep3rJobMock is DCAKeep3rJob {
  bytes public swapperCalledWith;

  constructor(
    address _swapper,
    IKeep3rJobs _keep3r,
    address _governor
  ) DCAKeep3rJob(_swapper, _keep3r, _governor) {}

  function _callSwapper(bytes memory _data) internal override {
    swapperCalledWith = _data;
  }
}
