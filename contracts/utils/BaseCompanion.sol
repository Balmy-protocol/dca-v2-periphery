// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol';
import '@mean-finance/swappers/solidity/contracts/extensions/GetBalances.sol';
import '@mean-finance/swappers/solidity/contracts/extensions/RevokableWithGovernor.sol';
import '@mean-finance/swappers/solidity/contracts/extensions/RunSwap.sol';
import './Multicall.sol';

/**
 * @notice This contract will work as base companion for all our contracts. It will extend the capabilities of our companion
 *         contracts so that they can execute multicalls, swaps, revokes and more
 * @dev All public functions are payable, so that they can be multicalled together with other payable functions when msg.value > 0
 */
abstract contract BaseCompanion is RunSwap, RevokableWithGovernor, GetBalances, Multicall {
  constructor(address _swapperRegistry, address _governor) SwapAdapter(_swapperRegistry) Governable(_governor) {}

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
   * @notice Checks if the contract has any balance of the given token, and if it does,
   *         it sends it to the given recipient
   * @param _token The token to check
   * @param _recipient The recipient of the token balance
   */
  function sendBalanceOnContractToRecipient(address _token, address _recipient) external payable {
    _sendBalanceOnContractToRecipient(_token, _recipient);
  }

  /**
   * @notice Executes a permit on a ERC20 token that supports it
   * @param _token The token that will execute the permit
   * @param _owner The account that signed the permite
   * @param _spender The account that is being approved
   * @param _value The amount that is being approved
   * @param _v Must produce valid secp256k1 signature from the holder along with `r` and `s`
   * @param _r Must produce valid secp256k1 signature from the holder along with `v` and `s`
   * @param _s Must produce valid secp256k1 signature from the holder along with `r` and `v`
   */
  function permit(
    IERC20Permit _token,
    address _owner,
    address _spender,
    uint256 _value,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external payable {
    _token.permit(_owner, _spender, _value, _deadline, _v, _r, _s);
  }
}
