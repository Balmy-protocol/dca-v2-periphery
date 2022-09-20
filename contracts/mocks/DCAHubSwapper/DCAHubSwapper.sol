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

  struct SendToRecipientCall {
    address token;
    uint256 amount;
    address recipient;
  }

  struct SendBalanceOnContractToRecipientCall {
    address token;
    address recipient;
  }

  MaxApproveSpenderCall[] internal _maxApproveSpenderCalls;
  SendToRecipientCall[] internal _sendToRecipientCalls;
  SendBalanceOnContractToRecipientCall[] internal _sendBalanceOnContractToRecipientCalls;
  RevokeAction[][] internal _revokeCalls;

  constructor(
    address _swapperRegistry,
    address _superAdmin,
    address[] memory _initialAdmins,
    address[] memory _initialSwapExecutors
  ) DCAHubSwapper(_swapperRegistry, _superAdmin, _initialAdmins, _initialSwapExecutors) {}

  function maxApproveSpenderCalls() external view returns (MaxApproveSpenderCall[] memory) {
    return _maxApproveSpenderCalls;
  }

  function sendBalanceOnContractToRecipientCalls() external view returns (SendBalanceOnContractToRecipientCall[] memory) {
    return _sendBalanceOnContractToRecipientCalls;
  }

  function sendToRecipientCalls() external view returns (SendToRecipientCall[] memory) {
    return _sendToRecipientCalls;
  }

  function revokeAllowancesCalls() external view returns (RevokeAction[][] memory) {
    return _revokeCalls;
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

  function _revokeAllowances(RevokeAction[] calldata _revokeActions) internal override {
    _revokeCalls.push();
    uint256 _currentCall = _revokeCalls.length - 1;
    for (uint256 i; i < _revokeActions.length; i++) {
      _revokeCalls[_currentCall].push(_revokeActions[i]);
    }
    super._revokeAllowances(_revokeActions);
  }

  function _sendToRecipient(
    address _token,
    uint256 _amount,
    address _recipient
  ) internal override {
    _sendToRecipientCalls.push(SendToRecipientCall(_token, _amount, _recipient));
    super._sendToRecipient(_token, _amount, _recipient);
  }

  function _sendBalanceOnContractToRecipient(address _token, address _recipient) internal override {
    _sendBalanceOnContractToRecipientCalls.push(SendBalanceOnContractToRecipientCall(_token, _recipient));
    super._sendBalanceOnContractToRecipient(_token, _recipient);
  }

  function isSwapExecutorEmpty() external view returns (bool) {
    return _swapExecutor == _NO_EXECUTOR;
  }

  function setSwapExecutor(address _newSwapExecutor) external {
    _swapExecutor = _newSwapExecutor;
  }
}
