// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './DCAStrategiesManagementHandler.sol';
import './DCAStrategiesPermissionsHandler.sol';
import './DCAStrategiesPositionsHandler.sol';
import '../../interfaces/IDCAStrategies.sol';

contract DCAStrategies is DCAStrategiesManagementHandler, DCAStrategiesPermissionsHandler, DCAStrategiesPositionsHandler, IDCAStrategies {
  constructor(address _governor, IDCAHubPositionDescriptor _descriptor)
    ERC721('Mean Finance - DCA Strategy Position', 'MF-DCA-STRAT-P')
    EIP712('Mean Finance - DCA Strategy Position', '1')
    Governable(_governor)
    DCAStrategiesPermissionsHandler(_descriptor)
  {}
}
