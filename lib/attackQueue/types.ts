// lib/attackQueue/types.ts

export interface AttackJob {
  user: `0x${string}`
  fromId: number
  toId: number
  idempotencyKey: string
  // amountToken18 artık kullanılmıyorsa buraya yazma
  // amountToken18?: string
}

