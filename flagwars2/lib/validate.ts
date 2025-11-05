import { isAddress, getAddress } from 'viem'

/**
 * Address validation and checksum conversion
 * Ensures all addresses are properly formatted and checksummed
 */
export function toChecksumAddress(addr?: string): `0x${string}` {
  if (!addr || typeof addr !== 'string') {
    throw new Error('INVALID_ADDRESS_EMPTY')
  }
  
  // Add 0x prefix if missing
  const a = addr.startsWith('0x') ? addr : ('0x' + addr)
  
  // Validate address format
  if (!isAddress(a)) {
    throw new Error('INVALID_ADDRESS_FORMAT')
  }
  
  // Return checksummed address
  return getAddress(a as `0x${string}`)
}

/**
 * Validate whole token amounts (no decimals)
 */
export function assertWholeTokens(amountToken18: bigint): void {
  // Check if amount is a whole number (no remainder when divided by 10^18)
  const decimals = BigInt(10 ** 18)
  if (amountToken18 % decimals !== 0n) {
    throw new Error('ONLY_INTEGER_TOKENS')
  }
}

/**
 * Safe BigInt conversion from string or number
 */
export function toBigIntSafe(value: string | number): bigint {
  if (typeof value === 'number') {
    return BigInt(value)
  }
  if (typeof value === 'string') {
    // Remove any non-numeric characters except minus sign
    const cleaned = value.replace(/[^0-9-]/g, '')
    return BigInt(cleaned)
  }
  throw new Error('INVALID_BIGINT_VALUE')
}