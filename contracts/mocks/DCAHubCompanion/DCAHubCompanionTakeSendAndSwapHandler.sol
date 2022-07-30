// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHubCompanion/DCAHubCompanionTakeSendAndSwapHandler.sol';

contract DCAHubCompanionTakeSendAndSwapHandlerMock is DCAHubCompanionTakeSendAndSwapHandler {
  constructor(address _swapperRegistry) SwapAdapter(_swapperRegistry) {}

  struct TakeFromMsgSenderCall {
    IERC20 token;
    uint256 amount;
  }

  struct SendBalanceToRecipientCall {
    address token;
    address recipient;
  }

  TakeFromMsgSenderCall[] internal _takeFromMsgSenderCalls;
  SendBalanceToRecipientCall[] internal _sendBalanceToRecipientCalls;

  function takeFromMsgSenderCalls() external view returns (TakeFromMsgSenderCall[] memory) {
    return _takeFromMsgSenderCalls;
  }

  function sendBalanceToRecipientCalls() external view returns (SendBalanceToRecipientCall[] memory) {
    return _sendBalanceToRecipientCalls;
  }

  function _takeFromMsgSender(IERC20 _token, uint256 _amount) internal override {
    _takeFromMsgSenderCalls.push(TakeFromMsgSenderCall(_token, _amount));
    super._takeFromMsgSender(_token, _amount);
  }

  function _sendBalanceToRecipient(address _token, address _recipient) internal override {
    _sendBalanceToRecipientCalls.push(SendBalanceToRecipientCall(_token, _recipient));
    super._sendBalanceToRecipient(_token, _recipient);
  }
}
