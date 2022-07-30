// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/swappers/solidity/contracts/SwapAdapter.sol';
import '../interfaces/IDCAHubCompanion.sol';

/// @dev All public functions are payable, so that they can be multicalled together with other payable functions when msg.value > 0
abstract contract DCAHubCompanionTakeSendAndSwapHandler is SwapAdapter, IDCAHubCompanionTakeSendAndSwapHandler {
  using SafeERC20 for IERC20;
  using Address for address payable;

  /// @inheritdoc IDCAHubCompanionTakeSendAndSwapHandler
  function sendToRecipient(
    address _token,
    uint256 _amount,
    address _recipient
  ) external payable {
    if (_token == PROTOCOL_TOKEN) {
      payable(_recipient).sendValue(_amount);
    } else {
      IERC20(_token).safeTransfer(_recipient, _amount);
    }
  }

  /// @inheritdoc IDCAHubCompanionTakeSendAndSwapHandler
  function takeFromCaller(IERC20 _token, uint256 _amount) external payable {
    _takeFromMsgSender(_token, _amount);
  }

  /// @inheritdoc IDCAHubCompanionTakeSendAndSwapHandler
  function sendBalanceOnContractToRecipient(address _token, address _recipient) external payable {
    _sendBalanceToRecipient(_token, _recipient);
  }
}
