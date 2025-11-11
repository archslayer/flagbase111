// lib/discord.ts
// Discord OAuth & Guild member verification for quests
import 'server-only'

const API_BASE = 'https://discord.com/api'

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const CLIENT_ID = process.env.DISCORD_CLIENT_ID
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET

export interface DiscordAccessTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope: string
}

export interface DiscordUser {
  id: string
  username: string
  discriminator: string
  avatar: string | null
  email?: string
}

export async function getDiscordAccessToken(
  code: string,
  redirectUri: string
): Promise<DiscordAccessTokenResponse | { error: string }> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET not set')
  }

  const params = new URLSearchParams()
  params.append('client_id', CLIENT_ID)
  params.append('client_secret', CLIENT_SECRET)
  params.append('grant_type', 'authorization_code')
  params.append('code', code)
  params.append('redirect_uri', redirectUri)

  try {
    const res = await fetch(`${API_BASE}/oauth2/token`, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[Discord OAuth] Token error:', data)
      return { error: data.error || 'failed_to_get_token' }
    }

    return data as DiscordAccessTokenResponse
  } catch (err: any) {
    console.error('[Discord OAuth] Exception:', err)
    return { error: err.message || 'network_error' }
  }
}

export async function getDiscordUser(accessToken: string): Promise<DiscordUser | null> {
  try {
    const res = await fetch(`${API_BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!res.ok) {
      console.error('[Discord] User fetch error:', res.status)
      return null
    }

    return await res.json()
  } catch (err: any) {
    console.error('[Discord] User fetch exception:', err)
    return null
  }
}

// Detailed guild member inspection for debugging
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
  const token = process.env.DISCORD_BOT_TOKEN

  if (!token) {
    return { ok: false, status: 0, member: false, roleIds: [], error: 'missing_bot_token' }
  }

  try {
    const res = await fetch(`${API_BASE}/guilds/${guildId}/members/${discordId}`, {
      headers: { Authorization: `Bot ${token}` }
    })

    const status = res.status
    const text = await res.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch {}

    if (status === 200 && json && Array.isArray(json.roles)) {
      return { ok: true, status, member: true, roleIds: json.roles as string[], raw: json }
    }

    if (status === 404) {
      return { ok: true, status, member: false, roleIds: [], raw: json }
    }

    // 401/403/5xx vs
    return { ok: false, status, member: false, roleIds: [], raw: json, error: 'discord_api_error' }
  } catch (e: any) {
    return { ok: false, status: 0, member: false, roleIds: [], error: e?.message || 'exception' }
  }
}

// Check guild membership and roles using bot token (kept for backward compat)
export async function getGuildMemberRoles(
  discordUserId: string,
  guildId: string
): Promise<string[] | null> {
  const inspect = await inspectGuildMember(discordUserId, guildId)
  return inspect.member ? inspect.roleIds : null
}

