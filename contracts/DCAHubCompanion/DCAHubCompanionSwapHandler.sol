// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './utils/DeadlineValidation.sol';
import './DCAHubCompanionParameters.sol';

abstract contract DCAHubCompanionSwapHandler is DeadlineValidation, DCAHubCompanionParameters, IDCAHubCompanionSwapHandler {
  enum SwapPlan {
    NONE,
    SWAP_FOR_CALLER
  }

  struct SwapData {
    SwapPlan plan;
    bytes data;
  }

  using SafeERC20 for IERC20;

  function swapForCaller(
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    uint256[] calldata _minimumOutput,
    uint256[] calldata _maximumInput,
    address _recipient,
    uint256 _deadline
  ) external payable checkDeadline(_deadline) returns (IDCAHub.SwapInfo memory _swapInfo) {
    uint256[] memory _borrow = new uint256[](_tokens.length);
    _swapInfo = hub.swap(
      _tokens,
      _pairsToSwap,
      _recipient,
      address(this),
      _borrow,
      abi.encode(SwapData({plan: SwapPlan.SWAP_FOR_CALLER, data: abi.encode(CallbackDataCaller({caller: msg.sender, msgValue: msg.value}))}))
    );

    for (uint256 i; i < _swapInfo.tokens.length; i++) {
      IDCAHub.TokenInSwap memory _tokenInSwap = _swapInfo.tokens[i];
      if (_tokenInSwap.reward < _minimumOutput[i]) {
        revert RewardNotEnough();
      } else if (_tokenInSwap.toProvide > _maximumInput[i]) {
        revert ToProvideIsTooMuch();
      }
    }
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubSwapCall(
    address _sender,
    IDCAHub.TokenInSwap[] calldata _tokens,
    uint256[] calldata,
    bytes calldata _data
  ) external {
    if (msg.sender != address(hub)) revert CallbackNotCalledByHub();
    if (_sender != address(this)) revert SwapNotInitiatedByCompanion();

    SwapData memory _swapData = abi.decode(_data, (SwapData));
    if (_swapData.plan == SwapPlan.SWAP_FOR_CALLER) {
      _handleSwapForCallerCallback(_tokens, _swapData.data);
    } else {
      revert UnexpectedSwapPlan();
    }
  }

  struct CallbackDataCaller {
    address caller;
    uint256 msgValue;
  }

  function _handleSwapForCallerCallback(IDCAHub.TokenInSwap[] calldata _tokens, bytes memory _data) internal {
    CallbackDataCaller memory _callbackData = abi.decode(_data, (CallbackDataCaller));
    address _hub = address(hub);
    for (uint256 i; i < _tokens.length; i++) {
      IDCAHub.TokenInSwap memory _token = _tokens[i];
      if (_token.toProvide > 0) {
        if (_token.token == address(wToken) && _callbackData.msgValue != 0) {
          // Wrap necessary
          wToken.deposit{value: _token.toProvide}();

          // Return any extra tokens to the original caller
          if (_callbackData.msgValue > _token.toProvide) {
            payable(_callbackData.caller).transfer(_callbackData.msgValue - _token.toProvide);
          }
        }
        IERC20(_token.token).safeTransferFrom(_callbackData.caller, _hub, _token.toProvide);
      }
    }
  }
}
