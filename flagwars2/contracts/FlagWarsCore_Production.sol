// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Custom errors (gas-optimized)
error ErrPaused();
error ErrInvalidCountry();
error ErrFloorGuard();
error ErrAmountZero();
error ErrInsufficientTreasuryUSDC();
error ErrInvalidFee();
error ErrDeadline();
error ErrUnauthorized();
error ErrWrongMsgValue();
error ErrOnlyWholeTokens();
error ErrInsufficientBalance();
error ErrUSDCInMismatch();
error ErrUSDCOutMismatch();
error ErrTxAmountTooLarge();
error ErrInvalidConfig();
error ErrRateLimitPerTarget();
error ErrRateLimitTotal();
error ErrBatchTooLarge();

/// @dev Minimal data-structures; genişletilebilir.
struct Country {
    string name;
    address token;         // ERC20 country token (18d) - optional/mock
    uint256 price8;        // price with 8 decimals (PRICE8)
    uint256 totalSupply18; // seeded supply (TOKEN18)
    uint256 attacks;       // counter
    bool exists;
}

struct AttackItem {
    uint256 fromId;
    uint256 toId;
    uint256 amountToken18;
}

struct Config {
    address payToken;      // USDC (6d) - buy/sell için
    address feeToken;      // Attack fee token (18d) - USDC yerine token istendiğinde
    address treasury;      // fee/source wallet (USDC)
    address revenue;       // fee sink
    address commissions;   // referral sink
    uint16 buyFeeBps;      // e.g. 0
    uint16 sellFeeBps;     // e.g. 500
    uint16 referralShareBps; // 3000 (30% of fee)
    uint16 revenueShareBps;  // 7000 (70% of fee)
    uint64 priceMin8;      // 1_000_000 (0.01 * 1e8)
    uint64 kappa;          // 55_000 (0.00055 * 1e8)
    uint64 lambda;         // 55_550 (0.0005555 * 1e8)
    bool attackFeeInUSDC;  // true => payToken(USDC6), false => feeToken(ERC20-18d)
    
    // Attack tier thresholds (PRICE8)
    uint64 tier1Price8;    // 5 * 1e8 = 500_000_000
    uint64 tier2Price8;    // 10 * 1e8 = 1_000_000_000
    uint64 tier3Price8;    // 15 * 1e8 = 1_500_000_000
    
    // Attack tier deltas (PRICE8)
    uint64 delta1_8;       // 0.0011 * 1e8 = 110_000
    uint64 delta2_8;       // 0.0009 * 1e8 = 90_000
    uint64 delta3_8;       // 0.0007 * 1e8 = 70_000
    uint64 delta4_8;       // 0.0005 * 1e8 = 50_000
    
    // Attack tier fees - USDC mode (6 decimals)
    uint32 fee1_USDC6;     // 0.30 * 1e6 = 300_000
    uint32 fee2_USDC6;     // 0.35 * 1e6 = 350_000
    uint32 fee3_USDC6;     // 0.40 * 1e6 = 400_000
    uint32 fee4_USDC6;     // 0.45 * 1e6 = 450_000
    
    // Attack tier fees - TOKEN mode (18 decimals)
    uint256 fee1_TOKEN18;  // e.g. 0.3 * 1e18
    uint256 fee2_TOKEN18;  // e.g. 0.35 * 1e18
    uint256 fee3_TOKEN18;  // e.g. 0.4 * 1e18
    uint256 fee4_TOKEN18;  // e.g. 0.45 * 1e18
}

contract FlagWarsCore_Production is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;
    
    // ---- Constants
    uint256 public constant MAX_TOKENS_PER_TX_N = 50; // Max 50 tokens per buy/sell transaction
    
    // ---- Storage
    mapping(uint256 => Country) public countries;
    Config public cfg;
    uint256 public freeAttackLimit = 2;
    
    // User balances for each country (countryId => user => balance)
    mapping(uint256 => mapping(address => uint256)) public userBalances;
    
    // Remaining supply for each country (treasury inventory)
    mapping(uint256 => uint256) public remainingSupply;
    
    // Optional: per-user referral tracking (address user => referrer address)
    mapping(address => address) public referrerOf;
    
    // Rate limit tracking (on-chain anti-spam)
    mapping(address => uint64) private lastBucket;          // last minute bucket for total
    mapping(address => uint16) private countTotal;          // total attacks in current bucket
    mapping(address => mapping(uint256 => uint64)) private lastBucketPerTarget; // per-target bucket
    mapping(address => mapping(uint256 => uint16)) private countPerTarget;      // attacks per target in current bucket

    // ---- Events (unit-suffixed fields)
    event CountryCreated(uint256 indexed id, string name, address token, uint256 price8, uint256 supply18);
    event Bought(address indexed user, uint256 indexed id, uint256 amountToken18, uint256 grossUSDC6, uint256 newPrice8);
    event Sold(address indexed user, uint256 indexed id, uint256 amountToken18, uint256 grossUSDC6, uint256 feeUSDC6, uint256 newPrice8);
    event Attack(uint256 indexed fromId, uint256 indexed toId, address indexed user, uint256 amountToken18, uint256 feeAmount, uint256 newPriceFrom8, uint256 newPriceTo8);
    event ReferralSet(address indexed user, address indexed referrer);

    constructor(Config memory _cfg) {
        _validateConfig(_cfg);
        cfg = _cfg;
        _pause(); // start paused by default; owner unpauses
    }
    
    /// @dev Internal config validation helper
    function _validateConfig(Config memory _cfg) internal pure {
        if (_cfg.payToken == address(0)) revert ErrInvalidConfig();
        if (_cfg.treasury == address(0)) revert ErrInvalidConfig();
        if (_cfg.revenue == address(0)) revert ErrInvalidConfig();
        if (_cfg.referralShareBps + _cfg.revenueShareBps != 10_000) revert ErrInvalidConfig();
        if (_cfg.buyFeeBps > 10_000) revert ErrInvalidConfig();
        if (_cfg.sellFeeBps > 10_000) revert ErrInvalidConfig();
        // Attack fee token validation: if not USDC mode, feeToken must be valid
        if (!_cfg.attackFeeInUSDC && _cfg.feeToken == address(0)) revert ErrInvalidConfig();
    }

    // ---- Modifiers
    modifier onlyWholeTokens(uint256 amountToken18) {
        if (amountToken18 == 0 || amountToken18 % 1e18 != 0) revert ErrOnlyWholeTokens();
        _;
    }

    // ---- Owner Ops
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setConfig(Config calldata _cfg) external onlyOwner {
        _validateConfig(_cfg);
        cfg = _cfg;
    }
    
    // ---- Referral Management
    function setReferrer(address referrer) external {
        require(referrer != address(0) && referrer != msg.sender, "Invalid referrer");
        require(referrerOf[msg.sender] == address(0), "Referrer already set");
        referrerOf[msg.sender] = referrer;
        emit ReferralSet(msg.sender, referrer);
    }

    function createCountry(uint256 id, string calldata name, address token, uint256 price8, uint256 supply18) external onlyOwner {
        if (countries[id].exists) revert ErrInvalidCountry();
        countries[id] = Country({
            name: name,
            token: token,
            price8: price8,
            totalSupply18: supply18,
            attacks: 0,
            exists: true
        });
        remainingSupply[id] = supply18; // Set initial treasury inventory
        emit CountryCreated(id, name, token, price8, supply18);
    }

    // ---- Read Helpers
    function getCountryInfo(uint256 id) external view returns (string memory, address, uint256, uint256, uint256, bool) {
        Country storage c = countries[id];
        return (c.name, c.token, c.price8, c.totalSupply18, c.attacks, c.exists);
    }

    function getConfig() external view returns (Config memory) { return cfg; }
    
    function getUserBalance(uint256 id, address user) external view returns (uint256) {
        return userBalances[id][user];
    }
    
    function getRemainingSupply(uint256 id) external view returns (uint256) {
        return remainingSupply[id];
    }

    function getCurrentTier(uint256 /*id*/) external view returns (uint256 maxPrice8, uint256 delta8, uint256 attackFeeUSDC6_orETHwei) {
        // Basit statik sürüm: delta8 = kappa/2 veya lambda/2 gibi okunabilir kalsın (UI/SDK tarafı için)
        return (type(uint256).max, cfg.kappa/2, 0);
    }

    // ---- Pricing (STATIC half-step with arithmetic series for multi-token)
    /// @notice Calculate total USDC cost for buying n tokens
    /// @dev Formula: total_price8 = n*P + κ*(n*n)/2
    /// @param currentPrice8 Current price before buy (P)
    /// @param n Number of whole tokens to buy
    /// @return totalPrice8 Total cost in PRICE8 units
    /// @return newPrice8 New price after buy (P + n*κ)
    function _buyTotalPrice8(uint256 currentPrice8, uint256 n) internal view returns (uint256 totalPrice8, uint256 newPrice8) {
        // BUY: total = n*P + κ*(n²)/2
        // New price: P' = P + n*κ
        uint256 linearTerm = n * currentPrice8;
        uint256 quadraticTerm = (cfg.kappa * n * n) / 2;
        totalPrice8 = linearTerm + quadraticTerm;
        newPrice8 = currentPrice8 + (n * cfg.kappa);
    }

    /// @notice Calculate total USDC received for selling n tokens
    /// @dev Formula: total_price8 = n*P − λ*(n*n)/2
    /// @param currentPrice8 Current price before sell (P)
    /// @param n Number of whole tokens to sell
    /// @return totalPrice8 Total payout in PRICE8 units
    /// @return newPrice8 New price after sell (P - n*λ)
    function _sellTotalPrice8(uint256 currentPrice8, uint256 n) internal view returns (uint256 totalPrice8, uint256 newPrice8) {
        // SELL: total = n*P − λ*(n²)/2
        // New price: P' = P - n*λ
        uint256 linearTerm = n * currentPrice8;
        uint256 quadraticTerm = (cfg.lambda * n * n) / 2;
        
        // Underflow protection
        if (linearTerm > quadraticTerm) {
            totalPrice8 = linearTerm - quadraticTerm;
        } else {
            totalPrice8 = 0;
        }
        
        // New price with floor protection
        uint256 priceDecrement = n * cfg.lambda;
        if (currentPrice8 > priceDecrement) {
            newPrice8 = currentPrice8 - priceDecrement;
        } else {
            newPrice8 = cfg.priceMin8;
        }
    }

    // ---- Units: PRICE8→USDC6 conversion
    function _price8ToUSDC6(uint256 price8) internal pure returns (uint256) {
        // price8 (1e8) / 1e2 = USDC6 (1e6)
        return price8 / 100;
    }

    // ---- Core Actions
    function buy(uint256 id, uint256 amountToken18, uint256 maxInUSDC6, uint256 deadline) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyWholeTokens(amountToken18)
    {
        // CHECKS
        if (block.timestamp > deadline) revert ErrDeadline();
        if (!countries[id].exists) revert ErrInvalidCountry();
        
        // Calculate n (number of whole tokens)
        uint256 n = amountToken18 / 1e18;
        if (n == 0) revert ErrAmountZero();
        if (n > MAX_TOKENS_PER_TX_N) revert ErrTxAmountTooLarge();
        
        if (remainingSupply[id] < amountToken18) revert ErrInsufficientTreasuryUSDC();

        Country storage c = countries[id];
        
        // Calculate total price using arithmetic series
        (uint256 totalPrice8, uint256 newPrice8) = _buyTotalPrice8(c.price8, n);
        uint256 grossUSDC6 = _price8ToUSDC6(totalPrice8);

        // Fee model: buyFeeBps (spec: 0 = no fee on buy)
        uint256 fee = (grossUSDC6 * cfg.buyFeeBps) / 10_000;
        uint256 netUSDC6 = grossUSDC6 - fee;

        // Slippage protection (user sets max amount they will pay)
        if (grossUSDC6 > maxInUSDC6) revert ErrInvalidFee();

        // USDC Delta Proof (before balance)
        uint256 balanceBefore = IERC20(cfg.payToken).balanceOf(address(this));

        // EFFECTS (state updates BEFORE external calls)
        userBalances[id][msg.sender] += amountToken18;
        remainingSupply[id] -= amountToken18;
        c.price8 = newPrice8; // Price update with arithmetic series

        // INTERACTIONS (external calls LAST)
        IERC20(cfg.payToken).safeTransferFrom(msg.sender, address(this), grossUSDC6);

        // USDC Delta Proof (verify exact amount received)
        uint256 balanceAfter = IERC20(cfg.payToken).balanceOf(address(this));
        if (balanceAfter - balanceBefore != grossUSDC6) revert ErrUSDCInMismatch();

        // Event
        emit Bought(msg.sender, id, amountToken18, grossUSDC6, newPrice8);
    }

    function sell(uint256 id, uint256 amountToken18, uint256 minOutUSDC6, uint256 deadline) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyWholeTokens(amountToken18)
    {
        // CHECKS
        if (block.timestamp > deadline) revert ErrDeadline();
        if (!countries[id].exists) revert ErrInvalidCountry();
        if (userBalances[id][msg.sender] < amountToken18) revert ErrInsufficientBalance();

        // Calculate n (number of whole tokens)
        uint256 n = amountToken18 / 1e18;
        if (n == 0) revert ErrAmountZero();
        if (n > MAX_TOKENS_PER_TX_N) revert ErrTxAmountTooLarge();

        Country storage c = countries[id];
        
        // Calculate total price using arithmetic series
        (uint256 totalPrice8, uint256 newPrice8) = _sellTotalPrice8(c.price8, n);
        if (newPrice8 < cfg.priceMin8) revert ErrFloorGuard();
        
        uint256 grossUSDC6 = _price8ToUSDC6(totalPrice8);
        uint256 fee = (grossUSDC6 * cfg.sellFeeBps) / 10_000; // 5% fee (500 bps)
        uint256 netUSDC6 = grossUSDC6 - fee;
        
        // Slippage protection (user expects at least minOutUSDC6)
        if (netUSDC6 < minOutUSDC6) revert ErrInvalidFee();
        
        // Check contract has enough USDC to pay user + fees
        uint256 totalRequired = grossUSDC6;
        if (IERC20(cfg.payToken).balanceOf(address(this)) < totalRequired) revert ErrInsufficientTreasuryUSDC();

        // USDC Delta Proof (before balance)
        uint256 balanceBefore = IERC20(cfg.payToken).balanceOf(address(this));

        // EFFECTS (state updates BEFORE external calls)
        userBalances[id][msg.sender] -= amountToken18; // Burn user's tokens
        remainingSupply[id] += amountToken18; // Return tokens to treasury inventory
        c.price8 = newPrice8; // Price update with arithmetic series

        // INTERACTIONS (external calls LAST)
        // 1) Pay user (net amount after fee)
        IERC20(cfg.payToken).safeTransfer(msg.sender, netUSDC6);
        
        // 2) Distribute fee if exists (5% = 500 bps)
        // Note: cfg.revenue is guaranteed to be non-zero by _validateConfig
        if (fee > 0) {
            address referralWallet = referrerOf[msg.sender];
            
            if (referralWallet != address(0)) {
                // User has referrer: Split 30% referral, 70% revenue
                uint256 referralShare = (fee * cfg.referralShareBps) / 10_000; // 30% of 5% = 1.5% total
                uint256 revenueShare = fee - referralShare; // 70% of 5% = 3.5% total
                
                if (referralShare > 0) {
                    IERC20(cfg.payToken).safeTransfer(referralWallet, referralShare);
                }
                if (revenueShare > 0) {
                    IERC20(cfg.payToken).safeTransfer(cfg.revenue, revenueShare);
                }
            } else {
                // No referrer: All fee goes to revenue (100% of 5%)
                IERC20(cfg.payToken).safeTransfer(cfg.revenue, fee);
            }
        }

        // USDC Delta Proof (verify exact amount sent out)
        // Since cfg.revenue is guaranteed non-zero, all fees are transferred out
        // Total delta = netUSDC6 (to user) + fee (to referrer/revenue) = grossUSDC6
        uint256 balanceAfter = IERC20(cfg.payToken).balanceOf(address(this));
        uint256 expectedDelta = grossUSDC6;
        if (balanceBefore - balanceAfter != expectedDelta) revert ErrUSDCOutMismatch();

        // Event
        emit Sold(msg.sender, id, amountToken18, grossUSDC6, fee, newPrice8);
    }

    /// @notice Attack fee modeli:
    /// - cfg.attackPayableETH == true → msg.value ile ETH ücreti
    /// - false → USDC allowance gerektirir (burada sadece ETH path'i etkin)
    // ---- ATTACK SYSTEM (TIER-BASED, RATE-LIMITED) ----
    
    /// @dev Get attack tier parameters based on attacker's current price
    function _getAttackTier(uint256 priceFrom8) internal view returns (uint64 delta8, uint256 feeAmount, bool isUSDC) {
        isUSDC = cfg.attackFeeInUSDC;
        
        if (priceFrom8 <= cfg.tier1Price8) {
            delta8 = cfg.delta1_8;
            feeAmount = isUSDC ? uint256(cfg.fee1_USDC6) : cfg.fee1_TOKEN18;
        } else if (priceFrom8 <= cfg.tier2Price8) {
            delta8 = cfg.delta2_8;
            feeAmount = isUSDC ? uint256(cfg.fee2_USDC6) : cfg.fee2_TOKEN18;
        } else if (priceFrom8 <= cfg.tier3Price8) {
            delta8 = cfg.delta3_8;
            feeAmount = isUSDC ? uint256(cfg.fee3_USDC6) : cfg.fee3_TOKEN18;
        } else {
            delta8 = cfg.delta4_8;
            feeAmount = isUSDC ? uint256(cfg.fee4_USDC6) : cfg.fee4_TOKEN18;
        }
    }
    
    /// @dev Charge attack fee (ERC20 only, no ETH)
    function _chargeFee(address payer, uint256 amt, bool isUSDC) internal {
        if (amt == 0) return;
        if (isUSDC) {
            IERC20(cfg.payToken).safeTransferFrom(payer, cfg.revenue, amt); // USDC6
        } else {
            IERC20(cfg.feeToken).safeTransferFrom(payer, cfg.revenue, amt); // TOKEN18
        }
    }
    
    /// @dev Touch total bucket (reset if new minute)
    function _touchBucket(address user) internal {
        uint64 bucket = uint64(block.timestamp / 60);
        if (lastBucket[user] != bucket) {
            lastBucket[user] = bucket;
            countTotal[user] = 0;
        }
    }
    
    /// @dev Touch per-target bucket (reset if new minute)
    function _touchBucketPerTarget(address user, uint256 targetId) internal {
        uint64 bucket = uint64(block.timestamp / 60);
        if (lastBucketPerTarget[user][targetId] != bucket) {
            lastBucketPerTarget[user][targetId] = bucket;
            countPerTarget[user][targetId] = 0;
        }
    }
    
    /// @dev Check and update rate limits
    function _checkRateLimit(address user, uint256 targetId, uint16 toAdd) internal {
        _touchBucket(user);
        _touchBucketPerTarget(user, targetId);
        
        // Check per-target limit (max 5 per minute)
        if (countPerTarget[user][targetId] + toAdd > 5) revert ErrRateLimitPerTarget();
        
        // Check total limit (max 20 per minute)
        if (countTotal[user] + toAdd > 20) revert ErrRateLimitTotal();
        
        // Update counters
        countPerTarget[user][targetId] += toAdd;
        countTotal[user] += toAdd;
    }
    
    /// @dev Single attack
    function attack(uint256 fromId, uint256 toId, uint256 amountToken18) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyWholeTokens(amountToken18)
    {
        // 1. Checks
        if (!countries[fromId].exists || !countries[toId].exists) revert ErrInvalidCountry();
        if (fromId == toId) revert ErrInvalidCountry();
        if (userBalances[fromId][msg.sender] < amountToken18) revert ErrInsufficientBalance();
        
        Country storage attacker = countries[fromId];
        Country storage target = countries[toId];
        
        // Rate limit check (1 attack)
        _checkRateLimit(msg.sender, toId, 1);
        
        // 2. Get tier parameters
        (uint64 delta8, uint256 feeAmt, bool isUSDC) = _getAttackTier(attacker.price8);
        
        // 3. Fee collection FIRST (reverts => no state change)
        _chargeFee(msg.sender, feeAmt, isUSDC);
        
        // 4. Price updates
        attacker.price8 += delta8;
        
        // Floor guard for target
        if (target.price8 > delta8) {
            target.price8 -= delta8;
        } else {
            target.price8 = cfg.priceMin8;
        }
        
        // 5. Counters
        attacker.attacks += 1;
        target.attacks += 1;
        
        // 6. Event
        emit Attack(fromId, toId, msg.sender, amountToken18, feeAmt, attacker.price8, target.price8);
    }
    
    /// @dev Batch attack (max 5) - 2-phase with snapshotted tier/fee values
    function attackBatch(AttackItem[] calldata items) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        uint256 len = items.length;
        if (len == 0 || len > 5) revert ErrBatchTooLarge();
        
        // ===== PHASE 1: VALIDATION + RATE LIMIT + SNAPSHOT TIERS/FEES + FEE COLLECTION =====
        
        // Memory arrays to snapshot tier parameters (prevents tier drift during batch)
        uint64[] memory deltas = new uint64[](len);
        uint256[] memory fees = new uint256[](len);
        bool isUSDC = cfg.attackFeeInUSDC;
        
        // 1a) Basic validation
        for (uint256 i = 0; i < len; i++) {
            AttackItem calldata it = items[i];
            if (it.amountToken18 == 0 || it.amountToken18 % 1e18 != 0) revert ErrOnlyWholeTokens();
            if (!countries[it.fromId].exists || !countries[it.toId].exists) revert ErrInvalidCountry();
            if (it.fromId == it.toId) revert ErrInvalidCountry();
            if (userBalances[it.fromId][msg.sender] < it.amountToken18) revert ErrInsufficientBalance();
        }
        
        // 1b) Per-target rate limit check (O(n²) for small batch)
        for (uint256 i = 0; i < len; i++) {
            uint256 tgt = items[i].toId;
            uint16 cnt = 0;
            
            // Count attacks per target
            for (uint256 j = 0; j < len; j++) {
                if (items[j].toId == tgt) cnt++;
            }
            
            // Check only once per unique target
            bool isFirst = true;
            for (uint256 k = 0; k < i; k++) {
                if (items[k].toId == tgt) {
                    isFirst = false;
                    break;
                }
            }
            
            if (isFirst) {
                _checkRateLimit(msg.sender, tgt, cnt);
            }
        }
        
        // 1c) Snapshot tier parameters & calculate total fee
        uint256 totalFee = 0;
        for (uint256 i = 0; i < len; i++) {
            Country storage A = countries[items[i].fromId];
            (uint64 d, uint256 f, ) = _getAttackTier(A.price8);
            deltas[i] = d;
            fees[i] = f;
            totalFee += f;
        }
        
        // 1d) Charge total fee FIRST (atomic: reverts before any state change)
        _chargeFee(msg.sender, totalFee, isUSDC);
        
        // ===== PHASE 2: STATE UPDATES USING SNAPSHOTTED VALUES =====
        
        for (uint256 i = 0; i < len; i++) {
            AttackItem calldata it = items[i];
            Country storage A = countries[it.fromId];
            Country storage B = countries[it.toId];
            
            // Use snapshotted values (no tier drift)
            uint64 d = deltas[i];
            uint256 f = fees[i];
            
            // Price updates
            A.price8 += d;
            
            if (B.price8 > d) {
                B.price8 -= d;
            } else {
                B.price8 = cfg.priceMin8;
            }
            
            // Counters
            A.attacks += 1;
            B.attacks += 1;
            
            // Event (feeAmount matches what was charged)
            emit Attack(it.fromId, it.toId, msg.sender, it.amountToken18, f, A.price8, B.price8);
        }
    }
}
