// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.22;

import '@openzeppelin/contracts-5.0.1/access/IAccessControl.sol';
import '@openzeppelin/contracts-5.0.1/token/ERC20/utils/SafeERC20.sol';
import {IDCAHubSwapCallee, IDCAHub} from '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHubSwapCallee.sol';

contract ThirdPartyDCAHubSwapper is IDCAHubSwapCallee {
  /// @notice A target we want to give allowance to
  struct Allowance {
    IERC20 token;
    address spender;
  }

  /// @notice The data necessary for a swap to be executed
  struct SwapExecution {
    address swapper;
    uint256 value;
    bytes swapData;
  }

  /// @notice Data used for the callback
  struct SwapWithDexesCallbackData {
    // If this is a test check
    bool isTest;
    // Timestamp where the tx is no longer valid
    uint256 deadline;
    // Targets to set allowance to
    Allowance[] allowanceTargets;
    // The different swaps to execute
    SwapExecution[] executions;
    // A list of tokens to check for unspent balance (should not be reward/to provide)
    IERC20[] intermediateTokensToCheck;
    // The address that will receive the unspent tokens
    address leftoverRecipient;
  }

  /// @notice An amount of certain token
  struct AmountOfToken {
    address token;
    uint256 amount;
  }

  /// @notice Thrown when the swap is a test. It reports the amount of tokens help by the swapper
  error SwapResults(AmountOfToken[] amounts);

  /// @notice Thrown when deadline has passed
  error TransactionTooOld();

  /// @notice Thrown when the caller tries to execute a swap, but they are not the privileged swapper
  error NotPrivilegedSwapper();

  using SafeERC20 for IERC20;
  using Address for address;

  bytes32 public constant PRIVILEGED_SWAPPER_ROLE = keccak256('PRIVILEGED_SWAPPER_ROLE');

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubSwapCall(
    address,
    IDCAHub.TokenInSwap[] calldata _tokens,
    uint256[] calldata,
    bytes calldata _data
  ) external {
    SwapWithDexesCallbackData memory _callbackData = abi.decode(_data, (SwapWithDexesCallbackData));
    if (block.timestamp > _callbackData.deadline) revert TransactionTooOld();
    _approveAllowances(_callbackData.allowanceTargets);
    _executeSwaps(_callbackData.executions);
    if (_callbackData.isTest) {
      _revertWithResults(_tokens, _callbackData.intermediateTokensToCheck);
    }
    _handleSwapTokens(_tokens, _callbackData.leftoverRecipient);
    _handleIntermediateTokens(_callbackData.intermediateTokensToCheck, _callbackData.leftoverRecipient);
  }

  /**
   * @notice Executed a DCA swap
   * @dev There are some cases where the oracles differ from what the markets can offer, so a swap can't be executed. But
   *      it could happen that even if the amounts being swap are really big, the difference between oracle and market is
   *      only a few dollars. In that case, it would be nice if someone could just pay for the difference.
   *      The idea here is that instead of calling the hub directly, someone could call the swapper with some native token,
   *      so that when the swapper gets called, they can use that native token balance as part of the swap, and cover the
   *      difference
   */
  function executeSwap(
    IDCAHubWithAccessControl _hub,
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    uint256[] calldata _borrow,
    bytes calldata _callbackData,
    bytes calldata _oracleData
  ) external payable {
    if (!_hub.hasRole(PRIVILEGED_SWAPPER_ROLE, msg.sender)) {
      revert NotPrivilegedSwapper();
    }
    _hub.swap(_tokens, _pairsToSwap, address(this), address(this), _borrow, _callbackData, _oracleData);
  }

  function _approveAllowances(Allowance[] memory _allowanceTargets) internal {
    for (uint256 i = 0; i < _allowanceTargets.length; ++i) {
      Allowance memory _target = _allowanceTargets[i];
      _target.token.forceApprove(_target.spender, type(uint256).max);
    }
  }

  function _executeSwaps(SwapExecution[] memory _executions) internal {
    for (uint256 i = 0; i < _executions.length; ++i) {
      SwapExecution memory _execution = _executions[i];
      _execution.swapper.functionCallWithValue(_execution.swapData, _execution.value);
    }
  }

  function _handleSwapTokens(IDCAHub.TokenInSwap[] calldata _tokens, address _leftoverRecipient) internal {
    for (uint256 i = 0; i < _tokens.length; ++i) {
      IERC20 _token = IERC20(_tokens[i].token);
      uint256 _balance = _token.balanceOf(address(this));
      if (_balance > 0) {
        uint256 _toProvide = _tokens[i].toProvide;
        if (_toProvide > 0) {
          // Send everything to hub (we assume the hub is msg.sender)
          _token.safeTransfer(msg.sender, _balance);
        } else {
          // Send reward to the leftover recipient
          _token.safeTransfer(_leftoverRecipient, _balance);
        }
      }
    }
  }

  function _handleIntermediateTokens(IERC20[] memory _intermediateTokens, address _leftoverRecipient) internal {
    for (uint256 i = 0; i < _intermediateTokens.length; ++i) {
      uint256 _balance = _intermediateTokens[i].balanceOf(address(this));
      if (_balance > 0) {
        _intermediateTokens[i].safeTransfer(_leftoverRecipient, _balance);
      }
    }
  }

  function _revertWithResults(IDCAHub.TokenInSwap[] calldata _tokens, IERC20[] memory _intermediateTokens) internal view {
    AmountOfToken[] memory _amounts = new AmountOfToken[](_tokens.length + _intermediateTokens.length);
    for (uint256 i; i < _tokens.length; i++) {
      address _token = _tokens[i].token;
      _amounts[i] = AmountOfToken({token: _token, amount: IERC20(_token).balanceOf(address(this))});
    }
    for (uint256 i; i < _intermediateTokens.length; i++) {
      _amounts[i + _tokens.length] = AmountOfToken({
        token: address(_intermediateTokens[i]),
        amount: _intermediateTokens[i].balanceOf(address(this))
      });
    }
    revert SwapResults(_amounts);
  }
}

interface IDCAHubWithAccessControl is IDCAHub, IAccessControl {}
