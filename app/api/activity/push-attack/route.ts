/**
 * Push Attack Event to Activity Feed
 * 
 * POST /api/activity/push-attack
 * Receives attack event data and pushes to Redis for recent activity display
 */

import { NextRequest, NextResponse } from 'next/server'
import { pushAttackEvent, type AttackEvent } from '@/lib/activity/attacks'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Validation schema
const AttackEventSchema = z.object({
  attackId: z.string(),
  ts: z.number(),
  blockNumber: z.number(),
  logIndex: z.number(),
  attacker: z.string(),
  attackerCountry: z.string(),
  defenderCode: z.string(),
  delta: z.string(),
  feeUSDC6: z.string(),
  txHash: z.string()
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    // Validate input
    const validated = AttackEventSchema.parse(body)
    
    console.log('[Activity Push] Received:', {
      attackId: validated.attackId,
      txHash: validated.txHash,
      logIndex: validated.logIndex,
      attacker: validated.attacker.slice(0, 10) + '...',
      countries: `${validated.attackerCountry} → ${validated.defenderCode}`
    })
    
    // Push to Redis
    await pushAttackEvent(validated as AttackEvent)
    
    console.log('[Activity Push] Successfully pushed to Redis')
    
    return NextResponse.json({ ok: true }, { status: 200 })
    
  } catch (error: any) {
    console.error('[Activity Push] Error:', error)
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { ok: false, error: 'INVALID_INPUT', details: error.errors },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { ok: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

