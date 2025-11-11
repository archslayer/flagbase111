const { publicClient, makeWalletClient, CORE_ABI } = require('./client');
const { CORE, ATTACK_FEE_WEI } = require('./env');
const { readCountry } = require('./read');

async function doAttack(privKey, fromId, toId, amountToken18) {
  const wc = makeWalletClient(privKey);
  const acc = (await wc.getAddresses())[0];
  const beforeFrom = await readCountry(fromId);
  const beforeTo   = await readCountry(toId);

  const hash = await wc.writeContract({
    address: CORE,
    abi: CORE_ABI,
    functionName: 'attack',
    args: [BigInt(fromId), BigInt(toId), amountToken18],
    value: ATTACK_FEE_WEI,
    account: acc,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const afterFrom = await readCountry(fromId);
  const afterTo   = await readCountry(toId);

  return { hash, receipt, beforeFrom, beforeTo, afterFrom, afterTo };
}

module.exports = { doAttack };