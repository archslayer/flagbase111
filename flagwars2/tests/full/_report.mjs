import fs from 'node:fs'
import path from 'node:path'

const outPath = path.join('reports', 'full-system-report.md')
fs.mkdirSync(path.dirname(outPath), { recursive: true })

let chunks = []
export function add(md) { chunks.push(md) }
export function save() {
  const banner = `# FlagWars Full System Report\n\nGenerated: ${new Date().toISOString()}\n\n`
  fs.writeFileSync(outPath, banner + chunks.join('\n'), 'utf8')
  return outPath
}


