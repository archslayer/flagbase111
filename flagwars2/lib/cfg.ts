// Rules: never default to unsafe values. Always enforce sane minimums for slippage and freshness.
// - SLIPPAGE_BPS must never be 0 (min 50)
// - QUOTE_MAX_STALE_MS should be short (<= 1500 ms)
// - Limit in-flight tx per user to prevent racing

export const USE_REDIS = (process.env.USE_REDIS ?? 'false').toLowerCase() === 'true'

const rawSlippage = Number(process.env.SLIPPAGE_BPS ?? '300')
export const SLIPPAGE_BPS = Number.isFinite(rawSlippage) && rawSlippage >= 50 ? rawSlippage : 300

const rawQuoteStaleMs = Number(process.env.QUOTE_MAX_STALE_MS ?? '1500')
export const QUOTE_MAX_STALE_MS = Number.isFinite(rawQuoteStaleMs) && rawQuoteStaleMs > 0 ? rawQuoteStaleMs : 1500

const rawTxTimeoutMs = Number(process.env.TX_TIMEOUT_MS ?? '45000')
export const TX_TIMEOUT_MS = Number.isFinite(rawTxTimeoutMs) && rawTxTimeoutMs >= 5000 ? rawTxTimeoutMs : 45000

const rawInflight = Number(process.env.MAX_INFLIGHT_PER_USER ?? '1')
export const MAX_INFLIGHT_PER_USER = Number.isFinite(rawInflight) && rawInflight >= 1 ? rawInflight : 1

export const ATTACK_FEE_WEI = BigInt(process.env.NEXT_PUBLIC_ATTACK_FEE_WEI || '100000000000000')


