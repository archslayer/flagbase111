// app/api/auth/callback/discord/route.ts
import { NextResponse } from 'next/server'
import 'server-only'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const {
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_REDIRECT_URI,
    NEXT_PUBLIC_APP_URL
  } = process.env

  // Graceful handling of missing env vars (don't throw, redirect with error)
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI || !NEXT_PUBLIC_APP_URL) {
    console.error('[Discord OAuth] Missing Discord env vars')
    const baseUrl = NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return NextResponse.redirect(`${baseUrl}/quests?discord_oauth=error_env`)
  }

  try {
    // Feature flag check
    if (process.env.FEATURE_QUESTS !== 'true') {
      return NextResponse.json({ ok: false, error: 'feature-disabled' }, { status: 403 })
    }

    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error) {
      // User denied or other error
      console.error('[Discord OAuth] User denied or error:', error)
      return NextResponse.redirect(`${NEXT_PUBLIC_APP_URL}/quests?discord_oauth=error`)
    }

    if (!code) {
      console.error('[Discord OAuth] Missing ?code in callback')
      return NextResponse.redirect(`${NEXT_PUBLIC_APP_URL}/quests?discord_oauth=missing_code`)
    }

    // Exchange code for token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    })

    if (!tokenRes.ok) {
      const txt = await tokenRes.text()
      console.error('[Discord OAuth] Token error', tokenRes.status, txt)
      return NextResponse.redirect(`${NEXT_PUBLIC_APP_URL}/quests?discord_oauth=token_error`)
    }

    const tokenJson = await tokenRes.json()
    const accessToken = tokenJson.access_token as string

    // Get Discord user info
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!userRes.ok) {
      const txt = await userRes.text()
      console.error('[Discord OAuth] User error', userRes.status, txt)
      return NextResponse.redirect(`${NEXT_PUBLIC_APP_URL}/quests?discord_oauth=user_error`)
    }

    const userJson = await userRes.json()
    const discordId = userJson.id as string

    // Redirect back to frontend with discordId
    const redirectTo = `${NEXT_PUBLIC_APP_URL}/quests?discordId=${encodeURIComponent(discordId)}&discord_oauth=ok`
    return NextResponse.redirect(redirectTo)
  } catch (err) {
    console.error('[Discord OAuth] Exception', err)
    const baseUrl = NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return NextResponse.redirect(`${baseUrl}/quests?discord_oauth=exception`)
  }
}

