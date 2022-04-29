// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubSwapper/DCAHubSwapperParameters.sol';

contract DCAHubSwapperParametersMock is DCAHubSwapperParameters {
  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    address _governor
  ) DCAHubSwapperParameters(_hub, _wToken, _governor) {}
}
