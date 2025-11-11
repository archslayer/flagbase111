/**
 * GET /api/health/mongodb
 * MongoDB health check endpoint
 * Protected in production with X-Admin-Token header
 */

import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Production protection: require admin token
  if (process.env.NODE_ENV === 'production') {
    const token = req.headers.get('x-admin-token')
    if (token !== process.env.ADMIN_HEALTH_TOKEN) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { 
          status: 403,
          headers: { 'Cache-Control': 'no-store' }
        }
      )
    }
  }
  
  try {
    const db = await getDb()
    const result = await db.command({ ping: 1 })
    
    return NextResponse.json(
      {
        ok: true,
        status: 'connected',
        ping: result,
        timestamp: new Date().toISOString()
      },
      {
        headers: { 'Cache-Control': 'no-store' }
      }
    )
  } catch (error: any) {
    console.error('[HEALTH/MONGODB] Error:', error)
    return NextResponse.json(
      {
        ok: false,
        status: 'error',
        error: error?.message || 'MongoDB ping failed'
      },
      { 
        status: 500,
        headers: { 'Cache-Control': 'no-store' }
      }
    )
  }
}

