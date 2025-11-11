# Quest System Implementation Report

**Date:** 2025-01-30  
**Feature:** Discord Quest System with Free Attack Rewards  
**Status:** ✅ Implementation Complete

---

## 📋 Executive Summary

Successfully implemented a complete Quest system with Discord OAuth integration that allows users to earn free attacks by joining the Flag Wars Discord server and obtaining the Flag Folks role. The system includes comprehensive security measures, rate limiting, idempotency protection, and a user-friendly UI.

---

## 🎯 Feature Overview

### Core Functionality
- **Quest Type:** Discord-based communication quest
- **Reward:** 1 Free Attack per user
- **Maximum Claims:** 2 free attacks total per user (system-wide limit)
- **Requirements:**
  1. User must join Flag Base Discord server
  2. User must have Flag Folks role
  3. User must own at least 1 flag

### Security Features
- JWT-based authentication for all API endpoints
- Rate limiting: 3 requests per 30 seconds per user
- Idempotency locks to prevent duplicate claims
- Feature flag: `FEATURE_QUESTS=true`
- Discord bot token verification for role checking

---

## 📁 Files Created

### Core Libraries
1. **`lib/discord.ts`** - Discord OAuth & role verification
   - `getDiscordAccessToken()` - Exchange OAuth code for token
   - `getDiscordUser()` - Fetch Discord user info
   - `getGuildMemberRoles()` - Check guild membership and roles

2. **`lib/schemas/quests.ts`** - Quest data schemas
   - QuestDefinition interface
   - QuestClaim interface
   - DiscordOAuthSession interface
   - INITIAL_QUEST_DEFS seed data

### API Routes
3. **`app/api/auth/callback/discord/route.ts`** - OAuth callback handler
   - Exchanges authorization code for access token
   - Stores Discord session in MongoDB
   - Redirects to quest page with success/error

4. **`app/api/quests/my/route.ts`** - Get user quest status
   - Returns enabled quests
   - Shows claimed/unclaimed status
   - Includes Discord connection status
   - Returns freeAttacksClaimed count

5. **`app/api/quests/check-discord/route.ts`** - Verify requirements
   - Checks guild membership
   - Verifies Flag Folks role
   - Validates flag ownership (at least 1 flag)
   - Returns detailed eligibility status

6. **`app/api/quests/claim/route.ts`** - Claim quest reward
   - Rate limit enforcement (3 req/30s)
   - Duplicate claim prevention
   - Quest eligibility verification
   - Idempotency lock protection
   - Increments freeAttacksClaimed counter
   - Updates achv_progress collection

### Database & Scripts
7. **`scripts/init-quests.ts`** - Database initialization
   - Creates MongoDB indexes
   - Seeds quest definitions
   - Sets up collections

### Frontend
8. **`app/quests/page.tsx`** - Quest UI (completely rewritten)
   - Discord connection flow
   - Requirements checker
   - Claim button
   - Status indicators
   - User-friendly messaging

### Enhanced Files
9. **`lib/rl.ts`** - Added async rate limiting
   - `rateLimitAsync()` for Redis-backed rate limiting
   - Falls back to in-memory if Redis unavailable

10. **`package.json`** - Added npm scripts
    - `init:achievements` - Initialize achievements
    - `init:quests` - Initialize quests

---

## 🗄️ Database Schema

### Collections

#### `quests_defs`
```typescript
{
  _id: ObjectId,
  key: string,              // "discord_communication_specialist"
  title: string,            // "Communication Specialist"
  description: string,      // Quest description
  type: 'discord' | 'onchain' | 'social',
  reward: {
    type: 'free_attack' | 'token' | 'badge',
    amount: number
  },
  requirements: {
    minFlags?: number,
    discordRoleId?: string,
    discordGuildId?: string
  },
  enabled: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ key: 1 }` unique

#### `quest_claims`
```typescript
{
  _id: ObjectId,
  userId: string,           // checksummed wallet address
  discordId?: string,       // Discord user ID
  questKey: string,
  claimedAt: Date,
  source: 'discord' | 'onchain' | 'manual',
  txHash?: string,
  rewardGranted: boolean
}
```

**Indexes:**
- `{ userId: 1, questKey: 1 }` unique
- `{ userId: 1, claimedAt: -1 }`

#### `discord_oauth_sessions`
```typescript
{
  _id: ObjectId,
  discordId: string,        // Discord user ID
  username: string,         // username#discriminator
  accessToken: string,
  expiresAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ discordId: 1 }` unique
- `{ expiresAt: 1 }`

#### `achv_progress` (Enhanced)
Added new field:
```typescript
{
  // ... existing fields ...
  freeAttacksClaimed: number  // Total claimed across all quests (max 2)
}
```

**New Index:**
- `{ userId: 1, freeAttacksClaimed: 1 }` partial

---

## 🔐 Security Implementation

### 1. Authentication
- All quest endpoints require JWT session authentication
- Uses `getUserAddressFromJWT()` to extract wallet from cookie

### 2. Rate Limiting
- **Redis-backed:** `rateLimitAsync(userId, 'quest-claim', 3, 30)`
- Falls back to in-memory if Redis unavailable
- Returns remaining count in response

### 3. Idempotency
- **Lock Key:** `quest:lock:{userId}:{questKey}`
- 30-second TTL to prevent concurrent claims
- Manual cleanup in finally block

### 4. Duplicate Prevention
- MongoDB unique index: `{ userId: 1, questKey: 1 }`
- Pre-claim verification in API
- Database constraint as final safeguard

### 5. Feature Flag
- `FEATURE_QUESTS=true` required
- Graceful degradation if disabled
- Easy rollback capability

### 6. Discord Verification
- Bot token authentication for role checks
- Server-side validation only
- Guild ID and role ID from environment

---

## 🔄 User Flow

### 1. Connect Discord
```
User clicks "Connect Discord" 
  → Redirected to Discord OAuth
  → User authorizes app
  → Callback: /api/auth/callback/discord
  → Store session in MongoDB
  → Redirect to /quests?discordId=XXX
```

### 2. Check Requirements
```
User clicks "Check Requirements"
  → POST /api/quests/check-discord
  → Verify guild membership
  → Verify Flag Folks role
  → Verify flag ownership
  → Return status to UI
```

### 3. Claim Reward
```
User clicks "Claim Free Attack"
  → POST /api/quests/claim
  → Rate limit check
  → Duplicate check
  → Idempotency lock
  → Re-verify requirements
  → Insert quest_claims document
  → Increment freeAttacksClaimed
  → Clear cache
  → Return success
```

---

## 🌍 Environment Variables

### Required for Quest System

```bash
# Discord Configuration
DISCORD_CLIENT_ID=1434579419573518376
DISCORD_CLIENT_SECRET=ApO5kCeETm0EI-l5VQLgr5KThiPpL6NL
DISCORD_BOT_TOKEN=<your-bot-token>
DISCORD_GUILD_ID=<your-guild-id>
FLAG_OWNER_ROLE_ID=1434567222189359114

# OAuth Redirect
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/callback/discord
# Production: https://yourdomain.com/api/auth/callback/discord

# Feature Flag
FEATURE_QUESTS=true

# App URL (for redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Production: https://yourdomain.com
```

---

## 🧪 Testing Checklist

### Unit Tests (Manual)
- [x] Discord OAuth token exchange
- [x] Discord guild membership check
- [x] Discord role verification
- [x] Rate limiting enforcement
- [x] Duplicate claim prevention
- [x] Idempotency lock behavior
- [x] Feature flag toggling

### Integration Tests
- [ ] End-to-end Discord connection
- [ ] Requirements verification
- [ ] Claim flow with valid user
- [ ] Claim rejection for invalid requirements
- [ ] Rate limit exceeding
- [ ] Concurrent claim attempts
- [ ] Multiple quests (if added later)

### Security Tests
- [ ] JWT authentication failure
- [ ] Bot token validation
- [ ] Guild ID spoofing
- [ ] Role ID manipulation
- [ ] Session expiration handling

---

## 📊 Database Initialization

### Run Init Script
```bash
npm run init:quests
```

**Expected Output:**
```
🚀 Initializing Quests System...

✓ Connected to MongoDB

📑 Creating indexes...
  ✓ quest_claims (userId, questKey) unique
  ✓ quest_claims (userId, claimedAt)
  ✓ discord_oauth_sessions (discordId) unique
  ✓ discord_oauth_sessions (expiresAt)
  ✓ quests_defs (key) unique
  ✓ achv_progress (userId, freeAttacksClaimed) partial

🌱 Seeding quest definitions...
  ✓ Quest: Communication Specialist

✅ Quest system initialized successfully!

📊 Summary:
  - Collections: quests_defs, quest_claims, discord_oauth_sessions
  - Indexes: 6 created
  - Quest definitions: 1 seeded

✓ MongoDB connection closed
```

---

## 🚀 Deployment Steps

### 1. Environment Setup
```bash
# Add Discord credentials to .env.local
FEATURE_QUESTS=true
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
FLAG_OWNER_ROLE_ID=...
```

### 2. Database Initialization
```bash
npm run init:quests
```

### 3. Build & Deploy
```bash
npm run build
npm start
```

### 4. Verify
- Test Discord OAuth flow
- Verify role checking
- Test claim flow
- Monitor logs for errors

---

## 🐛 Known Limitations

1. **Discord Session Storage:** Access tokens currently stored in plaintext (TODO: encrypt)
2. **Single Quest:** Only one quest implemented (Communication Specialist)
3. **Manual Flag Verification:** Flag count from `achv_progress` - not real-time on-chain
4. **No Quest Cooldown:** User can re-check immediately after failing
5. **Discord Username Display:** Not shown in UI (stored in DB for debugging)

---

## 🔮 Future Enhancements

### Short-term
- [ ] Add second quest (e.g., "Social Warrior" for social sharing)
- [ ] Encrypt Discord access tokens
- [ ] Add quest cooldown timer
- [ ] Display Discord username in UI
- [ ] Add quest history log

### Medium-term
- [ ] On-chain quests (e.g., "First Attack")
- [ ] Quest categories and filters
- [ ] Leaderboard for quest completions
- [ ] Seasonal quest rotation

### Long-term
- [ ] Multi-guild support
- [ ] Dynamic quest creation via admin panel
- [ ] Quest progression trees
- [ ] Collaborative quests (teams)

---

## 📈 Monitoring & Logging

### Key Metrics
- Quest claims per day
- Discord connection success rate
- Requirements check pass/fail ratio
- Rate limit hits
- Duplicate claim attempts

### Log Points
```typescript
// Success
console.log(`[Quest] Claimed: ${questKey} by ${userId}`)

// Failures
console.error('[Quest] Check Discord exception:', err)
console.error('[Quest] Claim exception:', err)
console.error('[Discord] Guild member exception:', err)
```

---

## ✅ Checklist: Ready for Production

- [x] JWT authentication on all endpoints
- [x] Rate limiting implemented
- [x] Idempotency protection
- [x] Duplicate prevention
- [x] Feature flag enabled
- [x] Database indexes created
- [x] Error handling comprehensive
- [x] User feedback messages
- [x] UI responsive and intuitive
- [x] No linter errors
- [ ] Discord token encryption (TODO)
- [ ] End-to-end tests passed (TODO)
- [ ] Production Discord bot token obtained (TODO)
- [ ] Production guild ID configured (TODO)

---

## 📝 API Reference

### POST /api/quests/check-discord
**Request:**
```json
{
  "discordId": "1234567890"
}
```

**Response:**
```json
{
  "ok": true,
  "member": true,
  "hasRole": true,
  "hasFlag": true,
  "message": "All requirements met"
}
```

### POST /api/quests/claim
**Request:**
```json
{
  "questKey": "discord_communication_specialist",
  "discordId": "1234567890"
}
```

**Response:**
```json
{
  "ok": true,
  "questKey": "discord_communication_specialist",
  "freeAttacksClaimed": 1,
  "message": "Quest claimed successfully! Free attack granted."
}
```

---

## 👥 Contributors

- **Implementation:** AI Assistant
- **Specification:** User
- **Review:** Pending

---

## 📄 License

Part of Flag Wars 2 project.

---

**End of Report**

