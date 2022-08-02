// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubSwapper/DCAHubSwapper.sol';

contract DCAHubSwapperMock is DCAHubSwapper {
  struct MaxApproveSpenderCall {
    IERC20 token;
    address spender;
    bool alreadyValidatedSpender;
    uint256 minAllowance;
  }

  MaxApproveSpenderCall[] internal _maxApproveSpenderCalls;

  constructor(
    address _swapperRegistry,
    address _admin,
    address[] memory _initialSwapExecutors
  ) DCAHubSwapper(_swapperRegistry, _admin, _initialSwapExecutors) {}

  function maxApproveSpenderCalls() external view returns (MaxApproveSpenderCall[] memory) {
    return _maxApproveSpenderCalls;
  }

  function _maxApproveSpenderIfNeeded(
    IERC20 _token,
    address _spender,
    bool _alreadyValidatedSpender,
    uint256 _minAllowance
  ) internal override {
    _maxApproveSpenderCalls.push(MaxApproveSpenderCall(_token, _spender, _alreadyValidatedSpender, _minAllowance));
    super._maxApproveSpenderIfNeeded(_token, _spender, _alreadyValidatedSpender, _minAllowance);
  }

  function isSwapExecutorEmpty() external view returns (bool) {
    return _swapExecutor == _NO_EXECUTOR;
  }

  function setSwapExecutor(address _newSwapExecutor) external {
    _swapExecutor = _newSwapExecutor;
  }
}
