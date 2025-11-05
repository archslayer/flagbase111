// app/api/auth/nonce/route.ts
// NEVER: Import-time DB calls, hardcoded nonces
// ALWAYS: Lazy DB initialization, crypto.randomUUID()
import { NextResponse } from 'next/server'

export async function GET() {
  // Use global crypto (available in Node.js 16+)
  const nonce = globalThis.crypto.randomUUID()
  return NextResponse.json({ nonce })
}