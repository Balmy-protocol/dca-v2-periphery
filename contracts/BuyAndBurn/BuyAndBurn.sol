// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '@openzeppelin/contracts/interfaces/IERC721Receiver.sol';
import '../interfaces/IDCAHubCompanion.sol';

contract BuyAndBurn is IERC721Receiver {
  using EnumerableSet for EnumerableSet.UintSet;

  IDCAHubPositionHandler public hub;
  EnumerableSet.UintSet internal _positions;

  address internal constant _DEAD = address(0x000000000000000000000000000000000000dEaD);

  error DepositNotAccepted();
  error PositionNotOwned();
  error ZeroAddress();

  constructor(IDCAHubPositionHandler _hub) {
    if (address(_hub) == address(0)) revert ZeroAddress();
    hub = _hub;
  }

  function positions() external view returns (IDCAHubPositionHandler.UserPosition[] memory __positions) {
    __positions = new IDCAHubPositionHandler.UserPosition[](_positions.length());
    for (uint256 i; i < _positions.length(); i++) {
      __positions[i] = hub.userPosition(_positions.at(i));
    }
  }

  function withdrawAndBurn(uint256 _position) external {
    // Should we check this things ? Security can be inherited from hub.
    if (!_positions.contains(_position)) revert PositionNotOwned();
    hub.withdrawSwapped(_position, _DEAD);
  }

  function withdrawAndBurnMany(IDCAHubPositionHandler.PositionSet[] calldata __positions) external {
    // Should we check this things ? Security can be inherited from hub.
    for (uint256 i; i < __positions.length; i++) {
      for (uint256 j; j < __positions[i].positionIds.length; j++) {
        if (!_positions.contains(__positions[i].positionIds[j])) revert PositionNotOwned();
      }
    }
    hub.withdrawSwappedMany(__positions, _DEAD);
  }

  function onERC721Received(
    address _operator,
    address, // from
    uint256 _tokenId,
    bytes calldata // data
  ) external returns (bytes4 _selector) {
    if (_operator != address(hub)) revert DepositNotAccepted(); // This could be optional, people might want to send positions to burn after creation
    _positions.add(_tokenId);
    return bytes4(keccak256('onERC721Received(address,address,uint256,bytes)'));
  }
}
