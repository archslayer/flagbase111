/**
 * IP Utilities
 * Safely extract and normalize client IP from headers
 * @server-only
 */

import 'server-only'

/**
 * Safely extract client IP from request headers
 * Handles x-forwarded-for, x-real-ip, and multiple IPs
 */
export function getClientIp(req: { headers: { get: (name: string) => string | null } }): string {
  // Priority order: x-forwarded-for (first IP) > x-real-ip > fallback
  const forwarded = req.headers.get('x-forwarded-for')
  
  if (forwarded) {
    // x-forwarded-for can be: "client, proxy1, proxy2"
    // Take the first (leftmost) IP which is the original client
    const ips = forwarded.split(',').map(ip => ip.trim())
    const clientIp = ips[0]
    
    if (clientIp && isValidIp(clientIp)) {
      return normalizeIp(clientIp)
    }
  }
  
  const realIp = req.headers.get('x-real-ip')
  if (realIp && isValidIp(realIp)) {
    return normalizeIp(realIp)
  }
  
  // Fallback
  return 'unknown'
}

/**
 * Basic IP validation (IPv4 and IPv6)
 */
function isValidIp(ip: string): boolean {
  // IPv4 regex
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
  // IPv6 regex (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip)
}

/**
 * Normalize IP address
 * - IPv4: lowercase
 * - IPv6: compress and lowercase
 */
function normalizeIp(ip: string): string {
  ip = ip.toLowerCase().trim()
  
  // IPv6 compression (basic)
  if (ip.includes(':')) {
    // Remove leading zeros in each segment
    ip = ip.split(':').map(segment => {
      return segment.replace(/^0+/, '') || '0'
    }).join(':')
    
    // Replace longest sequence of zeros with ::
    ip = ip.replace(/\b0(:0)+\b/, '::')
  }
  
  return ip
}

/**
 * Hash IP + User-Agent for cookie validation
 * Uses REFERRAL_SECRET as salt
 */
export function hashIpUserAgent(ip: string, userAgent: string): string {
  const { createHash } = require('crypto')
  const salt = process.env.REFERRAL_SECRET || 'dev-secret-change-in-production'
  
  const hash = createHash('sha256')
  hash.update(ip + userAgent + salt)
  return hash.digest('hex').substring(0, 16)
}

/**
 * Get rate limit key from IP
 * Normalizes IP for consistent rate limiting
 */
export function getRateLimitKey(ip: string, prefix: string): string {
  const normalized = normalizeIp(ip)
  return `${prefix}:${normalized}`
}

