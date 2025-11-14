# Audit Scope

This document defines the scope for security audits of the FlagBase project.

## Smart Contracts

### In Scope

1. **FlagWarsCore_Static.sol** (Primary Contract)
   - Pricing model (static half-step)
   - Attack mechanics
   - Buy/sell functions
   - Anti-dump protection
   - War balance system
   - Free attack tracking
   - Fee distribution (referral, revenue, commissions)
   - Treasury management
   - Country management

2. **Achievements.sol**
   - Achievement definition and validation
   - Achievement minting logic
   - Progress tracking

3. **AchievementsSBT.sol**
   - SBT (Soulbound Token) implementation
   - Minting and burning
   - Transfer restrictions

4. **FlagToken.sol / FlagWarsToken.sol**
   - ERC20 token implementation
   - Minting and burning
   - Transfer restrictions (if any)

### Out of Scope

- Mock contracts (`contracts/mocks/`)
- Test contracts
- Third-party OpenZeppelin contracts (assumed audited)

## Risk Areas

### Critical Risks

1. **Treasury Security**
   - USDC balance management
   - Fee distribution accuracy
   - Withdrawal mechanisms
   - Reentrancy protection

2. **Pricing Model**
   - Price calculation correctness
   - Integer overflow/underflow
   - Precision loss in calculations
   - Edge cases (zero supply, maximum price)

3. **Attack Mechanics**
   - Attack fee calculation
   - Delta price application
   - War balance multiplier application
   - Free attack limits and tracking

4. **Anti-Dump Protection**
   - Tier selection logic
   - Cooldown enforcement
   - Extra fee calculation
   - Reserve percentage calculation

5. **Access Control**
   - Owner functions
   - Pausable functionality
   - Admin role management

### High Priority Risks

1. **Idempotency**
   - Duplicate attack prevention
   - Replay attack protection
   - Key generation uniqueness

2. **Fee Distribution**
   - Referral share calculation (30%)
   - Revenue share calculation (70%)
   - Commission distribution
   - Rounding errors

3. **State Management**
   - Country state consistency
   - User state tracking
   - Attack counter accuracy

4. **Token Operations**
   - Minting limits
   - Burning validation
   - Transfer restrictions

## Exclusions

### Not in Scope

1. **Frontend Code**
   - React components (`app/`, `components/`)
   - Client-side JavaScript/TypeScript
   - UI/UX implementations
   - Wallet connection logic (Wagmi/RainbowKit)

2. **Backend Infrastructure**
   - MongoDB schemas and queries
   - Redis queue implementation
   - Worker processes
   - API route implementations (unless they directly affect on-chain operations)

3. **Configuration and Secrets**
   - Environment variables
   - Private keys
   - Passwords
   - API keys

4. **Testing Infrastructure**
   - Test files (`test/`, `tests/`)
   - Deployment scripts
   - Hardhat configuration

5. **Documentation**
   - README files
   - Specification documents
   - Comments and code documentation

## Audit Focus Areas

### Mathematical Correctness

- Verify pricing formula implementation matches specification
- Check for integer overflow/underflow in all calculations
- Validate precision handling (8 decimals for price, 18 for tokens, 6 for USDC)
- Ensure fee calculations are accurate and cannot be manipulated

### Access Control

- Verify only authorized addresses can call owner functions
- Check pausable functionality cannot be bypassed
- Validate admin role restrictions
- Ensure user-specific functions properly validate caller

### State Consistency

- Verify country state updates are atomic
- Check attack counters are accurate
- Validate user state tracking (free attacks, cooldowns)
- Ensure no state corruption possible

### Reentrancy Protection

- Verify all external calls use proper reentrancy guards
- Check pull pattern for fee distribution
- Validate state updates before external calls

### Edge Cases

- Zero supply scenarios
- Maximum price scenarios
- Simultaneous attacks on same country
- Large sell amounts (100% of reserve)
- Free attack exhaustion

## Testing Requirements

Auditors should test:

1. **Unit Tests:** All critical functions with edge cases
2. **Integration Tests:** Full attack flow, buy/sell flows
3. **Fuzz Testing:** Random inputs for pricing calculations
4. **Formal Verification:** Critical mathematical formulas (if applicable)

## Deliverables

Expected audit deliverables:

1. **Executive Summary:** High-level findings and risk assessment
2. **Detailed Report:** 
   - Vulnerability descriptions
   - Severity ratings (Critical, High, Medium, Low)
   - Proof of concept (if applicable)
   - Recommended fixes
3. **Code Review Notes:** Line-by-line comments on critical sections
4. **Test Coverage Analysis:** Gaps in existing test coverage

## Contact

For audit-related questions or to submit audit reports:
- GitHub Issues: [Use private security advisory if available]
- Email: [Security contact - to be configured]

## Version

- **Contract Version:** FlagWarsCore_Static.sol (v6)
- **Solidity Version:** 0.8.24
- **Network:** Base Sepolia (Chain ID: 84532)
- **Last Updated:** 2025-01-15

