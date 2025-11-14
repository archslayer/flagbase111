# FlagBase

An on-chain strategy game where players attack and defend country flags, with dynamic pricing, achievements, and referral rewards running on Base Sepolia.

## Project Overview

This repository contains a full-stack web3 game application combining on-chain smart contracts with off-chain infrastructure for optimal user experience.

**Components:**
- **Next.js Frontend & API** (`app/`) - React-based UI with API routes for game interactions
- **Smart Contracts** (`contracts/`) - Core game logic, pricing mechanics, and achievement system
- **Background Workers** (`workers/`) - Async processing for attack events, analytics, claims, and referrals
- **Support Libraries** (`lib/`, `idempotency/`) - Shared utilities, RPC clients, idempotency helpers, and type definitions

**Architecture:**
The game uses a hybrid on-chain/off-chain model:
- **On-chain**: Core game mechanics (country pricing, attacks, achievements) are handled by Solidity contracts
- **Off-chain**: Workers and API routes handle idempotency, rate limiting, analytics, and user authentication for improved UX

**Current Network:** Base Sepolia (Chain ID: 84532)

## Tech Stack

- **Frontend/Backend**: Next.js 14 (App Router), TypeScript, React 18
- **Blockchain**: Solidity 0.8.24, Hardhat, Viem, Wagmi
- **Queue System**: BullMQ, Redis (ioredis)
- **Database**: MongoDB
- **Authentication**: SIWE (Sign-In with Ethereum), JWT (jose)
- **Type Safety**: TypeScript with strict mode, TypeChain for contract types

## Repository Layout

- `app/` - Next.js pages and API routes (attacks, trades, market, profile, achievements, quests)
- `contracts/` - Solidity contracts:
  - `FlagWarsCore_Static.sol` - Main game contract (pricing, attacks, country management)
  - `Achievements.sol`, `AchievementsSBT.sol` - Achievement system
  - `FlagToken.sol`, `FlagWarsToken.sol` - Country flag tokens
- `workers/` - Background job processors:
  - `attack-events.worker.ts` - Processes attack transactions and updates state
  - `analytics-write.worker.ts` - Writes analytics data
  - `claim-processor.worker.ts` - Processes referral claims
  - `sync-referral-stats.worker.ts` - Syncs referral statistics
  - `prewarm.worker.ts` - Cache prewarming
  - `lease-recovery.worker.ts` - Lease recovery operations
  - `user-onboarder.ts` - User onboarding
- `lib/` - Shared utilities:
  - `attack-flow.ts`, `attackQueue/` - Attack processing logic
  - `contracts.ts`, `core.ts` - Contract interaction helpers
  - `rpc/` - RPC client management and multicall utilities
  - `idempotency.ts`, `idempotency-*.ts` - Idempotency helpers
  - `mongodb.ts`, `redis.ts` - Database clients
  - `jwt.ts`, `adminAuth.ts` - Authentication
  - `referral.ts` - Referral system
  - `achievements*.ts` - Achievement system helpers
  - `schemas/` - MongoDB schemas
- `idempotency/` - Idempotency key management and handlers
- `typechain-types/` - Generated TypeScript types for contracts
- `scripts/` - Hardhat deployment scripts and maintenance utilities
- `tests/` - Test files (unit tests, live tests, full system tests)
- `spec/` - Game specification document (`flagwars.spec.json`)

## Getting Started

### Prerequisites

- Node.js (check `package.json` for version requirements)
- pnpm (package manager)
- MongoDB instance
- Redis instance
- Base Sepolia RPC endpoint (or use public RPC)

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd flagwars2
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure environment variables**
   
   Create a `.env.local` file in the root directory with the following variables (based on actual usage in code):
   
   ```env
   # Database
   MONGODB_URI=your_mongodb_connection_string
   DATABASE_URL=your_mongodb_connection_string
   
   # Redis
   REDIS_URL=your_redis_connection_string
   REDIS_HOST=your_redis_host
   REDIS_PORT=your_redis_port
   REDIS_PASSWORD=your_redis_password
   REDIS_USERNAME=default
   
   # Blockchain
   NEXT_PUBLIC_RPC_BASE_SEPOLIA=https://sepolia.base.org
   NEXT_PUBLIC_CORE_ADDRESS=0x...
   NEXT_PUBLIC_USDC_ADDRESS=0x...
   NEXT_PUBLIC_CHAIN_ID=84532
   
   # Token Addresses
   TOKEN_TR_ADDRESS=0x...
   TOKEN_UK_ADDRESS=0x...
   TOKEN_US_ADDRESS=0x...
   
   # Authentication
   JWT_SECRET=your_jwt_secret
   REFERRAL_SECRET=your_referral_secret
   ADMIN_PASSWORD=your_admin_password
   NEXT_PUBLIC_ADMIN_PASSWORD=your_admin_password
   
   # Deployment (for scripts)
   DEPLOYER_PK=0x...
   TREASURY_PRIVATE_KEY=0x...
   
   # Feature Flags
   USE_REDIS=true
   USE_QUEUE=true
   FEATURE_QUESTS=true
   MAX_FREE_ATTACKS_PER_USER=2
   ```
   
   **Note:** Do not commit `.env.local` to version control. See `.gitignore` for excluded files.

4. **Compile contracts**
   ```bash
   pnpm compile
   ```

5. **Run development server**
   ```bash
   pnpm dev
   ```
   
   The app will be available at `http://localhost:3000`

6. **Run background workers** (in separate terminals)
   ```bash
   pnpm worker:attack
   pnpm worker:analytics
   pnpm worker:claims
   pnpm worker:sync-stats
   ```

### Development Commands

- `pnpm dev` - Start Next.js development server
- `pnpm build` - Build production bundle
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm compile` - Compile Hardhat contracts
- `pnpm hardhat` - Run Hardhat CLI

### Testing

- `pnpm test:full` - Run full test suite
- `pnpm test:attack:live` - Run live attack tests
- `pnpm test:attack:readonly` - Run readonly attack tests

## Architecture and Game Mechanics

### Architecture

**Frontend:**
- Next.js App Router with React Server Components
- API routes handle game interactions (attacks, trades, market data)
- Server-Sent Events (SSE) for real-time price updates
- Wallet integration via Wagmi/RainbowKit

**Workers:**
- **Attack Events Worker**: Processes attack transactions, updates MongoDB state, syncs achievements
- **Analytics Worker**: Writes analytics data to database
- **Claims Processor**: Processes referral reward claims
- **Stats Sync Worker**: Syncs referral statistics
- **Prewarm Worker**: Preloads cache for performance
- **Lease Recovery**: Recovers stuck leases
- **User Onboarder**: Handles new user onboarding

**Contracts:**
- **FlagWarsCore**: Implements static half-step pricing model, attack mechanics, country management, anti-dump protection, cooldown system, and free attack tracking
- **Achievements**: SBT-based achievement system
- **Flag Tokens**: ERC20 tokens representing country flags

### Game Loop

A typical attack flow:

1. **Player triggers attack** via frontend (`/attack` page)
2. **API validates** (`/api/trade/attack`):
   - Idempotency check (prevents duplicate attacks)
   - Rate limiting
   - Anti-abuse validation
3. **Attack job enqueued** to Redis queue
4. **Background worker** (`attack-events.worker.ts`):
   - Processes attack transaction on-chain
   - Updates MongoDB with attack event
   - Syncs achievement progress
   - Clears relevant caches
5. **Frontend polls** for transaction status and updates UI

**Pricing Model:**
- Static half-step pricing (see `spec/flagwars.spec.json` for details)
- Buy fee: 0%
- Sell fee: 5% (500 bps)
- Referral share: 30% of fees
- Revenue share: 70% of fees

## Environments and Deployment

**Current Configuration:**
- Network: Base Sepolia (Chain ID: 84532)
- RPC: Configurable via `NEXT_PUBLIC_RPC_BASE_SEPOLIA`
- Contract addresses: Set via environment variables (see `lib/addresses.ts`)

**Deployment Scripts:**
- `pnpm deploy` - Deploy core contract
- `pnpm init` - Initialize contract configuration
- `pnpm seed` - Seed countries
- `pnpm verify` - Verify contracts on Basescan

**Production Deployment:**
Production/mainnet deployment should be configured separately with appropriate environment variables and contract addresses. The current setup is configured for Base Sepolia testnet.

## Development Workflow and Quality

### Code Quality

- **Type Checking**: Run `pnpm typecheck` before committing
- **Linting**: Run `pnpm lint` to check code style
- **TypeScript**: Strict mode enabled (`tsconfig.json`)

### Testing

- Unit tests: `test/` directory
- Live tests: `tests/live/` directory
- Full system tests: `tests/full/` directory

### Documentation

- Game specification: `spec/flagwars.spec.json`
- Typecheck fixes report: `reports/typecheck-fixes-20251114.md`

## Contributing

### How to Contribute

1. **Open Issues**: Report bugs or suggest features via GitHub issues
2. **Run Tests**: Ensure all tests pass before submitting PRs
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test:full
   ```
3. **Follow Code Style**: Adhere to existing TypeScript/React patterns
4. **Document Changes**: Update relevant documentation for significant changes



## License

This project is licensed under the MIT License - see the `LICENSE` file for details.

