const { publicClient, makeWalletClient, CORE_ABI } = require('./client')
const { CORE, ATTACK_FEE_WEI } = require('./env')
const { readCountry } = require('./read')
const { withSlippageDown } = require('./units')

async function doBuy(pk, cid, amt, slipBps=200) {
  const wc = makeWalletClient(pk); const acc = (await wc.getAddresses())[0]
  const before = await readCountry(cid)
  const estUsdc6 = (amt * before.price8) / (10n**18n) / 100n
  const minOut = withSlippageDown(estUsdc6, slipBps)
  const dl = Math.floor(Date.now()/1000)+600
  const hash = await wc.writeContract({ address: CORE, abi: CORE_ABI, functionName:'buy', args:[BigInt(cid),amt,minOut,BigInt(dl)], account:acc })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const after = await readCountry(cid)
  return { hash, receipt, before, after }
}

async function doSell(pk, cid, amt, slipBps=200) {
  const wc = makeWalletClient(pk); const acc = (await wc.getAddresses())[0]
  const before = await readCountry(cid)
  const estUsdc6 = (amt * before.price8) / (10n**18n) / 100n
  const minOut = withSlippageDown(estUsdc6, slipBps)
  const dl = Math.floor(Date.now()/1000)+600
  const hash = await wc.writeContract({ address: CORE, abi: CORE_ABI, functionName:'sell', args:[BigInt(cid),amt,minOut,BigInt(dl)], account:acc })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const after = await readCountry(cid)
  return { hash, receipt, before, after }
}

async function doAttack(pk, fromId, toId, amt) {
  const wc = makeWalletClient(pk); const acc = (await wc.getAddresses())[0]
  const beforeFrom = await readCountry(fromId); const beforeTo = await readCountry(toId)
  const hash = await wc.writeContract({ address: CORE, abi: CORE_ABI, functionName:'attack', args:[BigInt(fromId),BigInt(toId),amt], value: ATTACK_FEE_WEI, account: acc })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const afterFrom = await readCountry(fromId); const afterTo = await readCountry(toId)
  return { hash, receipt, beforeFrom, beforeTo, afterFrom, afterTo }
}

module.exports = { doBuy, doSell, doAttack }
