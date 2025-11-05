// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title FlagWars Core v1.5.5 with Anti-Dump Protection
 * @dev Enhanced version with anti-dump mechanism to prevent large sell manipulations
 * @author FlagWars Team
 */
contract FlagWarsCore_v1_5_5_AntiDump is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    
    // ============ CONSTANTS ============
    uint256 constant KAPPA_TICKS = 55_000;           // 0.00055 * 1e8 - FIXED
    uint256 constant LAMBDA_TICKS = 55_550;          // 0.0005555 * 1e8 - FIXED
    uint64 public constant PRICE_MIN = 1000000;     // 0.01 * 1e8
    uint64 public constant PRICE_PRECISION = 1e8;
    uint64 public constant SELL_FEE_BPS = 500;      // 5% base sell fee
    uint32 public constant TOTAL_SUPPLY_PER_COUNTRY = 50000;
    
    // Anti-dump protection tiers (in basis points)
    uint256 constant ANTIDUMP_TIER_1_THRESHOLD = 500;   // 5%
    uint256 constant ANTIDUMP_TIER_1_EXTRA_FEE = 500;   // +5% extra fee
    uint256 constant ANTIDUMP_TIER_1_COOLDOWN = 60;     // 1 minute
    
    uint256 constant ANTIDUMP_TIER_2_THRESHOLD = 1000;  // 10%
    uint256 constant ANTIDUMP_TIER_2_EXTRA_FEE = 800;   // +8% extra fee
    uint256 constant ANTIDUMP_TIER_2_COOLDOWN = 300;    // 5 minutes
    
    uint256 constant ANTIDUMP_TIER_3_THRESHOLD = 1500;  // 15%
    uint256 constant ANTIDUMP_TIER_3_EXTRA_FEE = 1200;  // +12% extra fee
    uint256 constant ANTIDUMP_TIER_3_COOLDOWN = 1200;   // 20 minutes
    
    uint256 constant ANTIDUMP_TIER_4_THRESHOLD = 2500;  // 25%
    uint256 constant ANTIDUMP_TIER_4_EXTRA_FEE = 1500;  // +15% extra fee
    uint256 constant ANTIDUMP_TIER_4_COOLDOWN = 14400;  // 4 hours
    
    // Attack fee bands (USDC 6 decimals)
    uint256 constant ATTACK_FEE_BAND_1 = 300000;    // 0.30 USDC
    uint256 constant ATTACK_FEE_BAND_2 = 350000;    // 0.35 USDC
    uint256 constant ATTACK_FEE_BAND_3 = 400000;    // 0.40 USDC
    
    // ============ STRUCTS ============
    struct Country {
        string name;
        address token;
        uint256 price; // Current price (8 decimals)
        uint256 attacks;
        bool exists;
    }
    
    struct Config {
        address payToken; // USDC address
    }
    
    // Anti-dump cooldown tracking
    struct CooldownInfo {
        uint256 lastSellTime;
        uint256 cooldownEndTime;
        uint256 tierApplied;
    }
    
    // ============ STATE VARIABLES ============
    mapping(uint256 => Country) public countries;
    mapping(address => mapping(uint256 => uint32)) public userBalances; // user -> country -> amount
    mapping(uint256 => uint32) public remainingSupply; // country -> remaining treasury supply
    mapping(uint256 => bool) public countryTouched;
    
    // Anti-dump cooldown tracking: user -> country -> cooldown info
    mapping(address => mapping(uint256 => CooldownInfo)) public cooldowns;
    
    Config public config;
    
    // ============ EVENTS ============
    event Buy(
        address indexed buyer,
        uint256 indexed countryId,
        uint32 amount,
        uint64 unitPrice,
        uint64 newPrice,
        uint256 totalCost
    );
    
    event Sell(
        address indexed seller,
        uint256 indexed countryId,
        uint32 amount,
        uint64 unitPrice,
        uint64 newPrice,
        uint256 netProceeds,
        uint256 totalFee,
        uint256 extraFee,
        uint256 cooldownApplied
    );
    
    event Attack(
        address indexed attacker,
        uint256 indexed attackerId,
        uint256 indexed targetId,
        uint256 feePaid,
        uint64 attackerPrice,
        uint64 targetPrice
    );
    
    // ============ CONSTRUCTOR ============
    constructor() {
        _staticSpecGuards();
    }
    
    // ============ STATIC SPEC GUARDS ============
    function _staticSpecGuards() internal pure {
        assert(KAPPA_TICKS == 55_000);
        assert(LAMBDA_TICKS == 55_550);
    }
    
    // ============ BUY FUNCTION ============
    /**
     * @dev Buy tokens using STATIC half-step model
     */
    function buy(uint256 countryId, uint256 amount, uint256 minOut, uint256 deadline) 
        external 
        payable 
        nonReentrant 
    {
        require(block.timestamp <= deadline, "DeadlineExceeded");
        require(amount > 0, "InvalidAmount");
        
        Country storage c = countries[countryId];
        require(c.exists, "CountryNotExists");
        require(remainingSupply[countryId] >= amount, "InsufficientTreasury");
        
        // STATIC pricing: P_buy = P + κ/2
        uint256 unitPrice = c.price + (KAPPA_TICKS / 2);
        uint256 totalCost = unitPrice * amount;
        
        require(totalCost >= PRICE_MIN, "MinBuyNotMet");
        require(totalCost >= minOut, "SlippageExceeded");
        
        // Transfer payment (convert from 8 decimals to 6 decimals for USDC)
        uint256 usdcAmount = totalCost / 100; // Convert from 8 decimals to 6 decimals
        IERC20(config.payToken).safeTransferFrom(msg.sender, address(this), usdcAmount);
        
        // Update price: P' = max(P_min, P + κ * q)
        c.price = max(PRICE_MIN, c.price + (KAPPA_TICKS * amount));
        
        // Update inventory
        remainingSupply[countryId] -= uint32(amount);
        userBalances[msg.sender][countryId] += uint32(amount);
        countryTouched[countryId] = true;
        
        emit Buy(
            msg.sender,
            countryId,
            uint32(amount),
            uint64(unitPrice),
            uint64(c.price),
            totalCost
        );
    }
    
    // ============ SELL FUNCTION WITH ANTI-DUMP ============
    /**
     * @dev Sell tokens with anti-dump protection
     */
    function sell(uint256 countryId, uint256 amount, uint256 minOut, uint256 deadline) 
        external 
        nonReentrant 
    {
        require(block.timestamp <= deadline, "DeadlineExceeded");
        require(amount > 0, "InvalidAmount");
        
        Country storage c = countries[countryId];
        require(c.exists, "CountryNotExists");
        require(userBalances[msg.sender][countryId] >= amount, "InsufficientUserBalance");
        
        // Check cooldown
        CooldownInfo storage cooldown = cooldowns[msg.sender][countryId];
        require(block.timestamp >= cooldown.cooldownEndTime, "CooldownActive");
        
        // Calculate sell percentage of treasury (total supply = remaining + sold)
        uint256 totalSupply = remainingSupply[countryId] + (TOTAL_SUPPLY_PER_COUNTRY - remainingSupply[countryId]);
        uint256 sellPercentBps = (amount * 10000) / totalSupply;
        
        // Determine anti-dump tier and apply extra fees
        uint256 extraFeeBps = 0;
        uint256 cooldownSeconds = 0;
        uint256 tierApplied = 0;
        
        if (sellPercentBps >= ANTIDUMP_TIER_4_THRESHOLD) {
            extraFeeBps = ANTIDUMP_TIER_4_EXTRA_FEE;
            cooldownSeconds = ANTIDUMP_TIER_4_COOLDOWN;
            tierApplied = 4;
        } else if (sellPercentBps >= ANTIDUMP_TIER_3_THRESHOLD) {
            extraFeeBps = ANTIDUMP_TIER_3_EXTRA_FEE;
            cooldownSeconds = ANTIDUMP_TIER_3_COOLDOWN;
            tierApplied = 3;
        } else if (sellPercentBps >= ANTIDUMP_TIER_2_THRESHOLD) {
            extraFeeBps = ANTIDUMP_TIER_2_EXTRA_FEE;
            cooldownSeconds = ANTIDUMP_TIER_2_COOLDOWN;
            tierApplied = 2;
        } else if (sellPercentBps >= ANTIDUMP_TIER_1_THRESHOLD) {
            extraFeeBps = ANTIDUMP_TIER_1_EXTRA_FEE;
            cooldownSeconds = ANTIDUMP_TIER_1_COOLDOWN;
            tierApplied = 1;
        }
        
        // STATIC pricing: P_sell = P - λ/2
        uint256 unitPrice = c.price - (LAMBDA_TICKS / 2);
        uint256 grossProceeds = unitPrice * amount;
        
        // Apply base 5% sell fee
        uint256 baseFee = (grossProceeds * SELL_FEE_BPS) / 10000;
        
        // Apply extra anti-dump fee
        uint256 extraFee = (grossProceeds * extraFeeBps) / 10000;
        uint256 totalFee = baseFee + extraFee;
        uint256 netProceeds = grossProceeds - totalFee;
        
        require(netProceeds >= PRICE_MIN, "MinSellNotMet");
        require(netProceeds >= minOut, "SlippageExceeded");
        
        // Transfer proceeds (convert from 8 decimals to 6 decimals for USDC)
        uint256 usdcProceeds = netProceeds / 100; // Convert from 8 decimals to 6 decimals
        IERC20(config.payToken).safeTransfer(msg.sender, usdcProceeds);
        
        // Update price: P' = max(P_min, P - λ * q)
        c.price = max(PRICE_MIN, c.price - (LAMBDA_TICKS * amount));
        
        // Update inventory
        userBalances[msg.sender][countryId] -= uint32(amount);
        remainingSupply[countryId] += uint32(amount);
        countryTouched[countryId] = true;
        
        // Set cooldown
        cooldown.lastSellTime = block.timestamp;
        cooldown.cooldownEndTime = block.timestamp + cooldownSeconds;
        cooldown.tierApplied = tierApplied;
        
        emit Sell(
            msg.sender,
            countryId,
            uint32(amount),
            uint64(unitPrice),
            uint64(c.price),
            netProceeds,
            totalFee,
            extraFee,
            cooldownSeconds
        );
    }
    
    // ============ ANTI-DUMP INFO FUNCTIONS ============
    /**
     * @dev Get anti-dump information for a potential sell
     * @param countryId Country ID
     * @param amount Amount to sell
     * @return extraFeeBps Extra fee in basis points
     * @return cooldownSeconds Cooldown duration in seconds
     * @return tierApplied Anti-dump tier that would be applied
     * @return sellPercentBps Sell percentage in basis points
     */
    function getAntiDumpInfo(uint256 countryId, uint256 amount) external view returns (
        uint256 extraFeeBps,
        uint256 cooldownSeconds,
        uint256 tierApplied,
        uint256 sellPercentBps
    ) {
        Country memory c = countries[countryId];
        require(c.exists, "CountryNotExists");
        
        // Calculate sell percentage of treasury (total supply = remaining + sold)
        uint256 totalSupply = remainingSupply[countryId] + (TOTAL_SUPPLY_PER_COUNTRY - remainingSupply[countryId]);
        sellPercentBps = (amount * 10000) / totalSupply;
        
        // Determine anti-dump tier
        if (sellPercentBps >= ANTIDUMP_TIER_4_THRESHOLD) {
            extraFeeBps = ANTIDUMP_TIER_4_EXTRA_FEE;
            cooldownSeconds = ANTIDUMP_TIER_4_COOLDOWN;
            tierApplied = 4;
        } else if (sellPercentBps >= ANTIDUMP_TIER_3_THRESHOLD) {
            extraFeeBps = ANTIDUMP_TIER_3_EXTRA_FEE;
            cooldownSeconds = ANTIDUMP_TIER_3_COOLDOWN;
            tierApplied = 3;
        } else if (sellPercentBps >= ANTIDUMP_TIER_2_THRESHOLD) {
            extraFeeBps = ANTIDUMP_TIER_2_EXTRA_FEE;
            cooldownSeconds = ANTIDUMP_TIER_2_COOLDOWN;
            tierApplied = 2;
        } else if (sellPercentBps >= ANTIDUMP_TIER_1_THRESHOLD) {
            extraFeeBps = ANTIDUMP_TIER_1_EXTRA_FEE;
            cooldownSeconds = ANTIDUMP_TIER_1_COOLDOWN;
            tierApplied = 1;
        }
    }
    
    /**
     * @dev Get user's cooldown information for a specific country
     * @param user User address
     * @param countryId Country ID
     * @return isInCooldown Whether user is in cooldown
     * @return cooldownEndTime When cooldown ends
     * @return remainingSeconds Seconds remaining in cooldown
     * @return lastTierApplied Last tier that was applied
     */
    function getUserCooldownInfo(address user, uint256 countryId) external view returns (
        bool isInCooldown,
        uint256 cooldownEndTime,
        uint256 remainingSeconds,
        uint256 lastTierApplied
    ) {
        CooldownInfo memory cooldown = cooldowns[user][countryId];
        cooldownEndTime = cooldown.cooldownEndTime;
        lastTierApplied = cooldown.tierApplied;
        
        if (block.timestamp < cooldown.cooldownEndTime) {
            isInCooldown = true;
            remainingSeconds = cooldown.cooldownEndTime - block.timestamp;
        } else {
            isInCooldown = false;
            remainingSeconds = 0;
        }
    }
    
    // ============ PRICE FUNCTIONS ============
    /**
     * @dev Get buy price for amount
     */
    function getBuyPrice(uint256 countryId, uint256 amount) external view returns (uint256) {
        Country memory c = countries[countryId];
        require(c.exists, "CountryNotExists");
        
        uint256 unitPrice = c.price + (KAPPA_TICKS / 2);
        return unitPrice * amount;
    }
    
    /**
     * @dev Get sell price for amount (including anti-dump fees)
     */
    function getSellPrice(uint256 countryId, uint256 amount) external view returns (uint256) {
        Country memory c = countries[countryId];
        require(c.exists, "CountryNotExists");
        
        uint256 unitPrice = c.price - (LAMBDA_TICKS / 2);
        uint256 grossProceeds = unitPrice * amount;
        
        // Get anti-dump info
        (uint256 extraFeeBps,,,) = this.getAntiDumpInfo(countryId, amount);
        
        // Apply base 5% sell fee
        uint256 baseFee = (grossProceeds * SELL_FEE_BPS) / 10000;
        
        // Apply extra anti-dump fee
        uint256 extraFee = (grossProceeds * extraFeeBps) / 10000;
        uint256 totalFee = baseFee + extraFee;
        
        return grossProceeds - totalFee;
    }
    
    // ============ ATTACK FUNCTIONS ============
    /**
     * @dev Attack function with band-based fees and deltas
     */
    function attack(uint256 attackerId, uint256 targetId) external nonReentrant {
        if (attackerId == targetId) revert("SelfAttack");
        
        Country storage a = countries[attackerId];
        Country storage t = countries[targetId];
        if (!a.exists || !t.exists) revert("CountryNotFound");
        
        // Select delta and fee based on attacker price
        uint256 delta;
        uint256 attackFee;
        
        if (a.price >= 2000000) { // >= 0.02 USDC
            delta = 100000; // 0.001 USDC
            attackFee = ATTACK_FEE_BAND_3;
        } else if (a.price >= 1500000) { // >= 0.015 USDC
            delta = 75000; // 0.00075 USDC
            attackFee = ATTACK_FEE_BAND_2;
        } else {
            delta = 50000; // 0.0005 USDC
            attackFee = ATTACK_FEE_BAND_1;
        }
        
        // Transfer attack fee (USDC 6 decimals)
        IERC20(config.payToken).safeTransferFrom(msg.sender, address(this), attackFee);
        
        // Apply price deltas
        a.price = max(PRICE_MIN, a.price - delta);
        t.price = max(PRICE_MIN, t.price - delta);
        
        // Update attack counts
        a.attacks++;
        t.attacks++;
        
        emit Attack(
            msg.sender,
            attackerId,
            targetId,
            attackFee,
            uint64(a.price),
            uint64(t.price)
        );
    }
    
    // ============ ADMIN FUNCTIONS ============
    /**
     * @dev Add a new country
     */
    function addCountry(uint256 countryId, string calldata name, address token) external onlyOwner {
        require(!countries[countryId].exists, "CountryExists");
        countries[countryId] = Country(name, token, PRICE_MIN, 0, true);
        remainingSupply[countryId] = TOTAL_SUPPLY_PER_COUNTRY;
    }
    
    /**
     * @dev Set payment token
     */
    function setPayToken(address payToken) external onlyOwner {
        config.payToken = payToken;
    }
    
    /**
     * @dev Emergency withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
    
    // ============ VIEW FUNCTIONS ============
    /**
     * @dev Get constants for verification
     */
    function getConstants() external pure returns (
        uint256 kappaTicks,
        uint256 lambdaTicks,
        uint64 priceMin,
        uint64 pricePrecision,
        uint32 totalSupplyPerCountry
    ) {
        return (KAPPA_TICKS, LAMBDA_TICKS, PRICE_MIN, PRICE_PRECISION, TOTAL_SUPPLY_PER_COUNTRY);
    }
    
    /**
     * @dev Get anti-dump constants
     */
    function getAntiDumpConstants() external pure returns (
        uint256 tier1Threshold,
        uint256 tier1ExtraFee,
        uint256 tier1Cooldown,
        uint256 tier2Threshold,
        uint256 tier2ExtraFee,
        uint256 tier2Cooldown,
        uint256 tier3Threshold,
        uint256 tier3ExtraFee,
        uint256 tier3Cooldown,
        uint256 tier4Threshold,
        uint256 tier4ExtraFee,
        uint256 tier4Cooldown
    ) {
        return (
            ANTIDUMP_TIER_1_THRESHOLD, ANTIDUMP_TIER_1_EXTRA_FEE, ANTIDUMP_TIER_1_COOLDOWN,
            ANTIDUMP_TIER_2_THRESHOLD, ANTIDUMP_TIER_2_EXTRA_FEE, ANTIDUMP_TIER_2_COOLDOWN,
            ANTIDUMP_TIER_3_THRESHOLD, ANTIDUMP_TIER_3_EXTRA_FEE, ANTIDUMP_TIER_3_COOLDOWN,
            ANTIDUMP_TIER_4_THRESHOLD, ANTIDUMP_TIER_4_EXTRA_FEE, ANTIDUMP_TIER_4_COOLDOWN
        );
    }
    
    // ============ UTILITY FUNCTIONS ============
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }
}
