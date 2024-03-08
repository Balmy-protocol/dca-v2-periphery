// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.22;

import '../../DCAFeeManager/DCAFeeManager.sol';

contract DCAFeeManagerMock is DCAFeeManager {
  struct SendToRecipientCall {
    address token;
    uint256 amount;
    address recipient;
  }

  struct SendBalanceOnContractToRecipientCall {
    address token;
    address recipient;
  }

  SendToRecipientCall[] internal _sendToRecipientCalls;
  SendBalanceOnContractToRecipientCall[] internal _sendBalanceOnContractToRecipientCalls;
  RevokeAction[][] internal _revokeCalls;

  constructor(address _superAdmin, address[] memory _initialAdmins) DCAFeeManager(_superAdmin, _initialAdmins) {}

  function sendBalanceOnContractToRecipientCalls() external view returns (SendBalanceOnContractToRecipientCall[] memory) {
    return _sendBalanceOnContractToRecipientCalls;
  }

  function sendToRecipientCalls() external view returns (SendToRecipientCall[] memory) {
    return _sendToRecipientCalls;
  }

  function revokeAllowancesCalls() external view returns (RevokeAction[][] memory) {
    return _revokeCalls;
  }

  function _sendBalanceOnContractToRecipient(address _token, address _recipient) internal override {
    _sendBalanceOnContractToRecipientCalls.push(SendBalanceOnContractToRecipientCall(_token, _recipient));
  }

  function _sendToRecipient(
    address _token,
    uint256 _amount,
    address _recipient
  ) internal override {
    _sendToRecipientCalls.push(SendToRecipientCall(_token, _amount, _recipient));
  }

  function _revokeAllowances(RevokeAction[] calldata _revokeActions) internal override {
    _revokeCalls.push();
    uint256 _currentCall = _revokeCalls.length - 1;
    for (uint256 i; i < _revokeActions.length; i++) {
      _revokeCalls[_currentCall].push(_revokeActions[i]);
    }
  }
}
