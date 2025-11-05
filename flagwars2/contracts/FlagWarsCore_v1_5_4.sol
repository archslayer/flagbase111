// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FlagWars Core v1.5.4 - STATIC κ/λ Model + Wallet Setters + listCountries
 * @dev STATIC Half-Step Pricing Model with corrected KAPPA/LAMBDA constants
 */
contract FlagWarsCore_v1_5_4 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    
    // ============ CONSTANTS ============
    uint256 constant KAPPA_TICKS = 55_000;           // 0.00055 * 1e8 - FIXED
    uint256 constant LAMBDA_TICKS = 55_550;          // 0.0005555 * 1e8 - FIXED
    uint64 public constant PRICE_MIN = 1000000;     // 0.01 * 1e8
    uint64 public constant PRICE_PRECISION = 1e8;
    uint64 public constant SELL_FEE_BPS = 500;      // 5%
    uint32 public constant TOTAL_SUPPLY_PER_COUNTRY = 50000;
    
    // Attack fee bands (USDC 6 decimals)
    uint256 constant ATTACK_FEE_BAND_1 = 300000;    // 0.30 USDC
    uint256 constant ATTACK_FEE_BAND_2 = 350000;    // 0.35 USDC
    uint256 constant ATTACK_FEE_BAND_3 = 400000;    // 0.40 USDC
    uint256 constant ATTACK_FEE_BAND_4 = 450000;    // 0.45 USDC
    
    // Attack delta bands (8 decimals)
    uint256 constant ATTACK_DELTA_BAND_1 = 110000;  // 0.0011 * 1e8
    uint256 constant ATTACK_DELTA_BAND_2 = 90000;   // 0.0009 * 1e8
    uint256 constant ATTACK_DELTA_BAND_3 = 70000;   // 0.0007 * 1e8
    uint256 constant ATTACK_DELTA_BAND_4 = 50000;   // 0.0005 * 1e8
    
    // Price thresholds for bands (8 decimals)
    uint256 constant BAND_1_THRESHOLD = 1000000000; // 10.00 USDC
    uint256 constant BAND_2_THRESHOLD = 2000000000; // 20.00 USDC
    uint256 constant BAND_3_THRESHOLD = 3000000000; // 30.00 USDC
    
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
    
    // ============ STATE VARIABLES ============
    mapping(uint256 => Country) public countries;
    mapping(address => mapping(uint256 => uint32)) public userBalances; // user -> country -> amount
    mapping(uint256 => uint32) public remainingSupply; // country -> remaining treasury supply
    mapping(uint256 => bool) public countryTouched;
    
    Config public config;
    uint256 public nextCountryId = 1;
    
    // Wallet addresses
    address public treasuryWallet;
    address public revenueWallet;
    address public commissionsWallet;
    
    // ============ EVENTS ============
    event CountryCreated(uint256 indexed countryId, string name, address token);
    event PriceSeeded(uint256 indexed countryId, uint64 priceFp);
    event RemainingInit(uint256 indexed countryId, uint32 amount);
    event Attack(address indexed attacker, uint256 indexed attackerId, uint256 indexed targetId, uint256 delta, uint256 feeUSDC6, uint256 attackerPriceAfter, uint256 targetPriceAfter);
    
    event Buy(
        address indexed user, 
        uint256 indexed countryId, 
        uint32 amount, 
        uint64 unitPrice1e8, 
        uint64 priceAfter1e8, 
        uint32 userBalanceAfter, 
        uint32 remainingAfter, 
        uint256 totalCostUSDC6
    );
    
    event Sell(
        address indexed user, 
        uint256 indexed countryId, 
        uint32 amount, 
        uint64 unitPrice1e8, 
        uint64 priceAfter1e8, 
        uint32 userBalanceAfter, 
        uint32 remainingAfter, 
        uint256 netProceedsUSDC6, 
        uint256 feeUSDC6
    );
    
    // ============ CONSTRUCTOR ============
    constructor(address _payToken) {
        config = Config({
            payToken: _payToken
        });
        
        // Static spec guards - fail fast if constants are wrong
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
     * @param countryId Country to buy from
     * @param amount Amount to buy (integer only, decimals=0)
     */
    function buy(uint256 countryId, uint256 amount, uint256 minOut, uint256 deadline) 
        external 
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
            userBalances[msg.sender][countryId],
            remainingSupply[countryId],
            usdcAmount
        );
    }
    
    // ============ SELL FUNCTION ============
    /**
     * @dev Sell tokens using STATIC half-step model  
     * @param countryId Country to sell to
     * @param amount Amount to sell (integer only, decimals=0)
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
        
        // STATIC pricing: P_sell = P - λ/2
        uint256 unitPrice = c.price - (LAMBDA_TICKS / 2);
        uint256 grossProceeds = unitPrice * amount;
        
        // Apply 5% sell fee
        uint256 fee = (grossProceeds * SELL_FEE_BPS) / 10000;
        uint256 netProceeds = grossProceeds - fee;
        
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
        
        emit Sell(
            msg.sender,
            countryId,
            uint32(amount),
            uint64(unitPrice),
            uint64(c.price),
            userBalances[msg.sender][countryId],
            remainingSupply[countryId],
            usdcProceeds,
            fee / 100 // Convert fee to USDC 6 decimals
        );
    }
    
    // ============ COUNTRY MANAGEMENT ============
    /**
     * @dev Create new country
     */
    function createCountry(string memory name, address token) external {
        uint256 countryId = nextCountryId++;
        countries[countryId] = Country({
            name: name,
            token: token,
            price: 0, // Start with 0 price for seeding
            attacks: 0,
            exists: true
        });
        
        // Initialize treasury supply
        remainingSupply[countryId] = TOTAL_SUPPLY_PER_COUNTRY;
        
        emit CountryCreated(countryId, name, token);
    }
    
    /**
     * @dev Seed country price (owner-only)
     */
    function seedCountryPrice(uint256 countryId, uint64 priceFp) external onlyOwner {
        Country storage c = countries[countryId];
        require(c.exists, "CountryNotExists");
        
        // Security conditions for seeding
        require(c.price == 0, "PriceAlreadySet");
        require(!countryTouched[countryId], "CountryAlreadyTouched");
        require(priceFp == 5e8, "InvalidSeedPrice"); // Must be exactly 5.00 USDC
        
        // Set the seed price
        c.price = priceFp;
        
        emit PriceSeeded(countryId, priceFp);
    }
    
    /**
     * @dev Initialize remaining supply for existing countries (migration)
     */
    function initRemaining(uint256 countryId) external onlyOwner {
        require(remainingSupply[countryId] == 0, "AlreadyInit");
        remainingSupply[countryId] = TOTAL_SUPPLY_PER_COUNTRY;
        emit RemainingInit(countryId, TOTAL_SUPPLY_PER_COUNTRY);
    }
    
    // ============ VIEW FUNCTIONS ============
    /**
     * @dev Get country info
     */
    function getCountryInfo(uint256 countryId) external view returns (
        string memory name,
        address token,
        uint256 price,
        uint256 attacks,
        bool exists
    ) {
        Country memory c = countries[countryId];
        return (c.name, c.token, c.price, c.attacks, c.exists);
    }
    
    /**
     * @dev Get user balance for country
     */
    function getUserBalance(address user, uint256 countryId) external view returns (uint32) {
        return userBalances[user][countryId];
    }
    
    /**
     * @dev Get remaining supply for country
     */
    function getRemainingSupply(uint256 countryId) external view returns (uint32) {
        return remainingSupply[countryId];
    }
    
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
     * @dev Get sell price for amount
     */
    function getSellPrice(uint256 countryId, uint256 amount) external view returns (uint256) {
        Country memory c = countries[countryId];
        require(c.exists, "CountryNotExists");
        
        uint256 unitPrice = c.price - (LAMBDA_TICKS / 2);
        uint256 grossProceeds = unitPrice * amount;
        uint256 fee = (grossProceeds * SELL_FEE_BPS) / 10000;
        return grossProceeds - fee;
    }
    
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
        uint256 delta = _selectDelta(a.price);
        uint256 feeUSDC6 = _selectAttackFee(a.price);
        
        // Collect fee
        _collectUSDC(msg.sender, feeUSDC6);
        
        // Apply price changes
        uint256 aAfter = a.price + delta;
        uint256 tAfter = t.price > delta ? (t.price - delta) : PRICE_MIN;
        
        a.price = aAfter;
        t.price = tAfter;
        
        // Increment attack counter
        a.attacks++;
        
        emit Attack(msg.sender, attackerId, targetId, delta, feeUSDC6, aAfter, tAfter);
    }
    
    /**
     * @dev Select delta based on attacker price band
     */
    function _selectDelta(uint256 price) internal pure returns (uint256) {
        if (price < BAND_1_THRESHOLD) {
            return ATTACK_DELTA_BAND_1; // 0.0011 * 1e8
        } else if (price < BAND_2_THRESHOLD) {
            return ATTACK_DELTA_BAND_2; // 0.0009 * 1e8
        } else if (price < BAND_3_THRESHOLD) {
            return ATTACK_DELTA_BAND_3; // 0.0007 * 1e8
        } else {
            return ATTACK_DELTA_BAND_4; // 0.0005 * 1e8
        }
    }
    
    /**
     * @dev Select attack fee based on attacker price band
     */
    function _selectAttackFee(uint256 price) internal pure returns (uint256) {
        if (price < BAND_1_THRESHOLD) {
            return ATTACK_FEE_BAND_1; // 0.30 USDC
        } else if (price < BAND_2_THRESHOLD) {
            return ATTACK_FEE_BAND_2; // 0.35 USDC
        } else if (price < BAND_3_THRESHOLD) {
            return ATTACK_FEE_BAND_3; // 0.40 USDC
        } else {
            return ATTACK_FEE_BAND_4; // 0.45 USDC
        }
    }
    
    /**
     * @dev Collect USDC from user
     */
    function _collectUSDC(address user, uint256 amountUSDC6) internal {
        if (amountUSDC6 > 0) {
            IERC20(config.payToken).safeTransferFrom(user, address(this), amountUSDC6);
        }
    }
    
    // ============ WALLET SETTERS ============
    /**
     * @dev Set treasury wallet
     */
    function setTreasuryWallet(address _treasuryWallet) external onlyOwner {
        treasuryWallet = _treasuryWallet;
        emit TreasuryWalletUpdated(_treasuryWallet);
    }
    
    /**
     * @dev Set revenue wallet
     */
    function setRevenueWallet(address _revenueWallet) external onlyOwner {
        revenueWallet = _revenueWallet;
        emit RevenueWalletUpdated(_revenueWallet);
    }
    
    /**
     * @dev Set commissions wallet
     */
    function setCommissionsWallet(address _commissionsWallet) external onlyOwner {
        commissionsWallet = _commissionsWallet;
        emit CommissionsWalletUpdated(_commissionsWallet);
    }
    
    // ============ COUNTRY LISTING ============
    /**
     * @dev List all countries
     */
    function listCountries() external view returns (uint256[] memory) {
        uint256[] memory countryIds = new uint256[](nextCountryId);
        uint256 count = 0;
        
        for (uint256 i = 0; i < nextCountryId; i++) {
            if (countries[i].exists) {
                countryIds[count] = i;
                count++;
            }
        }
        
        // Resize array to actual count
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = countryIds[i];
        }
        
        return result;
    }
    
    // ============ EVENTS ============
    event TreasuryWalletUpdated(address indexed treasuryWallet);
    event RevenueWalletUpdated(address indexed revenueWallet);
    event CommissionsWalletUpdated(address indexed commissionsWallet);
    
    // ============ UTILITY FUNCTIONS ============
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }
}
