const { publicClient } = require('./client')
const { CORE } = require('./env')

async function readCountry(id) {
  const [name, , price8, totalSupply, attacks, exists] = await publicClient.readContract({
    address: CORE,
    abi: [{name:'getCountryInfo',type:'function',stateMutability:'view',
      inputs:[{name:'id',type:'uint256'}],
      outputs:[{type:'string'},{type:'address'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'bool'}]}],
    functionName: 'getCountryInfo', args: [BigInt(id)],
  })
  return { id, name, price8, totalSupply, attacks, exists }
}

async function getCaps() {
  let paused = null, hasCfg = false
  try { paused = await publicClient.readContract({ address: CORE, abi:[{name:'paused',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'bool'}]}], functionName:'paused', args:[]}) }
  catch { paused = null }
  try { await publicClient.readContract({ address: CORE, abi:[{name:'getConfig',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'address'},{type:'uint256'},{type:'uint256'}]}], functionName:'getConfig', args:[]}); hasCfg = true }
  catch { hasCfg = false }
  return { paused, hasCfg }
}

module.exports = { readCountry, getCaps }
