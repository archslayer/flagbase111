/**
 * Cross-tab lock mechanism using localStorage
 * Prevents duplicate transactions across browser tabs
 */

const LOCK_PREFIX = 'flagwars:lock:'
const LOCK_TTL_MS = 30_000 // 30 seconds

interface LockInfo {
  timestamp: number
  tabId: string
}

/**
 * Generate unique tab ID
 */
function getTabId(): string {
  if (typeof window === 'undefined') return 'server'
  
  // Try to get existing tab ID from sessionStorage
  let tabId = sessionStorage.getItem('flagwars:tabId')
  if (!tabId) {
    // Generate new tab ID
    tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    sessionStorage.setItem('flagwars:tabId', tabId)
  }
  return tabId
}

/**
 * Acquire lock for a transaction type
 * @param symbol - Transaction symbol (e.g., 'buy:TR', 'sell:UK')
 * @returns true if lock acquired, false if already locked
 */
export function acquireTabLock(symbol: string): boolean {
  if (typeof window === 'undefined') return true // Server-side: always allow
  
  const lockKey = `${LOCK_PREFIX}${symbol}`
  const tabId = getTabId()
  const now = Date.now()
  
  try {
    const existing = localStorage.getItem(lockKey)
    if (existing) {
      const lockInfo: LockInfo = JSON.parse(existing)
      
      // Check if lock is expired
      if (now - lockInfo.timestamp > LOCK_TTL_MS) {
        // Lock expired, acquire it
        localStorage.setItem(lockKey, JSON.stringify({
          timestamp: now,
          tabId
        }))
        return true
      }
      
      // Lock is still valid
      // If it's from same tab, allow (re-entrant)
      if (lockInfo.tabId === tabId) {
        return true
      }
      
      // Lock is held by another tab
      return false
    }
    
    // No existing lock, acquire it
    localStorage.setItem(lockKey, JSON.stringify({
      timestamp: now,
      tabId
    }))
    return true
  } catch (error) {
    // localStorage might be disabled or full
    console.warn('[TabLock] Failed to acquire lock:', error)
    // Fail open: allow transaction if localStorage fails
    return true
  }
}

/**
 * Release lock for a transaction type
 * @param symbol - Transaction symbol
 */
export function releaseTabLock(symbol: string): void {
  if (typeof window === 'undefined') return
  
  const lockKey = `${LOCK_PREFIX}${symbol}`
  const tabId = getTabId()
  
  try {
    const existing = localStorage.getItem(lockKey)
    if (existing) {
      const lockInfo: LockInfo = JSON.parse(existing)
      
      // Only release if it's from this tab
      if (lockInfo.tabId === tabId) {
        localStorage.removeItem(lockKey)
      }
    }
  } catch (error) {
    // Ignore errors - cleanup is non-critical
    console.warn('[TabLock] Failed to release lock:', error)
  }
}

/**
 * Check if lock exists (from any tab)
 * @param symbol - Transaction symbol
 * @returns true if locked, false if available
 */
export function isTabLocked(symbol: string): boolean {
  if (typeof window === 'undefined') return false
  
  const lockKey = `${LOCK_PREFIX}${symbol}`
  const now = Date.now()
  
  try {
    const existing = localStorage.getItem(lockKey)
    if (!existing) return false
    
    const lockInfo: LockInfo = JSON.parse(existing)
    
    // Check if lock is expired
    if (now - lockInfo.timestamp > LOCK_TTL_MS) {
      // Lock expired, clean it up
      localStorage.removeItem(lockKey)
      return false
    }
    
    return true
  } catch (error) {
    // On error, assume not locked (fail open)
    return false
  }
}

/**
 * Cleanup expired locks (call on app init)
 */
export function cleanupExpiredLocks(): void {
  if (typeof window === 'undefined') return
  
  const now = Date.now()
  
  try {
    const keysToRemove: string[] = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(LOCK_PREFIX)) {
        try {
          const lockInfo: LockInfo = JSON.parse(localStorage.getItem(key) || '{}')
          if (now - lockInfo.timestamp > LOCK_TTL_MS) {
            keysToRemove.push(key)
          }
        } catch {
          // Invalid lock data, remove it
          keysToRemove.push(key)
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch (error) {
    // Ignore cleanup errors
    console.warn('[TabLock] Failed to cleanup locks:', error)
  }
}

/**
 * Listen for storage events (cross-tab communication)
 * Cleanup locks when tab closes
 */
export function setupTabLockListeners(): () => void {
  if (typeof window === 'undefined') return () => {}
  
  // Cleanup on page unload
  const handleUnload = () => {
    // Release all locks from this tab
    const tabId = getTabId()
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(LOCK_PREFIX)) {
          try {
            const lockInfo: LockInfo = JSON.parse(localStorage.getItem(key) || '{}')
            if (lockInfo.tabId === tabId) {
              keysToRemove.push(key)
            }
          } catch {
            // Invalid data, skip
          }
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  window.addEventListener('beforeunload', handleUnload)
  
  // Return cleanup function
  return () => {
    window.removeEventListener('beforeunload', handleUnload)
  }
}

