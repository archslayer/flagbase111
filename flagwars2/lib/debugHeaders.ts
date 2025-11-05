// lib/debugHeaders.ts
// NEVER: Expose debug info in production
// ALWAYS: Only show debug headers in development
export function setDebugHeader(res: Response | any, key: string, value: string) {
  if (process.env.NODE_ENV !== 'production') {
    res.headers.set(key, value)
  }
}
