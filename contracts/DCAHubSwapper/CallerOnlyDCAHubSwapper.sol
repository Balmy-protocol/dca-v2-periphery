// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../interfaces/ICallerOnlyDCAHubSwapper.sol';
import './utils/DeadlineValidation.sol';

contract CallerOnlyDCAHubSwapper is DeadlineValidation, ICallerOnlyDCAHubSwapper {
  using SafeERC20 for IERC20;
  using Address for address;

  /// @notice Thrown when the caller tries to execute a swap, but they are not the privileged swapper
  error NotPrivilegedSwapper();

  bytes32 public constant PRIVILEGED_SWAPPER_ROLE = keccak256('PRIVILEGED_SWAPPER_ROLE');

  /// @notice Represents the lack of an executor. We are not using the zero address so that it's cheaper to modify
  address internal constant _NO_EXECUTOR = 0x000000000000000000000000000000000000dEaD;
  /// @notice The caller who initiated a swap execution
  address internal _swapExecutor = _NO_EXECUTOR;

  /// @inheritdoc ICallerOnlyDCAHubSwapper
  function swapForCaller(SwapForCallerParams calldata _parameters)
    external
    payable
    checkDeadline(_parameters.deadline)
    returns (IDCAHub.SwapInfo memory _swapInfo)
  {
    if (!_parameters.hub.hasRole(PRIVILEGED_SWAPPER_ROLE, msg.sender)) {
      revert NotPrivilegedSwapper();
    }

    // Set the swap's executor
    _swapExecutor = msg.sender;

    // Execute swap
    _swapInfo = _parameters.hub.swap(
      _parameters.tokens,
      _parameters.pairsToSwap,
      _parameters.recipient,
      address(this),
      new uint256[](_parameters.tokens.length),
      '',
      _parameters.oracleData
    );

    // Check that limits were met
    for (uint256 i = 0; i < _swapInfo.tokens.length; ) {
      IDCAHub.TokenInSwap memory _tokenInSwap = _swapInfo.tokens[i];
      if (_tokenInSwap.reward < _parameters.minimumOutput[i]) {
        revert RewardNotEnough();
      } else if (_tokenInSwap.toProvide > _parameters.maximumInput[i]) {
        revert ToProvideIsTooMuch();
      }
      unchecked {
        i++;
      }
    }

    // Clear the swap executor
    _swapExecutor = _NO_EXECUTOR;
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubSwapCall(
    address,
    IDCAHub.TokenInSwap[] calldata _tokens,
    uint256[] calldata,
    bytes calldata
  ) external {
    // Load to mem to avoid reading storage multiple times
    address _swapExecutorMem = _swapExecutor;
    for (uint256 i = 0; i < _tokens.length; ) {
      IDCAHub.TokenInSwap memory _token = _tokens[i];
      if (_token.toProvide > 0) {
        // We assume that msg.sender is the DCAHub
        IERC20(_token.token).safeTransferFrom(_swapExecutorMem, msg.sender, _token.toProvide);
      }
      unchecked {
        i++;
      }
    }
  }
}
