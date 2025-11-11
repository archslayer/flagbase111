import { NextRequest, NextResponse } from 'next/server'
import { getTelemetryStats, getHealthStatus } from '@/lib/telemetry'

export async function GET(req: NextRequest) {
  try {
    const stats = await getTelemetryStats()
    const health = await getHealthStatus()
    
    return NextResponse.json({
      ok: true,
      timestamp: Date.now(),
      health,
      stats
    })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'TELEMETRY_ERROR'
    }, { status: 500 })
  }
}
