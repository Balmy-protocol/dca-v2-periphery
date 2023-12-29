// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.22;

import {IPermit2} from '../interfaces/external/IPermit2.sol';

/**
 * @title Permit2 Transfers Library
 * @author Sam Bugs
 * @notice A small library to call Permit2's transfer from methods
 */
library Permit2Transfers {
  /**
   * @notice Executes a transfer from using Permit2
   * @param _permit2 The Permit2 contract
   * @param _token The token to transfer
   * @param _amount The amount to transfer
   * @param _nonce The owner's nonce
   * @param _deadline The signature's expiration deadline
   * @param _signature The signature that allows the transfer
   * @param _recipient The address that will receive the funds
   */
  function takeFromCaller(
    IPermit2 _permit2,
    address _token,
    uint256 _amount,
    uint256 _nonce,
    uint256 _deadline,
    bytes calldata _signature,
    address _recipient
  ) internal {
    _permit2.permitTransferFrom(
      // The permit message.
      IPermit2.PermitTransferFrom({permitted: IPermit2.TokenPermissions({token: _token, amount: _amount}), nonce: _nonce, deadline: _deadline}),
      // The transfer recipient and amount.
      IPermit2.SignatureTransferDetails({to: _recipient, requestedAmount: _amount}),
      // The owner of the tokens, which must also be
      // the signer of the message, otherwise this call
      // will fail.
      msg.sender,
      // The packed signature that was the result of signing
      // the EIP712 hash of `permit`.
      _signature
    );
  }

  /**
   * @notice Executes a batch transfer from using Permit2
   * @param _permit2 The Permit2 contract
   * @param _tokens The amount of tokens to transfer
   * @param _nonce The owner's nonce
   * @param _deadline The signature's expiration deadline
   * @param _signature The signature that allows the transfer
   * @param _recipient The address that will receive the funds
   */
  function batchTakeFromCaller(
    IPermit2 _permit2,
    IPermit2.TokenPermissions[] calldata _tokens,
    uint256 _nonce,
    uint256 _deadline,
    bytes calldata _signature,
    address _recipient
  ) internal {
    if (_tokens.length > 0) {
      _permit2.permitTransferFrom(
        // The permit message.
        IPermit2.PermitBatchTransferFrom({permitted: _tokens, nonce: _nonce, deadline: _deadline}),
        // The transfer recipients and amounts.
        _buildTransferDetails(_tokens, _recipient),
        // The owner of the tokens, which must also be
        // the signer of the message, otherwise this call
        // will fail.
        msg.sender,
        // The packed signature that was the result of signing
        // the EIP712 hash of `permit`.
        _signature
      );
    }
  }

  function _buildTransferDetails(IPermit2.TokenPermissions[] calldata _tokens, address _recipient)
    private
    pure
    returns (IPermit2.SignatureTransferDetails[] memory _details)
  {
    _details = new IPermit2.SignatureTransferDetails[](_tokens.length);
    for (uint256 i; i < _details.length; ++i) {
      _details[i] = IPermit2.SignatureTransferDetails({to: _recipient, requestedAmount: _tokens[i].amount});
    }
  }
}
