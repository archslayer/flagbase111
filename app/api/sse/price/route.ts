import { NextRequest } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA as string

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) })

const ABI = parseAbi([
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)',
  'function remainingSupply(uint256 id) view returns (uint256)'
])

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const countryIds = url.searchParams.get('ids')?.split(',').map(Number) || [90, 44, 1]

  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    start(controller) {
      const sendData = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(message))
      }

      const interval = setInterval(async () => {
        try {
          const countries = await Promise.all(
            countryIds.map(async (id) => {
              try {
                // Read FlagWarsCore countries() mapping
                const result = await publicClient.readContract({
                  address: CORE,
                  abi: ABI,
                  functionName: 'countries',
                  args: [BigInt(id)]
                }) as any

                const name = result[0]
                const token = result[1]
                const exists = result[2]
                const price8 = result[3]

                // Get remaining supply
                const remaining = await publicClient.readContract({
                  address: CORE,
                  abi: ABI,
                  functionName: 'remainingSupply',
                  args: [BigInt(id)]
                })

                return {
                  id,
                  name,
                  price8: price8.toString(),
                  totalSupply: remaining.toString(),
                  exists
                }
              } catch (error: any) {
                console.log(`[SSE] Error reading country ${id}:`, error.message)
                return {
                  id,
                  name: 'Unknown',
                  price8: '0',
                  totalSupply: '0',
                  exists: false
                }
              }
            })
          )

          sendData({
            ts: Date.now(),
            countries
          })
        } catch (error) {
          console.error('SSE error:', error)
        }
      }, 3000) // Every 3 seconds

      // Cleanup on close
      req.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  })
}
