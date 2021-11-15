// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './utils/DeadlineValidation.sol';
import './DCAHubCompanionParameters.sol';

abstract contract DCAHubCompanionSwapHandler is DeadlineValidation, DCAHubCompanionParameters, IDCAHubCompanionSwapHandler {
  enum SwapPlan {
    NONE,
    SWAP_FOR_CALLER,
    SWAP_WITH_0X
  }

  struct SwapData {
    SwapPlan plan;
    bytes data;
  }

  using SafeERC20 for IERC20;

  // solhint-disable-next-line var-name-mixedcase
  address public immutable ZRX;

  // solhint-disable-next-line var-name-mixedcase
  constructor(address _ZRX) {
    if (_ZRX == address(0)) revert IDCAHubCompanion.ZeroAddress();
    ZRX = _ZRX;
  }

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

  function swapWith0x(
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    bytes[] calldata _callsTo0x,
    address _leftoverRecipient,
    uint256 _deadline
  ) external returns (IDCAHub.SwapInfo memory) {
    return _swapWith0x(_tokens, _pairsToSwap, _callsTo0x, _leftoverRecipient, false, _deadline);
  }

  function swapWith0xAndShareLeftoverWithHub(
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    bytes[] calldata _callsTo0x,
    address _leftoverRecipient,
    uint256 _deadline
  ) external returns (IDCAHub.SwapInfo memory) {
    return _swapWith0x(_tokens, _pairsToSwap, _callsTo0x, _leftoverRecipient, true, _deadline);
  }

  function _swapWith0x(
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    bytes[] calldata _callsTo0x,
    address _leftoverRecipient,
    bool _sendToProvideLeftoverToHub,
    uint256 _deadline
  ) internal checkDeadline(_deadline) returns (IDCAHub.SwapInfo memory _swapInfo) {
    uint256[] memory _borrow = new uint256[](_tokens.length);
    bytes memory _swapData = abi.encode(
      CallbackData0x({leftoverRecipient: _leftoverRecipient, callsTo0x: _callsTo0x, sendToProvideLeftoverToHub: _sendToProvideLeftoverToHub})
    );
    _swapInfo = hub.swap(
      _tokens,
      _pairsToSwap,
      address(this),
      address(this),
      _borrow,
      abi.encode(SwapData({plan: SwapPlan.SWAP_WITH_0X, data: _swapData}))
    );
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
    } else if (_swapData.plan == SwapPlan.SWAP_WITH_0X) {
      _handleSwapWith0xCallback(_tokens, _swapData.data);
    } else {
      revert UnexpectedSwapPlan();
    }
  }

  struct CallbackData0x {
    address leftoverRecipient;
    bytes[] callsTo0x;
    // This flag is just a way to make transactions cheaper. If Mean Finance is executing the swap, then it's the same for us
    // if the leftover tokens go to the hub, or to another address. But, it's cheaper in terms of gas to send them to the hub
    bool sendToProvideLeftoverToHub;
  }

  function _handleSwapWith0xCallback(IDCAHub.TokenInSwap[] calldata _tokens, bytes memory _data) internal {
    CallbackData0x memory _callbackData = abi.decode(_data, (CallbackData0x));

    // Approve ZRX
    for (uint256 i; i < _tokens.length; i++) {
      IDCAHub.TokenInSwap memory _tokenInSwap = _tokens[i];
      if (_tokenInSwap.reward > 0) {
        IERC20(_tokenInSwap.token).approve(ZRX, _tokenInSwap.reward);
      }
    }

    // Execute swaps
    for (uint256 i; i < _callbackData.callsTo0x.length; i++) {
      _call0x(ZRX, _callbackData.callsTo0x[i]);
    }

    // Send remaining tokens to either hub, or leftover recipient
    for (uint256 i; i < _tokens.length; i++) {
      IERC20 _erc20 = IERC20(_tokens[i].token);
      uint256 _balance = _erc20.balanceOf(address(this));
      if (_balance > 0) {
        uint256 _toProvide = _tokens[i].toProvide;
        if (_toProvide > 0) {
          // If the hub expects some tokens in return, check if we want to send the whole balance or just the necessary amount
          if (_callbackData.sendToProvideLeftoverToHub || _balance == _toProvide) {
            // Send everything
            _erc20.safeTransfer(address(hub), _balance);
          } else {
            // Send necessary to hub, and the rest to the leftover recipient
            _erc20.safeTransfer(address(hub), _toProvide);
            _erc20.safeTransfer(_callbackData.leftoverRecipient, _balance - _toProvide);
          }
        } else {
          // Since the hub doesn't expect any amount of this token, send everything to the leftover recipient
          _erc20.safeTransfer(_callbackData.leftoverRecipient, _balance);
        }
      }
    }
  }

  function _call0x(address _zrx, bytes memory _data) internal virtual {
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, ) = _zrx.call{value: 0}(_data);
    if (!success) revert ZRXFailed();
  }

  struct CallbackDataCaller {
    address caller;
    uint256 msgValue;
  }

  function _handleSwapForCallerCallback(IDCAHub.TokenInSwap[] calldata _tokens, bytes memory _data) internal {
    CallbackDataCaller memory _callbackData = abi.decode(_data, (CallbackDataCaller));
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
        IERC20(_token.token).safeTransferFrom(_callbackData.caller, address(hub), _token.toProvide);
      }
    }
  }
}
