// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/swappers/solidity/contracts/extensions/RunSwap.sol';
import '../interfaces/IDCAHubCompanion.sol';

/// @dev All public functions are payable, so that they can be multicalled together with other payable functions when msg.value > 0
abstract contract DCAHubCompanionTakeSendAndSwapHandler is RunSwap, IDCAHubCompanionTakeSendAndSwapHandler {
  /// @inheritdoc IDCAHubCompanionTakeSendAndSwapHandler
  function sendToRecipient(
    address _token,
    uint256 _amount,
    address _recipient
  ) external payable {
    _sendToRecipient(_token, _amount, _recipient);
  }

  /// @inheritdoc IDCAHubCompanionTakeSendAndSwapHandler
  function takeFromCaller(IERC20 _token, uint256 _amount) external payable {
    _takeFromMsgSender(_token, _amount);
  }

  /// @inheritdoc IDCAHubCompanionTakeSendAndSwapHandler
  function sendBalanceOnContractToRecipient(address _token, address _recipient) external payable {
    _sendBalanceOnContractToRecipient(_token, _recipient);
  }
}
