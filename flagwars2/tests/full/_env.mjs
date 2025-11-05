import fs from 'node:fs'

export function loadEnv() {
  const envFiles = ['.env.local', '.env']
  for (const f of envFiles) {
    if (fs.existsSync(f)) {
      const text = fs.readFileSync(f, 'utf8')
      for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
        if (m) {
          const k = m[1]
          let v = m[2].trim()
          if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
          if (process.env[k] === undefined) process.env[k] = v
        }
      }
    }
  }
  return {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    DATABASE_URL: process.env.DATABASE_URL ?? process.env.MONGODB_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    NEXT_PUBLIC_CORE_ADDRESS: process.env.NEXT_PUBLIC_CORE_ADDRESS,
    NEXT_PUBLIC_RPC_BASE_SEPOLIA: process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA ?? 'https://sepolia.base.org',
    USE_REDIS: (process.env.USE_REDIS ?? 'false').toLowerCase() === 'true',
    REDIS_URL: process.env.REDIS_URL,
    NEXT_PUBLIC_ATTACK_FEE_WEI: process.env.NEXT_PUBLIC_ATTACK_FEE_WEI ?? '100000000000000'
  }
}


