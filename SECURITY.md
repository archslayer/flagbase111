# Security Policy

## Assets

This document outlines the security considerations for FlagBase, an on-chain strategy game with off-chain infrastructure.

### Protected Assets

1. **Treasury Reserves**
   - USDC balances held in the core contract treasury
   - Token reserves for country flags
   - Revenue and commission wallets

2. **User Balances**
   - User flag token holdings (ERC20 tokens)
   - User USDC balances
   - Free attack allocations
   - Achievement progress and SBT tokens

3. **Redis/Mongo Queues and Idempotency Store**
   - Attack job queues (BullMQ/Redis)
   - Idempotency keys preventing duplicate transactions
   - User state and session data (MongoDB)
   - Analytics and referral tracking data

## Threat Model

### Queue Abuse (Spam, Replay)

**Risk:** Attackers may attempt to:
- Spam the attack queue with duplicate or invalid jobs
- Replay old attack transactions
- Overwhelm workers with malicious job submissions

**Mitigations:**
- Idempotency keys prevent duplicate attack processing
- Rate limiting on API endpoints (`lib/rate-limit.ts`)
- In-flight request tracking to prevent concurrent duplicate requests
- Queue job deduplication via Redis

### Idempotency Bypass

**Risk:** Attackers may attempt to:
- Bypass idempotency checks to execute duplicate attacks
- Reuse idempotency keys from expired or completed transactions
- Manipulate idempotency key generation

**Mitigations:**
- Deterministic idempotency key generation using `keccak256(wallet | fromId | toId)` for attacks
- Idempotency keys stored in Redis with TTL
- Key format: `attack:{wallet}:{fromId}:{toId}` ensures uniqueness per attack attempt
- Idempotency handler (`idempotency/handler.ts`) wraps critical API routes

### Oracle / RPC Manipulation

**Risk:** Attackers may attempt to:
- Manipulate RPC responses to affect price calculations
- Exploit RPC failures or inconsistencies
- Use malicious RPC endpoints to read incorrect contract state

**Mitigations:**
- Multiple RPC endpoints with fallback support (`lib/rpc/`)
- RPC health checks and monitoring
- On-chain price verification (prices stored on-chain, not from oracles)
- Contract reads use multicall for batch operations with validation

### Admin Misconfiguration

**Risk:** Admin panel or configuration errors may:
- Expose sensitive endpoints
- Allow unauthorized access to admin functions
- Misconfigure contract parameters (fees, limits, addresses)

**Mitigations:**
- Admin authentication via wallet address whitelist (`lib/adminAuth.ts`)
- Admin password protection (environment variable)
- Admin endpoints require both wallet verification and password
- Contract ownership uses OpenZeppelin's `Ownable2Step` for secure transfers

## Mitigations

### Anti-Dump Rules

The core contract implements anti-dump protection to prevent large sell-offs:

- **Tiered Protection:** Four tiers based on sell percentage (10%, 15%, 20%, 25% of reserve)
- **Extra Fees:** Additional fees applied (5%, 8%, 12%, 15% of proceeds)
- **Cooldown Periods:** Country-specific cooldowns (60s, 5m, 20m, 4h)
- **Reserve-Based Calculation:** Sell percentage calculated against country's USDC reserve

See `contracts/FlagWarsCore_Static.sol` for implementation details.

### War Balance

War balance reduces price delta when a country is under heavy attack:

- **Tier 1:** 2000 attacks in 5 minutes → 60% delta multiplier
- **Tier 2:** 10000 attacks in 1 hour → 80% delta multiplier
- **Target-Based:** Applied per target country, not per attacker
- **Automatic:** Applied during attack processing on-chain

### Idempotency Key Design

- **Attack Keys:** `attack:{wallet}:{fromId}:{toId}` - Prevents duplicate attacks
- **Claim Keys:** `keccak256(wallet | amount | token | claimId)` - Prevents duplicate reward claims
- **Storage:** Redis with TTL expiration
- **Validation:** Keys checked before queueing jobs and processing transactions

### Rate Limiting / Auth

- **SIWE Authentication:** Sign-In with Ethereum for wallet-based auth
- **JWT Tokens:** Server-side session management with `jose` library
- **Rate Limiting:** Redis-based rate limiting on API endpoints
- **In-Flight Tracking:** Prevents concurrent duplicate requests
- **IP-Based Limits:** Additional protection for sensitive endpoints

## Open Risks

### Known Limitations

1. **Frontend Security:** Client-side code is inherently exposed. Critical validations must be enforced on-chain or server-side.

2. **RPC Dependency:** While multiple RPC endpoints are supported, RPC failures could impact user experience. On-chain state remains the source of truth.

3. **Worker Availability:** Background workers must be running for attack processing. Worker failures may delay transaction processing but do not affect on-chain state.

4. **Admin Key Management:** Admin private keys and passwords must be securely stored. Compromise of admin credentials could allow unauthorized access.

5. **MongoDB/Redis Security:** Database and cache credentials must be protected. Exposure could allow data manipulation or DoS attacks.

### Areas for Future Hardening

- Multi-signature wallet support for treasury operations
- Formal verification of critical contract functions
- Enhanced monitoring and alerting for suspicious activity
- Automated security scanning in CI/CD pipeline
- Regular security audits of smart contracts and infrastructure

## Responsible Disclosure

### Reporting Security Vulnerabilities

If you discover a security vulnerability, please follow these steps:

1. **Do NOT** create a public GitHub issue
2. **Do NOT** disclose the vulnerability publicly until it has been addressed
3. **Email** security concerns to: [security contact email - to be configured]
4. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

- **Initial Response:** Within 48 hours
- **Status Update:** Within 7 days
- **Resolution:** Depends on severity and complexity

### Scope

**In Scope:**
- Smart contract vulnerabilities (FlagWarsCore, Achievements, Token contracts)
- Critical API endpoint vulnerabilities
- Authentication and authorization bypasses
- Idempotency and queue manipulation
- Treasury and user fund security

**Out of Scope:**
- Frontend UI/UX issues (unless they lead to security vulnerabilities)
- Denial of service attacks (unless they affect on-chain operations)
- Social engineering attacks
- Physical security
- Issues in third-party dependencies (report to respective projects)

### Recognition

We appreciate responsible disclosure and may recognize security researchers who help improve FlagBase's security. Recognition will be given with permission and after the vulnerability has been resolved.

### Legal

We will not pursue legal action against security researchers who:
- Act in good faith
- Do not access or modify data beyond what is necessary to demonstrate the vulnerability
- Do not disclose the vulnerability publicly before it is resolved
- Comply with responsible disclosure practices

