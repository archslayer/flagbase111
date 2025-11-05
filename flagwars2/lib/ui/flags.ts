/**
 * UI Utilities - Flags, Icons, Wallet Formatting
 */

/**
 * Country code to flag emoji
 */
export function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return '🏳️'
  
  const codePoints = code
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0))
  
  return String.fromCodePoint(...codePoints)
}

/**
 * Attack icon (simple emoji string)
 */
export const attackIcon = '⚔️'

/**
 * Shorten wallet address to first 4 hex chars
 */
export function short4(addr: string): string {
  if (!addr || addr.length < 6) return addr
  return addr.slice(2, 6) // Remove 0x and take first 4
}

/**
 * Format time ago (seconds to human readable)
 */
export function timeAgo(timestampSec: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestampSec
  
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

