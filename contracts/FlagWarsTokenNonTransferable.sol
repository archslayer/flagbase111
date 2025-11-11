// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FlagWarsTokenNonTransferable
 * @dev Non-transferable ERC20 token for Flag Wars
 */
contract FlagWarsTokenNonTransferable is ERC20, Ownable {
    error NonTransferable();
    error OnlyCoreContract();
    
    address public immutable coreContract;
    
    event TransferBlocked(address indexed from, address indexed to, uint256 amount, string reason);
    
    constructor(
        string memory name,
        string memory symbol,
        address _coreContract
    ) ERC20(name, symbol) Ownable() {
        coreContract = _coreContract;
    }
    
    // Override transfer functions to block all transfers
    function transfer(address to, uint256 amount) public pure override returns (bool) {
        revert NonTransferable();
    }
    
    function transferFrom(address from, address to, uint256 amount) public pure override returns (bool) {
        revert NonTransferable();
    }
    
    function approve(address spender, uint256 amount) public pure override returns (bool) {
        revert NonTransferable();
    }
    
    function increaseAllowance(address spender, uint256 addedValue) public pure override returns (bool) {
        revert NonTransferable();
    }
    
    function decreaseAllowance(address spender, uint256 subtractedValue) public pure override returns (bool) {
        revert NonTransferable();
    }
    
    // Only Core contract can mint/burn
    function mint(address to, uint256 amount) external {
        if (msg.sender != coreContract) revert OnlyCoreContract();
        _mint(to, amount);
    }
    
    function burn(address from, uint256 amount) external {
        if (msg.sender != coreContract) revert OnlyCoreContract();
        _burn(from, amount);
    }
}