import http from 'node:http'
import https from 'node:https'

export async function fetchRaw(url, { method='GET', headers={}, body=null, timeout=8000 } = {}) {
  const lib = url.startsWith('https') ? https : http
  return await new Promise((resolve, reject) => {
    const req = lib.request(url, { method, headers, timeout }, res => {
      let data = ''
      res.on('data', d => (data += d))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}


