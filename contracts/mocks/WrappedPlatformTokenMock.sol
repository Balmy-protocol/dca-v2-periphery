// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IWrappedProtocolToken.sol';
import './ERC20Mock.sol';

contract WrappedPlatformTokenMock is ERC20Mock, IWrappedProtocolToken {
  constructor(
    string memory _name,
    string memory _symbol,
    uint8 _decimals
  ) payable ERC20Mock(_name, _symbol, _decimals, address(0), 0) {}

  function deposit() public payable {
    _mint(msg.sender, msg.value);
  }

  function withdraw(uint256 _amount) public {
    _burn(msg.sender, _amount);
    payable(msg.sender).transfer(_amount);
  }
}
