// Event types for analytics (append-only audit + stats)
import { z } from 'zod'

export const BaseEvt = z.object({
  chainId: z.number(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  logIndex: z.number().int().nonnegative(),
  blockNumber: z.number().int().positive(),
  timestamp: z.number().int().positive(), // unix sec
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  feeUSDC6: z.string().optional(),        // "12345" = 12.345 USDC
  amountToken18: z.string().optional()    // "1000000000000000000" = 1.0
})

export const BuySellEvt = BaseEvt.extend({
  type: z.enum(['buy', 'sell']),
  countryId: z.number().int().nonnegative(),
  quoteIn: z.string().optional(),
  quoteOut: z.string().optional(),
  netFeeBps: z.number().int().optional()
})

export const AttackEvt = BaseEvt.extend({
  type: z.literal('attack'),
  fromId: z.number().int().nonnegative(),
  toId: z.number().int().nonnegative()
  // feeUSDC6 genelde dolu olur
})

export type BuySellEvtT = z.infer<typeof BuySellEvt>
export type AttackEvtT = z.infer<typeof AttackEvt>
export type AnyEvtT = BuySellEvtT | AttackEvtT

