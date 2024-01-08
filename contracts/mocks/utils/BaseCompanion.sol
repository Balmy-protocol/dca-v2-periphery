// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.22;

import '../../utils/BaseCompanion.sol';

contract BaseCompanionMock is BaseCompanion {
  constructor(
    address _swapper,
    address _allowanceTarget,
    address _governor,
    IPermit2 _permit2
  ) BaseCompanion(_swapper, _allowanceTarget, _governor, _permit2) {}

  struct TakeFromMsgSenderCall {
    IERC20 token;
    uint256 amount;
  }

  struct SendBalanceOnContractToRecipientCall {
    address token;
    address recipient;
  }

  struct SendToRecipientCall {
    address token;
    uint256 amount;
    address recipient;
  }

  TakeFromMsgSenderCall[] internal _takeFromMsgSenderCalls;
  SendBalanceOnContractToRecipientCall[] internal _sendBalanceOnContractToRecipientCalls;
  SendToRecipientCall[] internal _sendToRecipientCalls;

  function takeFromMsgSenderCalls() external view returns (TakeFromMsgSenderCall[] memory) {
    return _takeFromMsgSenderCalls;
  }

  function sendBalanceOnContractToRecipientCalls() external view returns (SendBalanceOnContractToRecipientCall[] memory) {
    return _sendBalanceOnContractToRecipientCalls;
  }

  function sendToRecipientCalls() external view returns (SendToRecipientCall[] memory) {
    return _sendToRecipientCalls;
  }

  function _takeFromMsgSender(IERC20 _token, uint256 _amount) internal override {
    _takeFromMsgSenderCalls.push(TakeFromMsgSenderCall(_token, _amount));
    super._takeFromMsgSender(_token, _amount);
  }

  function _sendBalanceOnContractToRecipient(address _token, address _recipient) internal override {
    _sendBalanceOnContractToRecipientCalls.push(SendBalanceOnContractToRecipientCall(_token, _recipient));
    super._sendBalanceOnContractToRecipient(_token, _recipient);
  }

  function _sendToRecipient(
    address _token,
    uint256 _amount,
    address _recipient
  ) internal override {
    _sendToRecipientCalls.push(SendToRecipientCall(_token, _amount, _recipient));
    super._sendToRecipient(_token, _amount, _recipient);
  }
}
