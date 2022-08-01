// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/swappers/solidity/contracts/SwapAdapter.sol';
import '../interfaces/IDCAHubSwapper.sol';
import '../utils/Governable.sol';

abstract contract DCAHubSwapperParameters is Governable, IDCAHubSwapperParameters {
  /// @inheritdoc IDCAHubSwapperParameters
  IDCAHub public immutable hub;
  /// @inheritdoc IDCAHubSwapperParameters
  IWrappedProtocolToken public immutable wToken;
  /// @inheritdoc IDCAHubSwapperParameters
  mapping(address => bool) public tokenHasApprovalIssue;

  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    address _governor
  ) Governable(_governor) {
    if (address(_hub) == address(0) || address(_wToken) == address(0)) revert ISwapAdapter.ZeroAddress();
    hub = _hub;
    wToken = _wToken;
  }

  /// @inheritdoc IDCAHubSwapperParameters
  function setTokensWithApprovalIssues(address[] calldata _addresses, bool[] calldata _hasIssue) external onlyGovernor {
    if (_addresses.length != _hasIssue.length) revert InvalidTokenApprovalParams();
    for (uint256 i; i < _addresses.length; i++) {
      tokenHasApprovalIssue[_addresses[i]] = _hasIssue[i];
    }
    emit TokenWithApprovalIssuesSet(_addresses, _hasIssue);
  }
}
