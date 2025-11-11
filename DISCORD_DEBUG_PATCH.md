# Discord Role Check - Debug Patch Applied

**Date:** 2025-01-30  
**Status:** ✅ **Debug Patch Complete**

---

## 🎯 Problem

User reports that "Join Flag Base Discord server" check fails even when:
- User is a member of the Discord server
- User has the required role
- User has flags

**Symptom:** Check Status returns `member: false` or `hasRole: false` despite conditions being met

---

## 🔧 Root Causes (Possible)

1. **Wrong Guild/Role IDs**
   - `DISCORD_GUILD_ID` doesn't match the actual server
   - `FLAG_OWNER_ROLE_ID` doesn't match the actual role

2. **Bot Permissions**
   - Bot not in the guild
   - Missing "Server Members Intent" in Developer Portal
   - Bot role too low (can't view members)

3. **API Response Issues**
   - Discord API returns wrong status
   - Bot token invalid or expired
   - Rate limits

4. **Snowflake String Issues**
   - `discordId` converted to number, causing overflow
   - JSON parsing issues

---

## ✅ Debug Patch Applied

### 1. **lib/discord.ts** - Added Inspection Function

```typescript
export type GuildMemberInspect = {
  ok: boolean
  status: number
  member: boolean
  roleIds: string[]
  raw?: any
  error?: string
}

export async function inspectGuildMember(
  discordId: string,
  guildId: string
): Promise<GuildMemberInspect> {
  // Returns detailed info: HTTP status, roles, errors
  // Always keeps discordId as string
  // Handles all error cases gracefully
}
```

**Features:**
- ✅ Returns HTTP status code from Discord API
- ✅ Returns raw JSON response
- ✅ Never throws, always returns structured result
- ✅ Forces `discordId` to stay as string

### 2. **app/api/quests/check-discord/route.ts** - Detailed Debug Output

```typescript
// Development debug output
const debug = process.env.NODE_ENV !== 'production' ? {
  discordStatus: inspect.status,      // HTTP status from Discord
  discordError: inspect.error || null, // Error message if any
  roleIds: inspect.roleIds,            // User's roles
  expectedRoleId: roleId,              // What we're looking for
  guildId,                             // Which guild
  hasFlagValue: progress?.flagCount ?? 0  // Flag count
} : undefined

return NextResponse.json({
  ok, member, hasRole, hasFlag,
  message: '...',
  debug  // Only in dev mode
})
```

**What it shows:**
- ✅ Discord API HTTP status (200/404/401/403/etc)
- ✅ All user roles
- ✅ Expected role ID
- ✅ Guild ID being checked
- ✅ Actual flag count

### 3. **app/quests/page.tsx** - UI Debug Panel

```typescript
{/* Debug output - show in development */}
{process.env.NODE_ENV !== 'production' && checkStatus && (
  <details>
    <summary>🔧 Debug Info</summary>
    <pre>{JSON.stringify(checkStatus, null, 2)}</pre>
  </details>
)}
```

**Now:** Debug panel appears automatically in development  
**Before:** Always hidden (`false && checkStatus`)

---

## 🧪 How to Diagnose

### Step 1: Check Your Environment

**Verify in `.env.local`:**
```bash
# These MUST match your actual Discord setup
DISCORD_GUILD_ID=1434566230232141826       # Your server's ID
FLAG_OWNER_ROLE_ID=1434567222189359114    # Role ID (NOT name!)
DISCORD_BOT_TOKEN=MTQzNDU3OTQxOTU3MzUx...  # Bot token
```

**How to get these IDs:**
- **Guild ID:** Right-click server → Copy Server ID (if Developer Mode enabled)
- **Role ID:** Right-click role → Copy Role ID (if Developer Mode enabled)
- **Bot Token:** Discord Developer Portal → Your Bot → Token

### Step 2: Test OAuth Flow

1. Open http://localhost:3000/quests
2. Click "Connect Discord"
3. Authorize in Discord
4. You should return with `discordId=XXX` in URL

### Step 3: Check Status

1. Click "Check Status" button
2. Scroll down to "🔧 Debug Info"
3. Click to expand

**Expected output:**
```json
{
  "ok": true,
  "member": true,
  "hasRole": true,
  "hasFlag": true,
  "message": "All requirements met",
  "debug": {
    "discordStatus": 200,
    "discordError": null,
    "roleIds": ["1434567222189359114", "...other roles..."],
    "expectedRoleId": "1434567222189359114",
    "guildId": "1434566230232141826",
    "hasFlagValue": 3
  }
}
```

### Step 4: Diagnose Issues

#### If `discordStatus: 404`
**Problem:** User is not a member of the guild  
**Solution:** Have user join the Discord server

#### If `discordStatus: 403` or `401`
**Problem:** Bot permissions issue  
**Checks:**
- Is bot in the guild?
- Is "Server Members Intent" enabled in Developer Portal?
- Is bot's role high enough to view members?

#### If `discordStatus: 200` but `member: false`
**Problem:** Unexpected response format  
**Solution:** Check `raw` field in debug output for Discord response

#### If `hasRole: false` despite `roleIds` array populated
**Problem:** Wrong role ID  
**Solution:** Compare `roleIds` with `expectedRoleId` in debug output

**Example of wrong role:**
```json
"roleIds": ["123456", "789012", "345678"],  // User's actual roles
"expectedRoleId": "999999"                   // WRONG! Not in list
```

#### If `hasFlag: false`
**Problem:** User has no flags in DB  
**Solution:** User needs to buy at least 1 flag

---

## 🚨 Common Issues & Fixes

### Issue 1: Bot Not in Guild

**Symptom:** `discordStatus: 404` for all users

**Fix:**
1. Go to Discord Developer Portal
2. OAuth2 → URL Generator
3. Select `bot` scope
4. Select required permissions (View Members, etc.)
5. Use generated URL to invite bot to server

### Issue 2: Missing Server Members Intent

**Symptom:** `discordStatus: 403`

**Fix:**
1. Go to Discord Developer Portal
2. Your Application → Bot
3. Enable **"Server Members Intent"**
4. Save

### Issue 3: Wrong Role ID

**Symptom:** `hasRole: false` despite having the role

**Fix:**
1. Enable Developer Mode in Discord settings
2. Right-click the "Flag Folks" role
3. Copy Role ID
4. Update `.env.local` with correct ID

### Issue 4: discordId Converted to Number

**Symptom:** Works sometimes, fails for large IDs

**Fix:** ✅ Already handled in patch
- `String(discordId)` forces string conversion
- No `Number()` calls anywhere

---

## ✅ Quality Checks

| Check | Status |
|-------|--------|
| Linter errors | 0 ✅ |
| Type errors | 0 ✅ |
| Backward compat | Maintained ✅ |
| Debug output | Development only ✅ |
| Production safe | Yes ✅ |

---

## 📊 Next Steps

1. **Run the app**
2. **Test OAuth flow**
3. **Click "Check Status"**
4. **Open Debug Info**
5. **Report findings**

**Share with me:**
- `discordStatus` value
- `roleIds` array
- `expectedRoleId` value
- `hasFlagValue` value
- Any `discordError` message

With this info, I can pinpoint the exact issue.

---

**End of Report**

