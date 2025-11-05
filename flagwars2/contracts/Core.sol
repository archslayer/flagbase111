// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title Core
 * @dev Simplified market contract with treasury-based supply
 */
contract Core is Ownable, Pausable, ReentrancyGuard {
    address public immutable USDC;
    address public immutable TREASURY;
    address public immutable REVENUE; // Attack fees go here
    uint16 public buyFeeBps = 0; // 0%
    uint16 public sellFeeBps = 0; // 0%

    // Authorization for modules (e.g., external attack contracts)
    mapping(address => bool) public isAuthorized;

    struct Country {
        string name;
        address token;
        bool exists;
        uint256 price8;        // Current price in PRICE8 units
        uint32 kappa8;         // Price increment per buy
        uint32 lambda8;        // Price decrement per sell
        uint256 priceMin8;     // Price floor
    }

    mapping(uint256 => Country) public countries;

    event CountryAdded(uint256 indexed id, string name, address token);
    event Bought(uint256 indexed id, address user, uint256 amount, uint256 usdcPaid, uint256 fee);
    event Sold(uint256 indexed id, address user, uint256 amount, uint256 usdcReceived, uint256 fee);

    constructor(address usdc, address treasury, address revenue) {
        require(usdc != address(0), "Core: bad usdc");
        require(treasury != address(0), "Core: bad treasury");
        require(revenue != address(0), "Core: bad revenue");
        _transferOwnership(msg.sender);
        USDC = usdc;
        TREASURY = treasury;
        REVENUE = revenue;
    }

    function setFees(uint16 buyFee, uint16 sellFee) external onlyOwner {
        require(buyFee <= 500 && sellFee <= 500, "Core: fees too high");
        buyFeeBps = buyFee;
        sellFeeBps = sellFee;
    }

    function addCountry(
        uint256 id,
        string memory name,
        address token,
        uint256 price8Start,
        uint32 kappa8,
        uint32 lambda8,
        uint256 priceMin8
    ) external onlyOwner {
        require(!countries[id].exists, "Core: country exists");
        require(token != address(0), "Core: bad token");
        countries[id] = Country(
            name,
            token,
            true,
            price8Start,
            kappa8,
            lambda8,
            priceMin8
        );
        emit CountryAdded(id, name, token);
    }

    /**
     * @dev Get remaining supply from Core balance
     */
    function remainingSupply(uint256 id) public view returns (uint256) {
        if (!countries[id].exists) return 0;
        return IERC20(countries[id].token).balanceOf(address(this));
    }

    /**
     * @dev Internal quote buy calculation (STATIC_HALF_STEP model)
     * totalPrice8 = n * P + kappa8 * n * (n-1) / 2
     */
    function _quoteBuy(uint256 id, uint256 amount18) internal view returns (
        uint256 gross,
        uint256 fee,
        uint256 net
    ) {
        Country storage c = countries[id];
        uint256 n = amount18 / 1e18;
        uint256 linearTerm = n * c.price8;
        uint256 quadraticTerm = (c.kappa8 * n * (n - 1)) / 2;
        uint256 totalPrice8 = linearTerm + quadraticTerm;
        
        gross = totalPrice8 / 100; // PRICE8 -> USDC6
        fee = (gross * buyFeeBps) / 10000;
        net = gross + fee;
    }

    /**
     * @dev Quote buy price (external view for UI)
     */
    function quoteBuy(uint256 id, uint256 amount18) external view returns (
        uint256 grossUSDC6,
        uint256 feeUSDC6,
        uint256 netUSDC6
    ) {
        require(countries[id].exists, "Core: country not found");
        require(amount18 > 0, "Core: amount zero");
        require(amount18 % 1e18 == 0, "Core: whole tokens only");
        
        (grossUSDC6, feeUSDC6, netUSDC6) = _quoteBuy(id, amount18);
    }

    /**
     * @dev Buy tokens from treasury
     */
    function buy(uint256 id, uint256 amount18, uint256 maxInUSDC6, uint256 deadline) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(block.timestamp <= deadline, "Core: deadline passed");
        require(countries[id].exists, "Core: country not found");
        require(amount18 > 0 && amount18 % 1e18 == 0, "Core: invalid amount");

        Country storage c = countries[id];
        
        // Check treasury has enough tokens
        uint256 remaining = remainingSupply(id);
        require(remaining >= amount18, "Core: insufficient supply");

        // Calculate cost (internal call, no gas overhead)
        (, uint256 feeUSDC6, uint256 netUSDC6) = _quoteBuy(id, amount18);
        require(netUSDC6 <= maxInUSDC6, "Core: slippage exceeded");

        // Transfer USDC from user
        IERC20(USDC).transferFrom(msg.sender, address(this), netUSDC6);

        // Transfer tokens from Core to user (Core holds the inventory)
        require(
            IERC20(c.token).balanceOf(address(this)) >= amount18,
            "Core: insufficient supply"
        );
        IERC20(c.token).transfer(msg.sender, amount18);

        // Update price: P' = P + kappa8 * n
        uint256 n = amount18 / 1e18;
        c.price8 += c.kappa8 * n;

        emit Bought(id, msg.sender, amount18, netUSDC6, feeUSDC6);
    }

    /**
     * @dev Internal quote sell calculation (STATIC_HALF_STEP model with floor)
     * totalPrice8 = max(0, n * P - lambda8 * n * (n-1) / 2)
     */
    function _quoteSell(uint256 id, uint256 amount18) internal view returns (
        uint256 gross,
        uint256 fee,
        uint256 net
    ) {
        Country storage c = countries[id];
        uint256 n = amount18 / 1e18;
        uint256 linearTerm = n * c.price8;
        uint256 quadraticTerm = (c.lambda8 * n * (n - 1)) / 2;
        
        // Floor protection: max(0, linear - quadratic)
        uint256 totalPrice8 = linearTerm > quadraticTerm ? (linearTerm - quadraticTerm) : 0;
        
        gross = totalPrice8 / 100; // PRICE8 -> USDC6
        fee = (gross * sellFeeBps) / 10000;
        net = gross - fee;
    }

    /**
     * @dev Quote sell price (external view for UI)
     */
    function quoteSell(uint256 id, uint256 amount18) external view returns (
        uint256 grossUSDC6,
        uint256 feeUSDC6,
        uint256 netUSDC6
    ) {
        require(countries[id].exists, "Core: country not found");
        require(amount18 > 0, "Core: amount zero");
        require(amount18 % 1e18 == 0, "Core: whole tokens only");

        (grossUSDC6, feeUSDC6, netUSDC6) = _quoteSell(id, amount18);
    }

    /**
     * @dev Sell tokens back to treasury
     */
    function sell(uint256 id, uint256 amount18, uint256 minOutUSDC6, uint256 deadline) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(block.timestamp <= deadline, "Core: deadline passed");
        require(countries[id].exists, "Core: country not found");
        require(amount18 > 0 && amount18 % 1e18 == 0, "Core: invalid amount");

        Country storage c = countries[id];
        
        // Calculate proceeds (internal call, no gas overhead)
        (, uint256 feeUSDC6, uint256 netUSDC6) = _quoteSell(id, amount18);
        require(netUSDC6 >= minOutUSDC6, "Core: slippage exceeded");

        // Check contract has enough USDC
        require(IERC20(USDC).balanceOf(address(this)) >= netUSDC6, "Core: insufficient USDC");

        // Transfer tokens from user to Core (Core holds them)
        IERC20(c.token).transferFrom(msg.sender, address(this), amount18);

        // Transfer USDC to user
        IERC20(USDC).transfer(msg.sender, netUSDC6);

        // Update price with floor protection: P' = max(priceMin8, P - lambda8 * n)
        uint256 n = amount18 / 1e18;
        uint256 priceDecrement = c.lambda8 * n;
        uint256 newPrice = c.price8 > priceDecrement ? (c.price8 - priceDecrement) : 0;
        c.price8 = newPrice < c.priceMin8 ? c.priceMin8 : newPrice;

        emit Sold(id, msg.sender, amount18, netUSDC6, feeUSDC6);
    }

    /**
     * @dev Sell tokens using EIP-2612 permit (no approval needed)
     * @param id Country ID
     * @param amount18 Amount of tokens to sell (in 18 decimals)
     * @param minOutUSDC6 Minimum USDC to receive (slippage guard)
     * @param tradeDeadline Deadline for the trade
     * @param permitDeadline Deadline for the permit signature
     * @param v Signature v component
     * @param r Signature r component
     * @param s Signature s component
     */
    function sellWithPermit(
        uint256 id,
        uint256 amount18,
        uint256 minOutUSDC6,
        uint256 tradeDeadline,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant whenNotPaused {
        require(block.timestamp <= tradeDeadline, "Core: trade deadline passed");
        require(countries[id].exists, "Core: country not found");
        require(amount18 > 0 && amount18 % 1e18 == 0, "Core: invalid amount");

        Country storage c = countries[id];
        
        // Calculate proceeds
        (, uint256 feeUSDC6, uint256 netUSDC6) = _quoteSell(id, amount18);
        require(netUSDC6 >= minOutUSDC6, "Core: slippage exceeded");

        // Check contract has enough USDC
        require(IERC20(USDC).balanceOf(address(this)) >= netUSDC6, "Core: insufficient USDC");

        // Use EIP-2612 permit to authorize transfer
        IERC20Permit(c.token).permit(
            msg.sender,
            address(this),
            amount18,
            permitDeadline,
            v,
            r,
            s
        );

        // Transfer tokens from user to Core
        IERC20(c.token).transferFrom(msg.sender, address(this), amount18);

        // Transfer USDC to user
        IERC20(USDC).transfer(msg.sender, netUSDC6);

        // Update price with floor protection: P' = max(priceMin8, P - lambda8 * n)
        uint256 n = amount18 / 1e18;
        uint256 priceDecrement = c.lambda8 * n;
        uint256 newPrice = c.price8 > priceDecrement ? (c.price8 - priceDecrement) : 0;
        c.price8 = newPrice < c.priceMin8 ? c.priceMin8 : newPrice;

        emit Sold(id, msg.sender, amount18, netUSDC6, feeUSDC6);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ===== AUTHORIZATION & USDC PULL =====

    /**
     * @dev Set authorized address (for external modules that need to pull USDC)
     */
    function setAuthorized(address who, bool v) external onlyOwner {
        isAuthorized[who] = v;
    }

    /**
     * @dev Pull USDC from user (only authorized contracts can call this)
     * This allows external attack modules to charge USDC fees via Core
     */
    function pullUSDCFrom(address from, uint256 amount, address to) external {
        require(isAuthorized[msg.sender], "Core: not authorized");
        require(IERC20(USDC).transferFrom(from, to, amount), "Core: pull failed");
    }

    // ===== ATTACK FUNCTIONS =====

    /**
     * @dev Preview attack fee based on attacker's price tier
     * Tier thresholds from spec (price8 format: USDC * 1e8):
     * - Tier 1 (≤ 5 USDC): 0.30 USDC fee, delta 0.0013
     * - Tier 2 (5.000001 - 10 USDC): 0.35 USDC fee, delta 0.0011
     * - Tier 3 (> 10 USDC): 0.40 USDC fee, delta 0.0009
     */
    function previewAttackFee(address user, uint256 attackerPrice8) public view returns (
        uint256 baseFeeUSDC6,
        uint256 appliedTier,
        uint256 appliedMulBps,
        uint256 finalFeeUSDC6,
        bool isFreeAttackAvailable
    ) {
        // Tier determination based on attacker's price (price8 = USDC * 1e8)
        if (attackerPrice8 > 10e8) {
            // Tier 3: > 10 USDC
            appliedTier = 3;
            baseFeeUSDC6 = 400000; // 0.40 USDC
        } else if (attackerPrice8 > 5e8) {
            // Tier 2: 5.000001 - 10 USDC
            appliedTier = 2;
            baseFeeUSDC6 = 350000; // 0.35 USDC
        } else {
            // Tier 1: ≤ 5 USDC
            appliedTier = 1;
            baseFeeUSDC6 = 300000; // 0.30 USDC
        }
        
        // No War Balance multipliers for now (TODO: Implement WB system)
        appliedMulBps = 0; // 0 bps = no bonus applied
        finalFeeUSDC6 = baseFeeUSDC6;
        isFreeAttackAvailable = false; // TODO: Implement free attack logic based on user's attack history
    }

    /**
     * @dev Get war balance state for WB multipliers
     */
    function getWarBalanceState(address user) external view returns (
        uint256 wb1Count,
        uint256 wb1Threshold,
        uint256 wb1Window,
        uint256 wb1Multiplier,
        uint256 wb1MulBps,
        uint256 wb2Count,
        uint256 wb2Threshold,
        uint256 wb2Window,
        uint256 wb2Multiplier,
        uint256 wb2MulBps,
        uint256 currentMultiplier
    ) {
        // Placeholder implementation
        return (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    /**
     * @dev Attack from one country to another
     * @param fromId Attacker country ID
     * @param toId Target country ID
     * @param amountToken18 Amount of tokens to attack with (always 1 token)
     */
    function attack(uint256 fromId, uint256 toId, uint256 amountToken18) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(fromId != toId, "Core: cannot attack self");
        require(amountToken18 > 0 && amountToken18 % 1e18 == 0, "Core: invalid amount");
        require(countries[fromId].exists && countries[toId].exists, "Core: country not found");
        
        // 1) Check user has enough tokens (ownership check, no transfer)
        require(
            IERC20(countries[fromId].token).balanceOf(msg.sender) >= amountToken18,
            "Core: insufficient flag balance"
        );
        
        // 2) Calculate attack fee
        (,, , uint256 feeUSDC6,) = previewAttackFee(msg.sender, countries[fromId].price8);
        
        // 3) Charge fee: User → Core → REVENUE (single allowance to Core for both buy and attack)
        require(
            IERC20(USDC).transferFrom(msg.sender, address(this), feeUSDC6),
            "Core: fee transfer failed"
        );
        require(
            IERC20(USDC).transfer(REVENUE, feeUSDC6),
            "Core: revenue transfer failed"
        );
        
        // 4) Price updates
        Country storage atk = countries[fromId];
        Country storage tgt = countries[toId];
        
        uint256 n = amountToken18 / 1e18;
        
        // Attacker price increases
        atk.price8 += atk.kappa8 * uint32(n);
        
        // Target price decreases with floor protection
        uint256 dec = tgt.lambda8 * uint32(n);
        uint256 newPrice = tgt.price8 > dec ? (tgt.price8 - dec) : 0;
        tgt.price8 = newPrice < tgt.priceMin8 ? tgt.priceMin8 : newPrice;
        
        emit Attack(fromId, toId, msg.sender, amountToken18, feeUSDC6);
    }

    /**
     * @dev Batch attack (up to 5 attacks)
     */
    struct AttackItem {
        uint256 fromId;
        uint256 toId;
        uint256 amountToken18;
    }

    function attackBatch(AttackItem[] calldata items) external nonReentrant whenNotPaused {
        require(items.length > 0 && items.length <= 5, "Core: invalid batch size");
        
        uint256 totalFeeUSDC6 = 0;
        
        for (uint256 i = 0; i < items.length; i++) {
            AttackItem memory it = items[i];
            
            require(it.fromId != it.toId, "Core: cannot attack self");
            require(it.amountToken18 > 0 && it.amountToken18 % 1e18 == 0, "Core: invalid amount");
            require(countries[it.fromId].exists && countries[it.toId].exists, "Core: country not found");
            
            // Check ownership (no transfer)
            require(
                IERC20(countries[it.fromId].token).balanceOf(msg.sender) >= it.amountToken18,
                "Core: insufficient flag balance"
            );
            
            // Calculate and accumulate fee
            (,, , uint256 feeUSDC6,) = previewAttackFee(msg.sender, countries[it.fromId].price8);
            totalFeeUSDC6 += feeUSDC6;
            
            // Price updates
            Country storage atk = countries[it.fromId];
            Country storage tgt = countries[it.toId];
            
            uint256 n = it.amountToken18 / 1e18;
            
            // Attacker price increases
            atk.price8 += atk.kappa8 * uint32(n);
            
            // Target price decreases with floor protection
            uint256 dec = tgt.lambda8 * uint32(n);
            uint256 newPrice = tgt.price8 > dec ? (tgt.price8 - dec) : 0;
            tgt.price8 = newPrice < tgt.priceMin8 ? tgt.priceMin8 : newPrice;
            
            emit Attack(it.fromId, it.toId, msg.sender, it.amountToken18, feeUSDC6);
        }
        
        // Collect total fee: User → Core → REVENUE (single allowance to Core)
        require(
            IERC20(USDC).transferFrom(msg.sender, address(this), totalFeeUSDC6),
            "Core: fee transfer failed"
        );
        require(
            IERC20(USDC).transfer(REVENUE, totalFeeUSDC6),
            "Core: revenue transfer failed"
        );
    }

    event Attack(uint256 indexed fromId, uint256 indexed toId, address indexed user, uint256 amount, uint256 fee);
}
