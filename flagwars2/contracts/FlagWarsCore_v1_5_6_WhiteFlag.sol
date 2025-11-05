// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title FlagWars Core v1.5.6 with White Flag Protection
 * @dev Enhanced version with White Flag market safety mechanics
 * @author FlagWars Team
 */
contract FlagWarsCore_v1_5_6_WhiteFlag is ReentrancyGuard, Ownable {
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
    
    // White Flag constants (configurable)
    uint256 public wf1CountryThreshold = 100;        // Max flags per country per day
    uint256 public wf1GlobalThreshold = 250;         // Max flags total per day
    uint256 public wf1CooldownHours = 24;            // Cooldown duration in hours
    uint256 public wf2NetSoldThreshold = 4000;       // Net sold threshold for halt
    uint256 public wf2HaltHours = 8;                 // Halt duration in hours
    
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
        bool isWhiteFlagHalted; // WF2 halt status
        uint256 whiteFlagHaltedAt; // Timestamp when halted
    }
    
    struct Config {
        address payToken; // USDC address
        address whiteFlagService; // Backend service address for callbacks
    }
    
    // Anti-dump cooldown tracking
    struct CooldownInfo {
        uint256 lastSellTime;
        uint256 cooldownEndTime;
        uint256 tierApplied;
    }
    
    // White Flag day tracking
    struct WalletDayData {
        uint256 countrySellCount;
        uint256 totalSellCount;
        uint256 dayTimestamp;
    }
    
    struct CountryDayData {
        uint256 sellCount;
        uint256 buyCount;
        uint256 netSold;
        uint256 dayTimestamp;
        bool isHalted;
        uint256 haltedAt;
    }
    
    // ============ STATE VARIABLES ============
    mapping(uint256 => Country) public countries;
    mapping(address => mapping(uint256 => uint32)) public userBalances; // user -> country -> amount
    mapping(uint256 => uint32) public remainingSupply; // country -> remaining treasury supply
    mapping(uint256 => bool) public countryTouched;
    
    // Anti-dump cooldown tracking: user -> country -> cooldown info
    mapping(address => mapping(uint256 => CooldownInfo)) public cooldowns;
    
    // White Flag tracking: user -> country -> day data
    mapping(address => mapping(uint256 => WalletDayData)) public walletDayData;
    mapping(uint256 => CountryDayData) public countryDayData;
    
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
    
    // White Flag events
    event WhiteFlagHalt(
        uint256 indexed countryId,
        uint256 netSold,
        uint256 threshold,
        uint256 haltDurationHours
    );
    
    event WhiteFlagResume(
        uint256 indexed countryId,
        uint256 resumedAt
    );
    
    event WhiteFlagConfigUpdated(
        string configKey,
        uint256 oldValue,
        uint256 newValue
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
    
    // ============ WHITE FLAG HELPERS ============
    /**
     * @dev Get current UTC day timestamp (00:00:00 UTC)
     */
    function getCurrentDay() internal view returns (uint256) {
        // Get current timestamp and round down to start of UTC day
        uint256 timestamp = block.timestamp;
        uint256 day = (timestamp / 86400) * 86400; // 86400 seconds in a day
        return day;
    }
    
    /**
     * @dev Check if a country is White Flag halted
     */
    function isCountryWhiteFlagHalted(uint256 countryId) public view returns (bool) {
        Country storage country = countries[countryId];
        if (!country.isWhiteFlagHalted) return false;
        
        // Check if halt period has expired
        uint256 haltEndTime = country.whiteFlagHaltedAt + (wf2HaltHours * 3600);
        return block.timestamp < haltEndTime;
    }
    
    /**
     * @dev Check WF1 cooldown for a wallet
     */
    function checkWF1Cooldown(address wallet, uint256 countryId) public view returns (bool, uint256) {
        uint256 currentDay = getCurrentDay();
        WalletDayData storage data = walletDayData[wallet][countryId];
        
        // Check if data is for today
        if (data.dayTimestamp != currentDay) return (false, 0);
        
        // Check country-specific threshold
        if (data.countrySellCount >= wf1CountryThreshold) {
            uint256 cooldownEndTime = currentDay + (wf1CooldownHours * 3600);
            return (block.timestamp < cooldownEndTime, cooldownEndTime);
        }
        
        // Check global threshold
        if (data.totalSellCount >= wf1GlobalThreshold) {
            uint256 cooldownEndTime = currentDay + (wf1CooldownHours * 3600);
            return (block.timestamp < cooldownEndTime, cooldownEndTime);
        }
        
        return (false, 0);
    }
    
    /**
     * @dev Update wallet day data
     */
    function updateWalletDayData(address wallet, uint256 countryId, uint256 amount, bool isSell) internal {
        uint256 currentDay = getCurrentDay();
        WalletDayData storage data = walletDayData[wallet][countryId];
        
        // Reset if new day
        if (data.dayTimestamp != currentDay) {
            data.dayTimestamp = currentDay;
            data.countrySellCount = 0;
            data.totalSellCount = 0;
        }
        
        if (isSell) {
            data.countrySellCount += amount;
            data.totalSellCount += amount;
        }
    }
    
    /**
     * @dev Update country day data and check for WF2 halt
     */
    function updateCountryDayData(uint256 countryId, uint256 amount, bool isSell) internal {
        uint256 currentDay = getCurrentDay();
        CountryDayData storage data = countryDayData[countryId];
        
        // Reset if new day
        if (data.dayTimestamp != currentDay) {
            data.dayTimestamp = currentDay;
            data.sellCount = 0;
            data.buyCount = 0;
            data.netSold = 0;
            data.isHalted = false;
            data.haltedAt = 0;
            
            // Reset country halt status
            countries[countryId].isWhiteFlagHalted = false;
            countries[countryId].whiteFlagHaltedAt = 0;
        }
        
        // Update counters
        if (isSell) {
            data.sellCount += amount;
            data.netSold += amount;
        } else {
            data.buyCount += amount;
            data.netSold = data.sellCount > data.buyCount ? data.sellCount - data.buyCount : 0;
        }
        
        // Check for WF2 halt
        if (!data.isHalted && data.netSold > wf2NetSoldThreshold) {
            data.isHalted = true;
            data.haltedAt = block.timestamp;
            countries[countryId].isWhiteFlagHalted = true;
            countries[countryId].whiteFlagHaltedAt = block.timestamp;
            
            emit WhiteFlagHalt(countryId, data.netSold, wf2NetSoldThreshold, wf2HaltHours);
        }
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
        
        // Check White Flag halt (WF2)
        require(!isCountryWhiteFlagHalted(countryId), "CountryWhiteFlagHalted");
        
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
        
        // Update White Flag data
        updateCountryDayData(countryId, amount, false);
        
        emit Buy(
            msg.sender,
            countryId,
            uint32(amount),
            uint64(unitPrice),
            uint64(c.price),
            totalCost
        );
    }
    
    // ============ SELL FUNCTION WITH ANTI-DUMP + WHITE FLAG ============
    /**
     * @dev Sell tokens with anti-dump protection and White Flag mechanics
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
        
        // Check White Flag halt (WF2)
        require(!isCountryWhiteFlagHalted(countryId), "CountryWhiteFlagHalted");
        
        // Check WF1 cooldown
        (bool inCooldown, uint256 cooldownEndTime) = checkWF1Cooldown(msg.sender, countryId);
        require(!inCooldown, "WhiteFlagCooldownActive");
        
        // Check anti-dump cooldown
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
        
        // Set anti-dump cooldown
        cooldown.lastSellTime = block.timestamp;
        cooldown.cooldownEndTime = block.timestamp + cooldownSeconds;
        cooldown.tierApplied = tierApplied;
        
        // Update White Flag data
        updateWalletDayData(msg.sender, countryId, amount, true);
        updateCountryDayData(countryId, amount, true);
        
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
    
    // ============ ATTACK FUNCTIONS ============
    /**
     * @dev Attack function with band-based fees and deltas
     */
    function attack(uint256 attackerId, uint256 targetId) external nonReentrant {
        if (attackerId == targetId) revert("SelfAttack");
        
        Country storage a = countries[attackerId];
        Country storage t = countries[targetId];
        if (!a.exists || !t.exists) revert("CountryNotFound");
        
        // Check if target is White Flag halted
        require(!isCountryWhiteFlagHalted(targetId), "TargetCountryWhiteFlagHalted");
        
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
        countries[countryId] = Country(name, token, PRICE_MIN, 0, true, false, 0);
        remainingSupply[countryId] = TOTAL_SUPPLY_PER_COUNTRY;
    }
    
    /**
     * @dev Set payment token
     */
    function setPayToken(address payToken) external onlyOwner {
        config.payToken = payToken;
    }
    
    /**
     * @dev Set White Flag service address
     */
    function setWhiteFlagService(address whiteFlagService) external onlyOwner {
        config.whiteFlagService = whiteFlagService;
    }
    
    /**
     * @dev Update White Flag configuration
     */
    function updateWhiteFlagConfig(
        string calldata configKey,
        uint256 newValue
    ) external onlyOwner {
        uint256 oldValue;
        
        if (keccak256(abi.encodePacked(configKey)) == keccak256(abi.encodePacked("wf1_country_threshold"))) {
            oldValue = wf1CountryThreshold;
            wf1CountryThreshold = newValue;
        } else if (keccak256(abi.encodePacked(configKey)) == keccak256(abi.encodePacked("wf1_global_threshold"))) {
            oldValue = wf1GlobalThreshold;
            wf1GlobalThreshold = newValue;
        } else if (keccak256(abi.encodePacked(configKey)) == keccak256(abi.encodePacked("wf1_cooldown_hours"))) {
            oldValue = wf1CooldownHours;
            wf1CooldownHours = newValue;
        } else if (keccak256(abi.encodePacked(configKey)) == keccak256(abi.encodePacked("wf2_net_sold_threshold"))) {
            oldValue = wf2NetSoldThreshold;
            wf2NetSoldThreshold = newValue;
        } else if (keccak256(abi.encodePacked(configKey)) == keccak256(abi.encodePacked("wf2_halt_hours"))) {
            oldValue = wf2HaltHours;
            wf2HaltHours = newValue;
        } else {
            revert("InvalidConfigKey");
        }
        
        emit WhiteFlagConfigUpdated(configKey, oldValue, newValue);
    }
    
    /**
     * @dev Manually resume a White Flag halted country (admin override)
     */
    function resumeCountry(uint256 countryId) external onlyOwner {
        require(countries[countryId].exists, "CountryNotExists");
        require(countries[countryId].isWhiteFlagHalted, "CountryNotHalted");
        
        countries[countryId].isWhiteFlagHalted = false;
        countries[countryId].whiteFlagHaltedAt = 0;
        
        emit WhiteFlagResume(countryId, block.timestamp);
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
    
    /**
     * @dev Get White Flag constants
     */
    function getWhiteFlagConstants() external view returns (
        uint256 countryThreshold,
        uint256 globalThreshold,
        uint256 cooldownHours,
        uint256 netSoldThreshold,
        uint256 haltHours
    ) {
        return (
            wf1CountryThreshold,
            wf1GlobalThreshold,
            wf1CooldownHours,
            wf2NetSoldThreshold,
            wf2HaltHours
        );
    }
    
    /**
     * @dev Get wallet day data for White Flag tracking
     */
    function getWalletDayData(address wallet, uint256 countryId) external view returns (
        uint256 countrySellCount,
        uint256 totalSellCount,
        uint256 dayTimestamp
    ) {
        WalletDayData storage data = walletDayData[wallet][countryId];
        return (data.countrySellCount, data.totalSellCount, data.dayTimestamp);
    }
    
    /**
     * @dev Get country day data for White Flag tracking
     */
    function getCountryDayData(uint256 countryId) external view returns (
        uint256 sellCount,
        uint256 buyCount,
        uint256 netSold,
        uint256 dayTimestamp,
        bool isHalted,
        uint256 haltedAt
    ) {
        CountryDayData storage data = countryDayData[countryId];
        return (
            data.sellCount,
            data.buyCount,
            data.netSold,
            data.dayTimestamp,
            data.isHalted,
            data.haltedAt
        );
    }
    
    // ============ UTILITY FUNCTIONS ============
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }
}
