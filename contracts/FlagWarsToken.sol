// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// ERC20 token representing a country's token in FlagWars.
// Mint/burn restricted to the `core` contract. Transfers are allowed.
contract FlagWarsToken is ERC20, Ownable {
    address public core;

    error NotCore();
    error CoreAlreadySet();

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function setCore(address coreAddress) external onlyOwner {
        if (core != address(0)) revert CoreAlreadySet();
        core = coreAddress;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != core) revert NotCore();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != core) revert NotCore();
        _burn(from, amount);
    }
}
