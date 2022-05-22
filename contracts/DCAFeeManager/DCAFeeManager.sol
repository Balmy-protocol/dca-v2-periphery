// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../interfaces/IDCAFeeManager.sol';
import '../utils/Governable.sol';

contract DCAFeeManager is Governable, IDCAFeeManager {
  using SafeERC20 for IERC20;

  /// @inheritdoc IDCAFeeManager
  uint16 public constant MAX_TOKEN_TOTAL_SHARE = 10000;
  /// @inheritdoc IDCAFeeManager
  uint32 public constant SWAP_INTERVAL = 1 days;
  /// @inheritdoc IDCAFeeManager
  IDCAHub public immutable hub;
  /// @inheritdoc IDCAFeeManager
  IWrappedProtocolToken public immutable wToken;
  /// @inheritdoc IDCAFeeManager
  mapping(address => bool) public hasAccess;
  /// @inheritdoc IDCAFeeManager
  mapping(bytes32 => uint256) public positions; // key(from, to) => position id

  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    address _governor
  ) Governable(_governor) {
    hub = _hub;
    wToken = _wToken;
  }

  /// @inheritdoc IDCAFeeManager
  function withdrawProtocolToken(uint256[] calldata _positionIds, address payable _recipient) external onlyOwnerOrAllowed {
    // Withdraw wToken from platform balance
    uint256 _platformBalance = hub.platformBalance(address(wToken));
    if (_platformBalance > 0) {
      IDCAHub.AmountOfToken[] memory _amountToWithdraw = new IDCAHub.AmountOfToken[](1);
      _amountToWithdraw[0] = IDCAHub.AmountOfToken({token: address(wToken), amount: _platformBalance});
      hub.withdrawFromPlatformBalance(_amountToWithdraw, address(this));
    }

    // Withdraw wToken from positions
    if (_positionIds.length > 0) {
      IDCAHub.PositionSet[] memory _positionSets = new IDCAHub.PositionSet[](1);
      _positionSets[0] = IDCAHubPositionHandler.PositionSet({token: address(wToken), positionIds: _positionIds});
      hub.withdrawSwappedMany(_positionSets, address(this));
    }

    // Unwrap and transfer
    uint256 _totalBalance = wToken.balanceOf(address(this));
    if (_totalBalance > 0) {
      wToken.withdraw(_totalBalance);
      _recipient.transfer(_totalBalance);
    }
  }

  /// @inheritdoc IDCAFeeManager
  function withdrawFromPlatformBalance(IDCAHub.AmountOfToken[] calldata _amountToWithdraw, address _recipient) external onlyOwnerOrAllowed {
    hub.withdrawFromPlatformBalance(_amountToWithdraw, _recipient);
  }

  /// @inheritdoc IDCAFeeManager
  function withdrawFromBalance(IDCAHub.AmountOfToken[] calldata _amountToWithdraw, address _recipient) external onlyOwnerOrAllowed {
    for (uint256 i; i < _amountToWithdraw.length; i++) {
      IERC20(_amountToWithdraw[i].token).safeTransfer(_recipient, _amountToWithdraw[i].amount);
    }
  }

  /// @inheritdoc IDCAFeeManager
  function withdrawFromPositions(IDCAHub.PositionSet[] calldata _positionSets, address _recipient) external onlyOwnerOrAllowed {
    hub.withdrawSwappedMany(_positionSets, _recipient);
  }

  /// @inheritdoc IDCAFeeManager
  function fillPositions(AmountToFill[] calldata _amounts, TargetTokenShare[] calldata _distribution) external onlyOwnerOrAllowed {
    for (uint256 i; i < _amounts.length; i++) {
      AmountToFill memory _amount = _amounts[i];

      if (IERC20(_amount.token).allowance(address(this), address(hub)) == 0) {
        // Approve the token so that the hub can take the funds
        IERC20(_amount.token).approve(address(hub), type(uint256).max);
      }

      // Distribute to different tokens
      uint256 _amountSpent;
      for (uint256 j; j < _distribution.length; j++) {
        uint256 _amountToDeposit = j < _distribution.length - 1
          ? (_amount.amount * _distribution[j].shares) / MAX_TOKEN_TOTAL_SHARE
          : _amount.amount - _amountSpent; // If this is the last token, then assign everything that hasn't been spent. We do this to prevent unspent tokens due to rounding errors

        bool _failed = _depositToHub(_amount.token, _distribution[j].token, _amountToDeposit, _amount.amountOfSwaps);
        if (!_failed) {
          _amountSpent += _amountToDeposit;
        }
      }
    }
  }

  /// @inheritdoc IDCAFeeManager
  function terminatePositions(uint256[] calldata _positionIds, address _recipient) external onlyOwnerOrAllowed {
    for (uint256 i; i < _positionIds.length; i++) {
      uint256 _positionId = _positionIds[i];
      IDCAHubPositionHandler.UserPosition memory _position = hub.userPosition(_positionId);
      hub.terminate(_positionId, _recipient, _recipient);
      delete positions[getPositionKey(address(_position.from), address(_position.to))];
    }
  }

  /// @inheritdoc IDCAFeeManager
  function setAccess(UserAccess[] calldata _access) external onlyGovernor {
    for (uint256 i; i < _access.length; i++) {
      hasAccess[_access[i].user] = _access[i].access;
    }
    emit NewAccess(_access);
  }

  /// @inheritdoc IDCAFeeManager
  function resetAllowance(IERC20 _token) external {
    _token.approve(address(hub), 0); // We do this first because some tokens (like USDT) will fail if we  don't
    _token.approve(address(hub), type(uint256).max);
  }

  function getPositionKey(address _from, address _to) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(_from, _to));
  }

  receive() external payable {}

  function _depositToHub(
    address _from,
    address _to,
    uint256 _amount,
    uint32 _amountOfSwaps
  ) internal returns (bool _failed) {
    // We will try to create or increase an existing position, but both could fail. Maybe one of the tokens is no longer
    // allowed, or a pair not supported, so we need to check if it fails or not and act accordingly

    // Find the position for this token
    bytes32 _key = getPositionKey(_from, _to);
    uint256 _positionId = positions[_key];

    if (_positionId == 0) {
      // If position doesn't exist, then try to create it
      try hub.deposit(_from, _to, _amount, _amountOfSwaps, SWAP_INTERVAL, address(this), new IDCAPermissionManager.PermissionSet[](0)) returns (
        uint256 _newPositionId
      ) {
        positions[_key] = _newPositionId;
      } catch {
        _failed = true;
      }
    } else {
      // If position exists, then try to increase it
      try hub.increasePosition(_positionId, _amount, _amountOfSwaps) {} catch {
        _failed = true;
      }
    }
  }

  modifier onlyOwnerOrAllowed() {
    if (!hasAccess[msg.sender] && !isGovernor(msg.sender)) revert CallerMustBeOwnerOrHaveAccess();
    _;
  }
}
