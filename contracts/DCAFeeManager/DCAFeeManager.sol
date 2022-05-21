// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAFeeManager.sol';
import '../utils/Governable.sol';

contract DCAFeeManager is Governable, IDCAFeeManager {
  /// @inheritdoc IDCAFeeManager
  uint16 public constant MAX_TOKEN_TOTAL_SHARE = 10000;
  /// @inheritdoc IDCAFeeManager
  uint32 public constant SWAP_INTERVAL = 1 days;
  /// @inheritdoc IDCAFeeManager
  IDCAHub public immutable hub;

  TargetTokenShare[] internal _distribution;

  constructor(
    IDCAHub _hub,
    TargetTokenShare[] memory _distributionToSet,
    address _governor
  ) Governable(_governor) {
    hub = _hub;
    setTargetTokensDistribution(_distributionToSet);
  }

  /// @inheritdoc IDCAFeeManager
  function targetTokensDistribution() external view returns (TargetTokenShare[] memory) {
    return _distribution;
  }

  /// @inheritdoc IDCAFeeManager
  function setTargetTokensDistribution(TargetTokenShare[] memory _newDistribution) public {
    // TODO: Make sure only specific users can set this distribution

    uint256 _currentTargetTokens = _distribution.length;
    uint256 _min = _currentTargetTokens < _newDistribution.length ? _currentTargetTokens : _newDistribution.length;

    uint16 _assignedShares;
    for (uint256 i; i < _min; i++) {
      // Rewrite storage
      _assignedShares += _newDistribution[i].shares;
      _distribution[i] = _newDistribution[i];
    }

    if (_currentTargetTokens < _newDistribution.length) {
      // If have more tokens than before, then push
      for (uint256 i = _min; i < _newDistribution.length; i++) {
        _assignedShares += _newDistribution[i].shares;
        _distribution.push(_newDistribution[i]);
      }
    } else if (_currentTargetTokens > _newDistribution.length) {
      // If have less tokens than before, then remove extra tokens
      for (uint256 i = _min; i < _currentTargetTokens; i++) {
        _distribution.pop();
      }
    }

    if (_assignedShares != MAX_TOKEN_TOTAL_SHARE) revert InvalidAmountOfShares();
    emit NewDistribution(_newDistribution);
  }
}
