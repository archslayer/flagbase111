// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Non-transferable SBT-like achievements. Minting controlled by core.
contract Achievements is ERC721, Ownable {
    address public core;
    uint256 public nextTokenId;

    error NotCore();
    error CoreAlreadySet();

    constructor() ERC721("FlagWars Achievements", "FW-SBT") {}

    function setCore(address coreAddress) external onlyOwner {
        if (core != address(0)) revert CoreAlreadySet();
        core = coreAddress;
    }

    function mintTo(address to) external returns (uint256 tokenId) {
        if (msg.sender != core) revert NotCore();
        tokenId = ++nextTokenId;
        _mint(to, tokenId);
    }

    // Soulbound: block transfers
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize) internal override {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        if (from != address(0) && to != address(0) && from != to) revert NotCore();
    }

    // Support for SBT-like behavior
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
