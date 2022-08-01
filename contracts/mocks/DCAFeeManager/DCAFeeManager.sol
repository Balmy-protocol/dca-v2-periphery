// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAFeeManager/DCAFeeManager.sol';

contract DCAFeeManagerMock is DCAFeeManager {
  struct SendToRecipientCall {
    address token;
    uint256 amount;
    address recipient;
  }

  SendToRecipientCall[] internal _sendToRecipientCalls;

  constructor(
    address _swapperRegistry,
    address _superAdmin,
    address[] memory _initialAdmins
  ) DCAFeeManager(_swapperRegistry, _superAdmin, _initialAdmins) {}

  function sendToRecipientCalls() external view returns (SendToRecipientCall[] memory) {
    return _sendToRecipientCalls;
  }

  function setPosition(
    address _from,
    address _to,
    uint256 _positionId
  ) external {
    positions[getPositionKey(_from, _to)] = _positionId;
  }

  function positionsWithToken(address _toToken) external view returns (uint256[] memory) {
    return _positionsWithToken[_toToken];
  }

  function setPositionsWithToken(address _toToken, uint256[] calldata _positionIds) external {
    for (uint256 i; i < _positionIds.length; i++) {
      _positionsWithToken[_toToken].push(_positionIds[i]);
    }
  }

  function _sendToRecipient(
    address _token,
    uint256 _amount,
    address _recipient
  ) internal override {
    _sendToRecipientCalls.push(SendToRecipientCall(_token, _amount, _recipient));
  }
}
