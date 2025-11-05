import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

export async function GET(req: NextRequest) {
  try {
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA
    if (!rpcUrl) {
      return NextResponse.json({
        ok: false,
        error: 'RPC_URL_MISSING'
      }, { status: 500 })
    }

    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl)
    })

    const startTime = Date.now()
    
    // Test basic RPC call
    const blockNumber = await client.getBlockNumber()
    const rpcLatency = Date.now() - startTime

    // Test transaction receipt (if we have a recent tx)
    let txReceiptLatency = null
    try {
      const txStart = Date.now()
      // This will fail if no recent transactions, but that's ok for health check
      await client.getTransactionReceipt({ hash: '0x0000000000000000000000000000000000000000000000000000000000000000' })
      txReceiptLatency = Date.now() - txStart
    } catch (error) {
      // Expected to fail with invalid hash
      txReceiptLatency = 'N/A (no recent tx)'
    }

    return NextResponse.json({
      ok: true,
      rpc: {
        url: rpcUrl,
        blockNumber: blockNumber.toString(),
        latency: rpcLatency,
        txReceiptLatency,
        status: rpcLatency < 5000 ? 'healthy' : rpcLatency < 10000 ? 'degraded' : 'unhealthy'
      },
      timestamp: Date.now()
    })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'RPC_HEALTH_CHECK_FAILED',
      timestamp: Date.now()
    }, { status: 500 })
  }
}
