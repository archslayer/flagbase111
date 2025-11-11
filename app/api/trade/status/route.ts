import { NextRequest, NextResponse } from 'next/server'
import { getTxStatus } from '@/lib/tx'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
    }

    const status = getTxStatus(id)
    
    return NextResponse.json({ 
      ok: true, 
      id, 
      status 
    })
  } catch (error: any) {
    console.error('Status check error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || 'Status check failed' 
    }, { status: 500 })
  }
}
