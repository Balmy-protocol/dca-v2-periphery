// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '../interfaces/IDCAKeep3rJob.sol';
import '../utils/Governable.sol';

contract DCAKeep3rJob is Governable, IDCAKeep3rJob {
  using ECDSA for bytes32;

  uint256 public nonce;
  IDCAHubCompanion public companion;
  mapping(address => bool) public canAddressSignWork;

  constructor(IDCAHubCompanion _companion, address _governor) Governable(_governor) {
    if (address(_companion) == address(0)) revert ZeroAddress();
    companion = _companion;
  }

  function setCompanion(IDCAHubCompanion _companion) external onlyGovernor {
    if (address(_companion) == address(0)) revert ZeroAddress();
    companion = _companion;
    emit NewCompanionSet(_companion);
  }

  function setIfAddressCanSign(address _address, bool _canSign) external onlyGovernor {
    if (_address == address(0)) revert ZeroAddress();
    canAddressSignWork[_address] = _canSign;
    emit ModifiedAddressPermission(_address, _canSign);
  }

  function work(bytes calldata _bytes, bytes calldata _signature) external {
    // TODO: check that msg.sender is a keeper

    address _signer = keccak256(_bytes).toEthSignedMessageHash().recover(_signature);
    if (!canAddressSignWork[_signer]) revert SignerCannotSignWork();

    WorkCall memory _call = abi.decode(_bytes, (WorkCall));
    if (_call.nonce != nonce++) revert InvalidNonce();
    if (_call.deadline < block.timestamp) revert DeadlineExpired();
    if (_call.chainId != block.chainid) revert InvalidChainId();

    _callCompanion(_call.companionCall);

    // TODO: call keep3r.worked
    // TODO: emit event?
  }

  function _callCompanion(bytes memory _call) internal virtual {
    // solhint-disable-next-line avoid-low-level-calls
    (bool _success, ) = address(companion).call(_call);
    if (!_success) revert CompanionCallFailed();
  }
}
