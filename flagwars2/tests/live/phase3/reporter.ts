const fs = require('fs');
const path = require('path');

function saveReport(name, md, json) {
  const dir = path.join(process.cwd(), 'tests/live/phase3/output');
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const mdPath = path.join(dir, `${name}-${ts}.md`);
  const jsonPath = path.join(dir, `${name}-${ts}.json`);
  fs.writeFileSync(mdPath, md, 'utf8');
  
  // BigInt serialization için helper
  const jsonStr = JSON.stringify(json, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2);
  fs.writeFileSync(jsonPath, jsonStr, 'utf8');
  return { mdPath, jsonPath };
}

module.exports = { saveReport };