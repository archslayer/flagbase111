const fs = require('fs'); const path = require('path')

function saveReport(name, md, json) {
  const dir = path.join(process.cwd(),'tests/live/phase4/output'); fs.mkdirSync(dir,{recursive:true})
  const ts = new Date().toISOString().replace(/[:.]/g,'-')
  const mdp = path.join(dir,`${name}-${ts}.md`); const jp = path.join(dir,`${name}-${ts}.json`)
  fs.writeFileSync(mdp, md, 'utf8'); fs.writeFileSync(jp, JSON.stringify(json, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value
  , 2),'utf8')
  return { mdPath: mdp, jsonPath: jp }
}

module.exports = { saveReport }
