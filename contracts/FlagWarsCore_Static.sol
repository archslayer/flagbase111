// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title FlagWarsCore - Production Ready with Full Protocol Compliance
 * @dev Implements STATIC Half-Step Pricing Model with complete spec compliance
 * @notice USDC6 (6 decimals), TOKEN18 (18 decimals), all math properly scaled
 */
contract FlagWarsCore is ReentrancyGuard, Ownable2Step, Pausable {
    using SafeERC20 for IERC20;
    
    // ============ CUSTOM ERRORS ============
    error FloorPriceViolation();
    error InsufficientTreasuryUSDC();
    error SellCooldown(uint256 until);
    error FreeAttackExhausted();
    error CountryNotExists();
    error PriceAlreadySet();
    error SupplyAlreadySet();
    error CountryAlreadyTouched();
    error InvalidSeedPrice();
    error InvalidSeedSupply();
    error InvalidAmount();
    error DeadlineExceeded();
    error SlippageExceeded();
    error MinBuyNotMet();
    error InsufficientSupply();
    error CountryAlreadyExists();
    
    // ============ IMMUTABLE SPEC CONSTANTS ============
    uint256 public constant KAPPA = 55_000;           // 0.00055 * 1e8 (8 decimals)
    uint256 public constant LAMBDA = 55_550;          // 0.0005555 * 1e8 (8 decimals)
    uint256 public constant PRICE_MIN = 1;            // 0.00000001 * 1e8 (minimum tick, 8 decimals)
    uint256 public constant PRICE_PRECISION = 1e8;    // 8 decimals
    uint256 public constant BUY_FEE_BPS = 0;          // 0%
    uint256 public constant SELL_FEE_BPS = 500;       // 5%
    uint256 public constant REFERRAL_SHARE_BPS = 3000; // 30% of fees
    uint256 public constant REVENUE_SHARE_BPS = 7000;  // 70% of fees
    uint256 public constant FREE_ATTACK_DELTA8 = 50_000; // 0.0005 in 8 decimals
    
    // Anti-dump tiers from spec
    struct AntiDumpTier {
        uint256 thresholdPctBps;  // 1000 = 10%
        uint256 extraFeeBps;      // 500 = 5%
        uint256 cooldownSec;      // 60 seconds
    }
    
    // War-balance tiers from spec
    struct WarBalanceTier {
        uint256 threshold;        // attack count
        uint256 windowSec;        // time window
        uint256 multiplierBps;    // delta multiplier (reduces delta)
    }
    
    struct WBState {
        uint256 windowStart;
        uint256 attackCount;
    }
    
    // ============ STRUCTS ============
    struct Country {
        string name;
        address token;
        uint256 price;        // Current price (8 decimals)
        uint256 totalSupply;  // Total supply (18 decimals)
        uint256 attacks;      // Attack count
        bool exists;
    }
    
    struct Config {
        address payToken;     // USDC address
        address treasury;     // Treasury wallet
        address revenue;      // Revenue wallet  
        address commissions;  // Commissions wallet
        uint256 entryFeeBps;
        uint256 sellFeeBps;
    }
    
    struct UserState {
        uint8 freeAttacksUsed;    // Free attack counter (max 2)
    }
    
    struct AttackItem {
        uint256 fromId;
        uint256 toId;
    }
    
    // ============ STATE VARIABLES ============
    Config public config;
    mapping(uint256 => Country) public countries;
    mapping(uint256 => bool) public countryTouched;
    mapping(address => UserState) public userState;
    
    // Anti-dump: country-based cooldown
    mapping(address => mapping(uint256 => uint256)) public userCooldownUntil; // user -> countryId -> timestamp
    mapping(address => mapping(uint256 => uint8)) public userLastTier; // user -> countryId -> tier
    
    // War-balance: target country-based counters
    mapping(uint256 => WBState) public wb1ByTarget; // countryId -> state
    mapping(uint256 => WBState) public wb2ByTarget; // countryId -> state
    
    // Pull pattern for fee withdrawals (security: prevents reentrancy)
    mapping(address => uint256) public pendingWithdrawals; // recipient -> amount
    
    uint256 public nextCountryId = 1;
    
    // Anti-dump tiers (from spec)
    AntiDumpTier[] public antiDumpTiers;
    
    // War-balance tiers (from spec)  
    WarBalanceTier public wb1Tier;
    WarBalanceTier public wb2Tier;
    
    // ============ EVENTS ============
    event CountryCreated(uint256 indexed countryId, string name, address token);
    event Buy(uint256 indexed countryId, address indexed buyer, uint256 amountToken18, uint256 priceUSDC8, uint256 totalCostUSDC6);
    event Sell(uint256 indexed countryId, address indexed seller, uint256 amountToken18, uint256 priceUSDC8, uint256 proceedsUSDC6);
    event Attack(uint256 indexed fromId, uint256 indexed toId, address indexed attacker, uint256 feeUSDC6, uint256 deltaPrice8);
    event FreeAttackUsed(address indexed user, uint256 fromId, uint256 toId, uint8 usedCount, uint256 timestamp);
    event PriceSeeded(uint256 indexed countryId, uint256 priceUSDC6);
    event SupplySeeded(uint256 indexed countryId, uint256 initialSupplyToken18);
    event ConfigUpdated(address indexed payToken, address indexed treasury, address indexed revenue, address commissions);
    event AntiDumpApplied(address indexed user, uint256 extraFeeUSDC6, uint256 cooldownSec);
    event WarBalanceApplied(address indexed user, uint256 tier, uint256 multiplierBps);
    event FeeDistributed(bytes32 indexed kind, uint256 amount, address indexed to);
    event FeeWithdrawn(address indexed to, uint256 amount);
    event TokensDeposited(uint256 indexed countryId, uint256 amount);
    
    // ============ CONSTRUCTOR ============
    constructor(
        address _payToken,
        address _treasury,
        address _revenue,
        address _commissions
    ) Ownable2Step() {
        // Zero-address validation
        require(_payToken != address(0), "zero addr");
        require(_revenue != address(0), "zero addr");
        require(_commissions != address(0), "zero addr");
        
        config = Config({
            payToken: _payToken,
            treasury: address(this), // Treasury is always the contract itself
            revenue: _revenue,
            commissions: _commissions,
            entryFeeBps: BUY_FEE_BPS,
            sellFeeBps: SELL_FEE_BPS
        });
        
        // Initialize anti-dump tiers from spec
        antiDumpTiers.push(AntiDumpTier(1000, 500, 60));     // 10% -> 5% fee, 60s cooldown
        antiDumpTiers.push(AntiDumpTier(1500, 800, 300));    // 15% -> 8% fee, 5m cooldown
        antiDumpTiers.push(AntiDumpTier(2000, 1200, 1200));  // 20% -> 12% fee, 20m cooldown
        antiDumpTiers.push(AntiDumpTier(2500, 1500, 14400)); // 25% -> 15% fee, 4h cooldown
        
        // Initialize war-balance tiers from spec
        wb1Tier = WarBalanceTier(2000, 300, 6000);   // 2000 attacks in 5min -> 60% multiplier
        wb2Tier = WarBalanceTier(10000, 3600, 8000); // 10000 attacks in 1h -> 80% multiplier
    }
    
    // ============ BUY FUNCTION ============
    /**
     * @dev Buy tokens using STATIC half-step model
     * @param countryId Country to buy from
     * @param amountToken18 Amount to buy (18 decimals)
     * @param maxInUSDC6 Maximum cost willing to pay (6 decimals)
     * @param deadline Transaction deadline
     */
    function buy(
        uint256 countryId, 
        uint256 amountToken18, 
        uint256 maxInUSDC6, 
        uint256 deadline
    ) external nonReentrant whenNotPaused {
        // Checks
        if (block.timestamp > deadline) revert DeadlineExceeded();
        if (amountToken18 == 0) revert InvalidAmount();
        
        Country storage c = countries[countryId];
        if (!c.exists) revert CountryNotExists();
        
        // Price calculation (8 decimals)
        uint256 unitPrice8 = c.price + (KAPPA / 2);
        uint256 totalCost8 = (unitPrice8 * amountToken18) / 1e18;
        
        // Convert to USDC6 (8 decimals -> 6 decimals)
        uint256 totalCostUSDC6 = totalCost8 / 100; // Divide by 1e2
        
        // Enforce minimum buy amount from spec
        if (totalCostUSDC6 < 1e4) revert MinBuyNotMet(); // 0.01 USDC6 = 10000
        
        // Slippage protection - user specifies maximum they're willing to pay
        if (totalCostUSDC6 > maxInUSDC6) revert SlippageExceeded();
        
        // Check supply availability
        if (c.totalSupply < amountToken18) revert InsufficientSupply();
        
        // CHECKS: Collect payment first (CEI pattern)
        IERC20(config.payToken).safeTransferFrom(msg.sender, address(this), totalCostUSDC6);
        
        // EFFECTS: Update state (before external interactions)
        c.price = max(PRICE_MIN, c.price + (KAPPA * amountToken18) / 1e18);
        c.totalSupply -= amountToken18; // Arz azalır (contract rezervinden kullanıcıya gider)
        countryTouched[countryId] = true;
        
        // Fee calculation and accrual (pull pattern - accumulate, don't transfer immediately)
        uint256 totalFee = (totalCostUSDC6 * config.entryFeeBps) / 10000;
        if (totalFee > 0) {
            uint256 referralFee = (totalFee * REFERRAL_SHARE_BPS) / 10000;
            uint256 revenueFee = totalFee - referralFee;
            
            if (referralFee > 0) {
                pendingWithdrawals[config.commissions] += referralFee;
                emit FeeDistributed(bytes32("buy_referral"), referralFee, config.commissions);
            }
            if (revenueFee > 0) {
                pendingWithdrawals[config.revenue] += revenueFee;
                emit FeeDistributed(bytes32("buy_revenue"), revenueFee, config.revenue);
            }
        }
        
        // INTERACTIONS: Transfer tokens to user (from contract reserve)
        // Use safeTransfer (not safeTransferFrom) since tokens are owned by contract
        IERC20(c.token).safeTransfer(msg.sender, amountToken18);
        
        emit Buy(countryId, msg.sender, amountToken18, unitPrice8, totalCostUSDC6);
    }
    
    // ============ SELL FUNCTION ============
    /**
     * @dev Sell tokens using STATIC half-step model
     * @param countryId Country to sell to
     * @param amountToken18 Amount to sell (18 decimals)
     * @param minOutUSDC6 Minimum output expected (6 decimals)
     * @param deadline Transaction deadline
     */
    function sell(
        uint256 countryId, 
        uint256 amountToken18, 
        uint256 minOutUSDC6, 
        uint256 deadline
    ) external nonReentrant whenNotPaused {
        // Checks
        if (block.timestamp > deadline) revert DeadlineExceeded();
        if (amountToken18 == 0) revert InvalidAmount();
        
        Country storage c = countries[countryId];
        if (!c.exists) revert CountryNotExists();
        
        // Price calculation (8 decimals) - prevent underflow
        uint256 basePrice = c.price;
        uint256 unitPrice8 = basePrice > (LAMBDA / 2)
            ? basePrice - (LAMBDA / 2)
            : PRICE_MIN; // Clamp to minimum price if underflow would occur
        uint256 grossProceeds8 = (unitPrice8 * amountToken18) / 1e18;
        
        // Convert to USDC6 (8 decimals -> 6 decimals)
        uint256 grossProceedsUSDC6 = grossProceeds8 / 100;
        
        // Floor price enforcement (check gross proceeds, not net)
        uint256 minProceedsUSDC6 = (PRICE_MIN * amountToken18) / (1e18 * 100); // Convert 8->6 decimals
        if (grossProceedsUSDC6 < minProceedsUSDC6) revert FloorPriceViolation();
        
        // Apply sell fee using config (configurable)
        uint256 feeUSDC6 = (grossProceedsUSDC6 * config.sellFeeBps) / 10000;
        uint256 netProceedsUSDC6 = grossProceedsUSDC6 - feeUSDC6;
        
        // Anti-dump check and application (calculate final proceeds and extra fee)
        uint256 extraFeeUSDC6;
        uint256 finalProceedsUSDC6;
        (finalProceedsUSDC6, extraFeeUSDC6) = _applyAntiDump(msg.sender, countryId, amountToken18, netProceedsUSDC6);
        
        // Contract USDC balance check AFTER anti-dump (check final amount to be paid)
        if (IERC20(config.payToken).balanceOf(address(this)) < finalProceedsUSDC6) {
            revert InsufficientTreasuryUSDC();
        }
        
        // Slippage protection
        if (finalProceedsUSDC6 < minOutUSDC6) revert SlippageExceeded();
        
        // CHECKS: Collect tokens from user first
        IERC20(c.token).safeTransferFrom(msg.sender, address(this), amountToken18);
        
        // EFFECTS: Update state (before external interactions)
        c.price = max(PRICE_MIN, c.price - (LAMBDA * amountToken18) / 1e18);
        c.totalSupply += amountToken18; // Arz artar (kullanıcıdan contract'a gider)
        countryTouched[countryId] = true;
        
        // Accrue fees using pull pattern (don't transfer immediately)
        if (feeUSDC6 > 0) {
            uint256 referralFee = (feeUSDC6 * REFERRAL_SHARE_BPS) / 10000;
            uint256 revenueFee = feeUSDC6 - referralFee;
            
            if (referralFee > 0) {
                pendingWithdrawals[config.commissions] += referralFee;
                emit FeeDistributed(bytes32("sell_referral"), referralFee, config.commissions);
            }
            if (revenueFee > 0) {
                pendingWithdrawals[config.revenue] += revenueFee;
                emit FeeDistributed(bytes32("sell_revenue"), revenueFee, config.revenue);
            }
        }
        
        // Accrue anti-dump extra fee (pull pattern)
        if (extraFeeUSDC6 > 0) {
            pendingWithdrawals[config.revenue] += extraFeeUSDC6;
            emit FeeDistributed(bytes32("anti_dump"), extraFeeUSDC6, config.revenue);
        }
        
        // INTERACTIONS: Transfer USDC from contract to user (after state updates)
        IERC20(config.payToken).safeTransfer(msg.sender, finalProceedsUSDC6);
        
        emit Sell(countryId, msg.sender, amountToken18, unitPrice8, finalProceedsUSDC6);
    }
    
    // ============ ATTACK FUNCTION ============
    /**
     * @dev Launch attack between countries
     * @param fromId Source country ID
     * @param toId Target country ID
     * @notice Each attack is a fixed single attack. No amount parameter.
     * @notice Attacker must own at least 1 token of their country to prevent abuse.
     */
    function attack(
        uint256 fromId,
        uint256 toId
    ) external nonReentrant whenNotPaused {
        Country storage fromCountry = countries[fromId];
        Country storage toCountry = countries[toId];
        
        if (!fromCountry.exists || !toCountry.exists) revert CountryNotExists();
        
        // Prevent self-attack
        if (fromId == toId) revert InvalidAmount();
        
        // 1) Ensure attacker owns at least 1 token of their country
        uint256 bal = IERC20(fromCountry.token).balanceOf(msg.sender);
        if (bal < 1e18) revert InvalidAmount();
        
        // 2) Calculate tier-based base fee + base delta
        uint256 feeUSDC6 = _calculateAttackFee(fromCountry.price);
        uint256 deltaPrice8 = _calculateAttackDelta(fromCountry.price);
        
        // 3) Free attack: fee=0 and delta=0.0005
        UserState storage u = userState[msg.sender];
        bool isFree = u.freeAttacksUsed < 2;
        if (isFree) {
            feeUSDC6 = 0;
            deltaPrice8 = FREE_ATTACK_DELTA8; // 0.0005 fixed for free attacks
            u.freeAttacksUsed++;
            emit FreeAttackUsed(msg.sender, fromId, toId, u.freeAttacksUsed, block.timestamp);
        }
        
        // 4) Apply war-balance delta reduction (target country-based)
        deltaPrice8 = _applyDeltaWithWarBalance(toId, deltaPrice8);
        
        // CHECKS: Collect fee (if not free) - from user to contract
        if (feeUSDC6 > 0) {
            IERC20(config.payToken).safeTransferFrom(msg.sender, address(this), feeUSDC6);
        }
        
        // EFFECTS: Update state (before external interactions)
        fromCountry.price = max(PRICE_MIN, fromCountry.price + deltaPrice8);
        toCountry.price = max(PRICE_MIN, toCountry.price - deltaPrice8);
        fromCountry.attacks++;
        toCountry.attacks++;
        
        // Accrue fee using pull pattern (don't transfer immediately)
        if (feeUSDC6 > 0) {
            pendingWithdrawals[config.revenue] += feeUSDC6;
            emit FeeDistributed(bytes32("attack"), feeUSDC6, config.revenue);
        }
        
        emit Attack(fromId, toId, msg.sender, feeUSDC6, deltaPrice8);
    }
    
    /**
     * @dev Batch attack - execute multiple attacks in one transaction
     * @param items Array of attack items (fromId, toId)
     * @notice Each attack applies tier-based fee and delta
     * @notice Total fee = baseFee * 5, total delta = baseDelta * 5
     */
    function attackBatch(
        AttackItem[] calldata items
    ) external nonReentrant whenNotPaused {
        if (items.length != 5) revert InvalidAmount(); // Only 5x batch allowed
        
        // CHECKS: Validate all items first (no external calls in loop)
        for (uint256 i = 0; i < items.length; i++) {
            uint256 fromId = items[i].fromId;
            uint256 toId = items[i].toId;
            
            // Prevent self-attack
            if (fromId == toId) revert InvalidAmount();
            
            Country storage fromCountry = countries[fromId];
            Country storage toCountry = countries[toId];
            
            if (!fromCountry.exists || !toCountry.exists) revert CountryNotExists();
        }
        
        // CHECKS: Validate token ownership for all unique fromIds (batch check, no loop)
        // Collect unique fromIds first
        uint256[] memory uniqueFromIds = new uint256[](items.length);
        uint256 uniqueCount = 0;
        for (uint256 i = 0; i < items.length; i++) {
            uint256 fromId = items[i].fromId;
            bool found = false;
            for (uint256 j = 0; j < uniqueCount; j++) {
                if (uniqueFromIds[j] == fromId) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                uniqueFromIds[uniqueCount] = fromId;
                uniqueCount++;
            }
        }
        
        // Validate token ownership for all unique fromIds (external calls, but outside main loop)
        for (uint256 i = 0; i < uniqueCount; i++) {
            Country storage fromCountry = countries[uniqueFromIds[i]];
            uint256 bal = IERC20(fromCountry.token).balanceOf(msg.sender);
            if (bal < 1e18) revert InvalidAmount();
        }
        
        // CHECKS: Precompute fees and deltas for all items (ensures consistency)
        // NOTE: Batch attacks never use free attacks - free attacks are only for single attack() calls
        uint256[] memory itemFee = new uint256[](items.length);
        uint256[] memory itemDelta = new uint256[](items.length);
        
        // Precompute: calculate fee and delta for each item (always paid attacks)
        for (uint256 i = 0; i < items.length; i++) {
            Country storage fromCountry = countries[items[i].fromId];
            itemFee[i] = _calculateAttackFee(fromCountry.price);
            itemDelta[i] = _calculateAttackDelta(fromCountry.price);
        }
        
        // CHECKS: Calculate total fee and collect from user (single external call)
        uint256 totalFeeUSDC6 = 0;
        for (uint256 i = 0; i < items.length; i++) {
            totalFeeUSDC6 += itemFee[i];
        }
        
        if (totalFeeUSDC6 > 0) {
            IERC20(config.payToken).safeTransferFrom(msg.sender, address(this), totalFeeUSDC6);
        }
        
        // EFFECTS: Apply all state changes using precomputed values
        for (uint256 i = 0; i < items.length; i++) {
            uint256 fromId = items[i].fromId;
            uint256 toId = items[i].toId;
            
            Country storage fromCountry = countries[fromId];
            Country storage toCountry = countries[toId];
            
            // Apply war-balance delta reduction per target (updates state)
            uint256 finalDeltaPrice8 = _applyDeltaWithWarBalance(toId, itemDelta[i]);
            
            // Apply delta to prices
            fromCountry.price = max(PRICE_MIN, fromCountry.price + finalDeltaPrice8);
            toCountry.price = max(PRICE_MIN, toCountry.price - finalDeltaPrice8);
            fromCountry.attacks++;
            toCountry.attacks++;
            
            // Emit individual attack event with precomputed fee and final delta
            emit Attack(fromId, toId, msg.sender, itemFee[i], finalDeltaPrice8);
        }
        
        // Accrue fee using pull pattern (don't transfer immediately)
        if (totalFeeUSDC6 > 0) {
            pendingWithdrawals[config.revenue] += totalFeeUSDC6;
            emit FeeDistributed(bytes32("attack_batch"), totalFeeUSDC6, config.revenue);
        }
    }
    
    // ============ INTERNAL FUNCTIONS ============
    
    /**
     * @dev Split fees according to spec (DEPRECATED - fees now accrued via pull pattern)
     * @param grossUSDC6 Gross amount in USDC6
     * @return netUSDC6 Net amount after fees
     * @notice This function is kept for compatibility but fees are now handled via pull pattern
     */
    function _splitFees(uint256 grossUSDC6) internal returns (uint256 netUSDC6) {
        // Fees are now handled in buy() function using pull pattern
        // This function is deprecated but kept for compatibility
        uint256 totalFee = (grossUSDC6 * config.entryFeeBps) / 10000;
        return grossUSDC6 - totalFee;
    }
    
    /**
     * @dev Apply anti-dump protection (country-based cooldown, reserve-based percentage)
     * @param user User address
     * @param countryId Country ID
     * @param amountToken18 Amount being sold
     * @param baseProceedsUSDC6 Base proceeds before anti-dump
     * @return finalProceedsUSDC6 Final proceeds after anti-dump
     * @return extraFeeUSDC6 Extra fee to be transferred to revenue (caller handles transfer)
     */
    function _applyAntiDump(
        address user, 
        uint256 countryId,
        uint256 amountToken18, 
        uint256 baseProceedsUSDC6
    ) internal returns (uint256 finalProceedsUSDC6, uint256 extraFeeUSDC6) {
        Country storage c = countries[countryId];
        
        // Cooldown is country-based
        if (userCooldownUntil[user][countryId] > block.timestamp) {
            revert SellCooldown(userCooldownUntil[user][countryId]);
        }
        
        // Percent of reserve (contract reserve = c.totalSupply)
        uint256 reserve = c.totalSupply;
        uint256 sellPctBps = reserve > 0 ? (amountToken18 * 10000) / reserve : 10000;
        
        // Pick tier - only apply anti-dump if threshold is met
        bool matched = false;
        uint256 tier = 0;
        for (uint256 i = antiDumpTiers.length; i > 0; i--) {
            if (sellPctBps >= antiDumpTiers[i - 1].thresholdPctBps) {
                tier = i - 1;
                matched = true;
                break;
            }
        }
        
        // If no threshold matched, no anti-dump applies (no extra fee, no cooldown)
        if (!matched) {
            return (baseProceedsUSDC6, 0);
        }
        
        AntiDumpTier memory t = antiDumpTiers[tier];
        
        // Calculate extra fee (caller will transfer it)
        extraFeeUSDC6 = (baseProceedsUSDC6 * t.extraFeeBps) / 10000;
        finalProceedsUSDC6 = baseProceedsUSDC6 - extraFeeUSDC6;
        
        // Update cooldown and tier (state changes)
        userCooldownUntil[user][countryId] = block.timestamp + t.cooldownSec;
        userLastTier[user][countryId] = uint8(tier);
        
        emit AntiDumpApplied(user, extraFeeUSDC6, t.cooldownSec);
        
        return (finalProceedsUSDC6, extraFeeUSDC6);
    }
    
    /**
     * @dev Calculate attack fee based on price tiers (from spec)
     * @param attackerPrice8 Attacker country price (8 decimals)
     * @return feeUSDC6 Attack fee in USDC6
     */
    function _calculateAttackFee(uint256 attackerPrice8) internal pure returns (uint256 feeUSDC6) {
        // Convert attacker's price from 8 decimals to USDC6 for comparison
        uint256 attackerPriceUSDC6 = attackerPrice8 / 100;
        
        // Spec tiers (3 tiers only):
        // Tier 1: ≤ 5.00 USDC -> 0.30 USDC fee
        // Tier 2: > 5.00 and < 10.00 USDC -> 0.35 USDC fee
        // Tier 3: ≥ 10.00 USDC -> 0.40 USDC fee
        if (attackerPriceUSDC6 <= 5e6) {
            return 300000;      // 0.30 USDC6 (≤ 5.00 USDC)
        } else if (attackerPriceUSDC6 < 10e6) {
            return 350000;      // 0.35 USDC6 (> 5.00 and < 10.00 USDC)
        } else {
            return 400000;      // 0.40 USDC6 (≥ 10.00 USDC)
        }
    }
    
    /**
     * @dev Calculate attack delta based on price tiers (from spec)
     * @param attackerPrice8 Attacker country price (8 decimals)
     * @return delta8 Attack delta in 8 decimals
     * @notice Spec: T1 (≤5.00) → 0.0011, T2 (>5.00 and <10.00) → 0.0009, T3 (≥10.00) → 0.0007
     */
    function _calculateAttackDelta(uint256 attackerPrice8) internal pure returns (uint256 delta8) {
        uint256 p6 = attackerPrice8 / 100; // Convert to USDC6
        if (p6 <= 5e6) return 110_000;      // T1: ≤ 5.00 → 0.0011 (110_000)
        if (p6 < 10e6) return 90_000;       // T2: > 5.00 and < 10.00 → 0.0009 (90_000)
        return 70_000;                      // T3: ≥ 10.00 → 0.0007 (70_000)
    }
    
    /**
     * @dev Apply war-balance delta reduction (target country-based)
     * @param toId Target country ID
     * @param baseDelta8 Base delta (8 decimals)
     * @return delta8 Final delta with war-balance multiplier applied
     */
    function _applyDeltaWithWarBalance(uint256 toId, uint256 baseDelta8) internal returns (uint256 delta8) {
        // Update windows
        WBState storage s1 = wb1ByTarget[toId];
        WBState storage s2 = wb2ByTarget[toId];
        
        // Roll window 1
        if (block.timestamp - s1.windowStart > wb1Tier.windowSec) {
            s1.windowStart = block.timestamp;
            s1.attackCount = 1;
        } else {
            s1.attackCount++;
        }
        
        // Roll window 2
        if (block.timestamp - s2.windowStart > wb2Tier.windowSec) {
            s2.windowStart = block.timestamp;
            s2.attackCount = 1;
        } else {
            s2.attackCount++;
        }
        
        // Pick multiplier bps that REDUCES delta (spec: 0.60 and 0.80)
        uint256 mulBps = 10000;
        uint256 appliedTier = 0;
        if (s2.attackCount >= wb2Tier.threshold) {
            mulBps = 8000;   // x0.80
            appliedTier = 2;
        } else if (s1.attackCount >= wb1Tier.threshold) {
            mulBps = 6000;   // x0.60
            appliedTier = 1;
        }
        
        // Emit war-balance event if multiplier is applied
        if (appliedTier > 0) {
            emit WarBalanceApplied(msg.sender, appliedTier, mulBps);
        }
        
        return (baseDelta8 * mulBps) / 10000;
    }
    
    /**
     * @dev Apply war-balance multipliers (DEPRECATED - kept for compatibility, not used)
     * @param user User address
     * @param baseFeeUSDC6 Base fee
     * @return finalFeeUSDC6 Final fee with multiplier
     */
    function _applyWarBalance(address user, uint256 baseFeeUSDC6) internal returns (uint256 finalFeeUSDC6) {
        // This function is deprecated - war-balance now affects delta, not fee
        return baseFeeUSDC6;
    }
    
    /**
     * @dev Update war-balance counters (DEPRECATED - kept for compatibility, not used)
     * @param user User address
     */
    function _updateWarBalanceCounters(address user) internal {
        // This function is deprecated - war-balance is now target country-based
    }
    
    /**
     * @dev Get war balance state for a target country
     * @param countryId Target country ID
     * @return wb1Count WB1 attack count for this target
     * @return wb1Threshold WB1 threshold
     * @return wb1RemainSec WB1 remaining seconds in window
     * @return wb2Count WB2 attack count for this target
     * @return wb2Threshold WB2 threshold
     * @return wb2RemainSec WB2 remaining seconds in window
     * @return currentDeltaMultiplierBps Current delta multiplier (reduces delta)
     */
    function getWarBalanceStateByTarget(uint256 countryId) external view returns (
        uint256 wb1Count,
        uint256 wb1Threshold,
        uint256 wb1RemainSec,
        uint256 wb2Count,
        uint256 wb2Threshold,
        uint256 wb2RemainSec,
        uint256 currentDeltaMultiplierBps
    ) {
        WBState memory s1 = wb1ByTarget[countryId];
        WBState memory s2 = wb2ByTarget[countryId];
        
        uint256 wb1Remain = 0;
        if (s1.windowStart > 0 && block.timestamp - s1.windowStart < wb1Tier.windowSec) {
            wb1Remain = wb1Tier.windowSec - (block.timestamp - s1.windowStart);
        }
        
        uint256 wb2Remain = 0;
        if (s2.windowStart > 0 && block.timestamp - s2.windowStart < wb2Tier.windowSec) {
            wb2Remain = wb2Tier.windowSec - (block.timestamp - s2.windowStart);
        }
        
        // Calculate current multiplier (reduces delta)
        uint256 mulBps = 10000;
        if (s2.attackCount >= wb2Tier.threshold) {
            mulBps = 8000;   // x0.80
        } else if (s1.attackCount >= wb1Tier.threshold) {
            mulBps = 6000;   // x0.60
        }
        
        return (
            s1.attackCount,
            wb1Tier.threshold,
            wb1Remain,
            s2.attackCount,
            wb2Tier.threshold,
            wb2Remain,
            mulBps
        );
    }
    
    /**
     * @dev Get war balance state for a user (DEPRECATED - kept for compatibility)
     * @notice War-balance is now target country-based, not user-based
     * @param user User address (not used)
     * @return wb1Count Always 0
     * @return wb1Threshold WB1 threshold
     * @return wb1RemainSec Always 0
     * @return wb2Count Always 0
     * @return wb2Threshold WB2 threshold
     * @return wb2RemainSec Always 0
     * @return freeAttacksUsed Free attacks used
     * @return freeAttacksMax Maximum free attacks (always 2)
     */
    function getWarBalanceState(address user) external view returns (
        uint256 wb1Count,
        uint256 wb1Threshold,
        uint256 wb1RemainSec,
        uint256 wb2Count,
        uint256 wb2Threshold,
        uint256 wb2RemainSec,
        uint8 freeAttacksUsed,
        uint8 freeAttacksMax
    ) {
        UserState memory s = userState[user];
        
        return (
            0,                      // wb1Count: deprecated
            wb1Tier.threshold,
            0,                      // wb1RemainSec: deprecated
            0,                      // wb2Count: deprecated
            wb2Tier.threshold,
            0,                      // wb2RemainSec: deprecated
            s.freeAttacksUsed,
            2
        );
    }

    /**
     * @dev Preview attack fee (war-balance no longer affects fee, only delta)
     * @param user User address
     * @param attackerPrice8 Attacker country price (8 decimals)
     * @return baseFeeUSDC6 Base fee
     * @return appliedTier Always 0 (war-balance affects delta, not fee)
     * @return appliedMulBps Always 0 (war-balance affects delta, not fee)
     * @return finalFeeUSDC6 Final fee (0 if free attack available)
     * @return isFreeAttackAvailable Free attack available
     */
    function previewAttackFee(address user, uint256 attackerPrice8) external view returns (
        uint256 baseFeeUSDC6,
        uint256 appliedTier,
        uint256 appliedMulBps,
        uint256 finalFeeUSDC6,
        bool isFreeAttackAvailable
    ) {
        uint256 baseFee = _calculateAttackFee(attackerPrice8);
        UserState memory s = userState[user];
        bool freeAvail = (s.freeAttacksUsed < 2);
        uint256 finalFee = freeAvail ? 0 : baseFee;

        return (baseFee, 0, 0, finalFee, freeAvail);
    }

    /**
     * @dev Get maximum of two values
     */
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }
    
    // ============ VIEW FUNCTIONS ============
    
    /**
     * @dev Get country information
     */
    function getCountryInfo(uint256 countryId) external view returns (
        string memory name,
        address token,
        uint256 price,
        uint256 totalSupply,
        uint256 attacks,
        bool exists
    ) {
        Country memory c = countries[countryId];
        return (c.name, c.token, c.price, c.totalSupply, c.attacks, c.exists);
    }
    
    /**
     * @dev Get buy price for amount
     */
    function getBuyPrice(uint256 countryId, uint256 amountToken18) external view returns (uint256) {
        Country memory c = countries[countryId];
        if (!c.exists) revert CountryNotExists();
        
        uint256 unitPrice8 = c.price + (KAPPA / 2);
        uint256 totalCost8 = (unitPrice8 * amountToken18) / 1e18;
        return totalCost8 / 100; // Convert to USDC6
    }
    
    /**
     * @dev Get sell price for amount
     * @notice This function returns the base sell price after sell fee, but does NOT include anti-dump extra fees
     * @notice For accurate net proceeds, UI should also call getAntiDumpInfo() and subtract extraFeeUSDC6
     * @param countryId Country ID
     * @param amountToken18 Amount to sell (18 decimals)
     * @return Net proceeds after sell fee (6 decimals), excluding anti-dump extra fees
     */
    function getSellPrice(uint256 countryId, uint256 amountToken18) external view returns (uint256) {
        Country memory c = countries[countryId];
        if (!c.exists) revert CountryNotExists();
        
        // Prevent underflow - clamp to minimum price
        uint256 unitPrice8 = c.price > (LAMBDA / 2) ? c.price - (LAMBDA / 2) : PRICE_MIN;
        uint256 grossProceeds8 = (unitPrice8 * amountToken18) / 1e18;
        uint256 grossProceedsUSDC6 = grossProceeds8 / 100;
        
        // Apply sell fee using config (configurable)
        uint256 feeUSDC6 = (grossProceedsUSDC6 * config.sellFeeBps) / 10000;
        return grossProceedsUSDC6 - feeUSDC6;
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @dev Create new country with specific ID
     * @param countryId Country ID
     * @param name Country name
     * @param token ERC20 token address (must be non-zero, assumed 18 decimals)
     */
    function createCountry(uint256 countryId, string memory name, address token) external onlyOwner {
        if (countries[countryId].exists) revert CountryAlreadyExists();
        if (token == address(0)) revert InvalidAmount(); // Zero-address check
        
        countries[countryId] = Country({
            name: name,
            token: token,
            price: 0,
            totalSupply: 0,
            attacks: 0,
            exists: true
        });
        
        emit CountryCreated(countryId, name, token);
    }
    
    /**
     * @dev Seed country price (owner only, one-time operation)
     */
    function seedCountryPrice(uint256 countryId, uint256 priceUSDC6) external onlyOwner nonReentrant {
        Country storage c = countries[countryId];
        if (!c.exists) revert CountryNotExists();
        if (c.price != 0) revert PriceAlreadySet();
        if (c.totalSupply != 0) revert SupplyAlreadySet();
        if (countryTouched[countryId]) revert CountryAlreadyTouched();
        if (priceUSDC6 != 5e6) revert InvalidSeedPrice(); // Must be exactly 5.00 USDC6
        
        c.price = priceUSDC6 * 100; // Convert USDC6 to 8 decimals
        emit PriceSeeded(countryId, priceUSDC6);
    }
    
    /**
     * @dev Deposit country tokens to contract reserve (owner only)
     * @notice Required before buy() can work - tokens must be in contract
     * @param countryId Country ID
     * @param amount Amount to deposit (18 decimals)
     */
    function depositCountryTokens(uint256 countryId, uint256 amount) external onlyOwner nonReentrant {
        Country storage c = countries[countryId];
        if (!c.exists) revert CountryNotExists();
        
        // Transfer tokens to contract
        IERC20(c.token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Update totalSupply
        c.totalSupply += amount;
        
        // Validate reserve balance matches or exceeds totalSupply
        require(
            IERC20(c.token).balanceOf(address(this)) >= c.totalSupply,
            "reserve mismatch"
        );
        
        emit TokensDeposited(countryId, amount);
    }
    
    /**
     * @dev Seed country supply (owner only, one-time operation)
     * @notice Transfers tokens to contract and validates reserve balance
     */
    function seedCountrySupply(uint256 countryId, uint256 initialSupplyToken18) external onlyOwner nonReentrant {
        Country storage c = countries[countryId];
        if (!c.exists) revert CountryNotExists();
        if (c.totalSupply != 0) revert SupplyAlreadySet();
        if (countryTouched[countryId]) revert CountryAlreadyTouched();
        if (initialSupplyToken18 != 50000 * 1e18) revert InvalidSeedSupply();
        
        // Transfer tokens to contract
        IERC20(c.token).safeTransferFrom(msg.sender, address(this), initialSupplyToken18);
        
        // Update totalSupply
        c.totalSupply = initialSupplyToken18;
        
        // Validate reserve balance matches totalSupply
        require(
            IERC20(c.token).balanceOf(address(this)) >= c.totalSupply,
            "reserve mismatch"
        );
        
        emit SupplySeeded(countryId, initialSupplyToken18);
    }
    
    /**
     * @dev Update configuration
     * @notice Treasury is always set to contract address, cannot be changed
     */
    function setConfig(
        address _payToken,
        address _treasury,
        address _revenue,
        address _commissions
    ) external onlyOwner nonReentrant {
        // Zero-address validation
        require(_payToken != address(0), "zero addr");
        require(_revenue != address(0), "zero addr");
        require(_commissions != address(0), "zero addr");
        
        config.payToken = _payToken;
        config.treasury = address(this); // Always contract itself, ignore _treasury parameter
        config.revenue = _revenue;
        config.commissions = _commissions;
        // entryFeeBps and sellFeeBps remain unchanged (can be updated via separate function if needed)
        
        emit ConfigUpdated(_payToken, address(this), _revenue, _commissions);
    }
    
    /**
     * @dev Update fee rates
     * @param _entryFeeBps Buy fee in basis points
     * @param _sellFeeBps Sell fee in basis points
     */
    function setFees(uint256 _entryFeeBps, uint256 _sellFeeBps) external onlyOwner nonReentrant {
        config.entryFeeBps = _entryFeeBps;
        config.sellFeeBps = _sellFeeBps;
    }
    
    /**
     * @dev Withdraw USDC from contract (owner only)
     * @param to Recipient address
     * @param amount Amount to withdraw (USDC6)
     */
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        IERC20(config.payToken).safeTransfer(to, amount);
    }
    
    /**
     * @dev Withdraw accumulated fees (pull pattern - prevents reentrancy)
     * @notice Recipients can withdraw their accumulated fees
     * @notice Uses CEI pattern: checks -> effects -> interactions
     */
    function withdrawFees() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "no funds");
        
        // EFFECTS: Clear pending withdrawal before transfer
        pendingWithdrawals[msg.sender] = 0;
        
        // INTERACTIONS: Transfer after state update
        IERC20(config.payToken).safeTransfer(msg.sender, amount);
        
        emit FeeWithdrawn(msg.sender, amount);
    }
    
    /**
     * @dev Emergency pause
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Emergency withdraw (only for wrong tokens, not payToken)
     * @notice payToken must be withdrawn using withdraw() function
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner nonReentrant {
        require(token != config.payToken, "use withdraw()");
        IERC20(token).safeTransfer(owner(), amount);
    }
    
    /**
     * @dev Get user balance for a specific country
     * @param id Country ID
     * @param user User address
     * @return balance User's token balance (18 decimals)
     */
    function getUserBalance(uint256 id, address user) external view returns (uint256 balance) {
        Country storage c = countries[id];
        if (!c.exists) revert CountryNotExists();
        
        return IERC20(c.token).balanceOf(user);
    }
    
    /**
     * @dev Get contract configuration
     */
    function getConfig() external view returns (
        address payToken,
        address feeToken,
        address treasury,
        address revenue,
        address commissions,
        uint16 buyFeeBps,
        uint16 sellFeeBps,
        uint16 referralShareBps,
        uint16 revenueShareBps,
        uint64 priceMin8,
        uint64 kappa,
        uint64 lambda,
        bool attackFeeInUSDC,
        uint64 tier1Price8,
        uint64 tier2Price8,
        uint64 tier3Price8,
        uint64 delta1_8,
        uint64 delta2_8,
        uint64 delta3_8,
        uint64 delta4_8,
        uint32 fee1_USDC6,
        uint32 fee2_USDC6,
        uint32 fee3_USDC6,
        uint32 fee4_USDC6,
        uint256 fee1_TOKEN18,
        uint256 fee2_TOKEN18,
        uint256 fee3_TOKEN18,
        uint256 fee4_TOKEN18
    ) {
        return (
            config.payToken,
            address(0), // feeToken not used
            address(this), // treasury is always contract itself
            config.revenue,
            config.commissions,
            uint16(config.entryFeeBps),
            uint16(config.sellFeeBps),
            uint16(3000), // referralShareBps
            uint16(7000), // revenueShareBps
            uint64(PRICE_MIN),
            uint64(KAPPA),
            uint64(LAMBDA),
            true, // attackFeeInUSDC
            uint64(5e8), // tier1Price8: 5 USDC in 8 decimals
            uint64(10e8), // tier2Price8: 10 USDC in 8 decimals
            uint64(0), // tier3Price8: unlimited (>10 USDC) - no upper bound
            uint64(110000), // delta1_8: 0.0011 in 8 decimals (T1: ≤5.00)
            uint64(90000),  // delta2_8: 0.0009 in 8 decimals (T2: >5.00 and <10.00)
            uint64(70000),  // delta3_8: 0.0007 in 8 decimals (T3: ≥10.00)
            uint64(50000),  // delta4_8: 0.0005 in 8 decimals (free attack)
            uint32(300000), // fee1_USDC6: 0.30 USDC
            uint32(350000), // fee2_USDC6: 0.35 USDC
            uint32(400000), // fee3_USDC6: 0.40 USDC
            uint32(0), // fee4_USDC6: 0 (free attack)
            uint256(0), uint256(0), uint256(0), uint256(0) // token fees not used
        );
    }
    
    /**
     * @dev Get current tier for a country based on attack fee tiers
     * @param countryId Country ID
     * @return maxPrice8 Maximum price (8 decimals) - not used in current implementation
     * @return delta8 Price delta per attack (8 decimals) - fixed per attack, based on spec tier
     * @return attackFeeUSDC6_orETHwei Attack fee in USDC6 based on country price tier
     * @notice Delta is fixed per attack: Tier 1 = 0.0011, Tier 2 = 0.0009, Tier 3 = 0.0007
     * @notice Free attacks use fixed delta of 0.0005 regardless of tier
     */
    function getCurrentTier(uint256 countryId) external view returns (
        uint256 maxPrice8,
        uint256 delta8,
        uint256 attackFeeUSDC6_orETHwei
    ) {
        Country memory c = countries[countryId];
        if (!c.exists) revert CountryNotExists();
        
        // Convert price from 8 decimals to USDC6 for comparison
        uint256 priceUSDC6 = c.price / 100;
        
        // Determine attack fee tier based on spec (3 tiers only)
        // Tier 1: ≤ 5.00 USDC -> 0.30 USDC fee, delta 0.0011
        // Tier 2: > 5.00 and < 10.00 USDC -> 0.35 USDC fee, delta 0.0009  
        // Tier 3: ≥ 10.00 USDC -> 0.40 USDC fee, delta 0.0007
        uint256 feeUSDC6;
        uint256 delta;
        
        if (priceUSDC6 <= 5e6) {
            feeUSDC6 = 300000;      // 0.30 USDC6
            delta = 110000;         // 0.0011 * 1e8 (8 decimals)
        } else if (priceUSDC6 < 10e6) {
            feeUSDC6 = 350000;      // 0.35 USDC6
            delta = 90000;          // 0.0009 * 1e8 (8 decimals)
        } else {
            feeUSDC6 = 400000;      // 0.40 USDC6
            delta = 70000;          // 0.0007 * 1e8 (8 decimals)
        }
        
        return (
            0,                      // maxPrice8: not used in current implementation (always 0)
            delta,                  // delta8
            feeUSDC6                // attackFeeUSDC6_orETHwei
        );
    }
    
    /**
     * @dev Get anti-dump information for a potential sell (reserve-based percentage)
     * @param countryId Country ID
     * @param amountToken18 Amount to sell (18 decimals)
     * @return sellAmount Amount being sold (same as input)
     * @return sellPercentage Sell percentage of reserve (basis points)
     * @return extraFeeBps Extra fee in basis points that would be applied
     * @return cooldown Cooldown duration in seconds that would be applied
     * @return nextSellTime Timestamp when cooldown would end (0 if no cooldown)
     * @return canSellNow Whether user can sell now (not in cooldown for this country)
     */
    function getAntiDumpInfo(uint256 countryId, uint256 amountToken18) external view returns (
        uint256 sellAmount,
        uint256 sellPercentage,
        uint256 extraFeeBps,
        uint256 cooldown,
        uint256 nextSellTime,
        bool canSellNow
    ) {
        Country memory c = countries[countryId];
        if (!c.exists) revert CountryNotExists();
        
        // Percent of reserve (contract reserve = c.totalSupply)
        uint256 reserve = c.totalSupply;
        uint256 sellPctBps = reserve > 0 ? (amountToken18 * 10000) / reserve : 10000;
        
        // Pick tier - only return anti-dump info if threshold is met
        bool matched = false;
        uint256 tier = 0;
        for (uint256 i = antiDumpTiers.length; i > 0; i--) {
            if (sellPctBps >= antiDumpTiers[i - 1].thresholdPctBps) {
                tier = i - 1;
                matched = true;
                break;
            }
        }
        
        // Check current cooldown status (country-based)
        uint256 cooldownUntil = userCooldownUntil[msg.sender][countryId];
        bool inCooldown = cooldownUntil > block.timestamp;
        
        // If no threshold matched, return zero fees and cooldown
        if (!matched) {
            return (
                amountToken18,
                sellPctBps,
                0,  // No extra fee
                0,  // No cooldown
                inCooldown ? cooldownUntil : 0,
                !inCooldown
            );
        }
        
        AntiDumpTier memory antiDumpTier = antiDumpTiers[tier];
        
        return (
            amountToken18,
            sellPctBps,
            antiDumpTier.extraFeeBps,
            antiDumpTier.cooldownSec,
            inCooldown ? cooldownUntil : 0,
            !inCooldown
        );
    }
    
    /**
     * @dev Get user's cooldown information for a specific country
     * @param user User address
     * @param countryId Country ID
     * @return isInCooldown Whether user is in cooldown for this country
     * @return remainingSeconds Seconds remaining in cooldown
     * @return lastTierApplied Last anti-dump tier that was applied (0-3, 0 = none)
     */
    function getUserCooldownInfo(address user, uint256 countryId) external view returns (
        bool isInCooldown,
        uint256 remainingSeconds,
        uint256 lastTierApplied
    ) {
        uint256 cooldownUntil = userCooldownUntil[user][countryId];
        
        if (cooldownUntil > block.timestamp) {
            isInCooldown = true;
            remainingSeconds = cooldownUntil - block.timestamp;
        } else {
            isInCooldown = false;
            remainingSeconds = 0;
        }
        
        return (isInCooldown, remainingSeconds, userLastTier[user][countryId]);
    }
    
    /**
     * @dev Get free attack count for a user
     * @param user User address
     * @return used Number of free attacks used (0-2)
     * @return maxCount Maximum free attacks allowed (always 2)
     * @return remaining Remaining free attacks (maxCount - used)
     */
    function getFreeAttackCount(address user) external view returns (
        uint8 used,
        uint8 maxCount,
        uint8 remaining
    ) {
        UserState memory s = userState[user];
        uint8 usedCount = s.freeAttacksUsed;
        uint8 maxAllowed = 2;
        uint8 remainingCount = usedCount < maxAllowed ? (maxAllowed - usedCount) : 0;
        
        return (usedCount, maxAllowed, remainingCount);
    }
    
    /**
     * @dev Get remaining supply for a country (based on actual contract balance)
     * @param id Country ID
     * @return remaining Remaining supply (18 decimals) - actual token balance in contract
     */
    function getRemainingSupply(uint256 id) external view returns (uint256 remaining) {
        Country storage c = countries[id];
        if (!c.exists) revert CountryNotExists();
        
        // Return actual contract balance (more reliable than totalSupply)
        return IERC20(c.token).balanceOf(address(this));
    }
    
    /**
     * @dev Get remaining supply for a country (alias for compatibility)
     * @param id Country ID
     * @return remaining Remaining supply (18 decimals) - actual token balance in contract
     */
    function remainingSupply(uint256 id) external view returns (uint256 remaining) {
        Country storage c = countries[id];
        if (!c.exists) revert CountryNotExists();
        
        // Return actual contract balance (more reliable than totalSupply)
        return IERC20(c.token).balanceOf(address(this));
    }
}