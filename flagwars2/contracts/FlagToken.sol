// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FlagToken
 * @dev ERC20 token with treasury-only transfer restriction and EIP-2612 permit support
 * - Users can only receive tokens from treasury (buy)
 * - Users can only send tokens to treasury (sell)
 * - No user-to-user transfers
 * - No burns
 * - EIP-2612 permit for gasless approvals
 */
contract FlagToken is ERC20, ERC20Permit, Ownable {
    address public immutable TREASURY;

    constructor(
        string memory name,
        string memory symbol,
        address treasury
    ) ERC20(name, symbol) ERC20Permit(name) {
        require(treasury != address(0), "FlagToken: bad treasury");
        TREASURY = treasury;
    }

    /**
     * @dev Mint tokens (owner only)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Mint to treasury and approve (owner only)
     * This allows deployer to approve on behalf of treasury without treasury needing ETH
     */
    function mintAndApprove(address spender, uint256 amount) external onlyOwner {
        _mint(TREASURY, amount);
        _approve(TREASURY, spender, type(uint256).max);
    }

    /**
     * @dev Override _beforeTokenTransfer to enforce Core-only transfers
     * Core acts as the inventory holder (replaces Treasury)
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        // Allow mint (from==0) and burn (to==0) from OZ internals
        if (from != address(0) && to != address(0)) {
            // Get Core address from owner's deployment (passed in constructor's treasury param)
            address CORE = TREASURY; // TREASURY now represents CORE_ADDRESS
            bool valid =
                (from == CORE && to != CORE) || // Core → User (buy)
                (to == CORE && from != CORE);   // User → Core (sell)
            require(valid, "FlagToken: Core-only transfer");
        }
        super._beforeTokenTransfer(from, to, amount);
    }
}
