// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/swappers/solidity/contracts/extensions/GetBalances.sol';
import '@mean-finance/swappers/solidity/contracts/extensions/RevokableWithGovernor.sol';
import '@mean-finance/swappers/solidity/contracts/extensions/RunSwap.sol';
import '@mean-finance/swappers/solidity/contracts/extensions/PayableMulticall.sol';
import {IPermit2} from '../interfaces/external/IPermit2.sol';
import {Permit2Transfers} from '../libraries/Permit2Transfers.sol';

/**
 * @notice This contract will work as base companion for all our contracts. It will extend the capabilities of our companion
 *         contracts so that they can execute multicalls, swaps, revokes and more
 * @dev All public functions are payable, so that they can be multicalled together with other payable functions when msg.value > 0
 */
abstract contract BaseCompanion is RunSwap, RevokableWithGovernor, GetBalances, PayableMulticall {
  using Permit2Transfers for IPermit2;

  /**
   * @notice Returns the address of the Permit2 contract
   * @dev This value is constant and cannot change
   * @return The address of the Permit2 contract
   */
  // solhint-disable-next-line func-name-mixedcase
  IPermit2 public immutable PERMIT2;

  constructor(
    address _swapperRegistry,
    address _governor,
    IPermit2 _permit2
  ) SwapAdapter(_swapperRegistry) Governable(_governor) {
    PERMIT2 = _permit2;
  }

  /**
   * @notice Sends the specified amount of the given token to the recipient
   * @param _token The token to transfer
   * @param _amount The amount to transfer
   * @param _recipient The recipient of the token balance
   */
  function sendToRecipient(
    address _token,
    uint256 _amount,
    address _recipient
  ) external payable {
    _sendToRecipient(_token, _amount, _recipient);
  }

  /**
   * @notice Takes the given amount of tokens from the caller and transfers it to this contract
   * @param _token The token to take
   * @param _amount The amount to take
   */
  function takeFromCaller(IERC20 _token, uint256 _amount) external payable {
    _takeFromMsgSender(_token, _amount);
  }

  /**
   * @notice Takes the given amount of tokens from the caller with Permit2 and transfers it to this contract
   * @param _token The token to take
   * @param _amount The amount to take
   * @param _nonce The signed nonce
   * @param _deadline The signature's deadline
   * @param _signature The owner's signature
   */
  function permitTakeFromCaller(
    address _token,
    uint256 _amount,
    uint256 _nonce,
    uint256 _deadline,
    bytes calldata _signature
  ) external payable {
    PERMIT2.takeFromCaller(_token, _amount, _nonce, _deadline, _signature);
  }

  /**
   * @notice Takes the a batch of tokens from the caller with Permit2 and transfers it to this contract
   * @param _tokens The tokens to take
   * @param _nonce The signed nonce
   * @param _deadline The signature's deadline
   * @param _signature The owner's signature
   */
  function batchPermitTakeFromCaller(
    IPermit2.TokenPermissions[] calldata _tokens,
    uint256 _nonce,
    uint256 _deadline,
    bytes calldata _signature
  ) external payable {
    PERMIT2.batchTakeFromCaller(_tokens, _nonce, _deadline, _signature);
  }

  /**
   * @notice Checks if the contract has any balance of the given token, and if it does,
   *         it sends it to the given recipient
   * @param _token The token to check
   * @param _recipient The recipient of the token balance
   */
  function sendBalanceOnContractToRecipient(address _token, address _recipient) external payable {
    _sendBalanceOnContractToRecipient(_token, _recipient);
  }
}
