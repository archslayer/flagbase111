const { publicClient, makeWalletClient, CORE_ABI } = require('./client');
const { CORE } = require('./env');
const { withSlippageDown } = require('./units');
const { readCountry } = require('./read');

// küçük miktarlarla market etkisini ve step'i gözlemliyoruz
async function doBuy(privKey, countryId, amountToken18, slippageBps = 200) {
  const wc = makeWalletClient(privKey);
  const acc = (await wc.getAddresses())[0];
  const before = await readCountry(countryId);

  // basit minOut: P_before üzerinden slippage uygulayarak
  const price8 = before.price8;
  const usdc6_est = (amountToken18 * price8) / (10n**18n) / 100n;
  const minOut = withSlippageDown(usdc6_est, slippageBps);
  const deadline = Math.floor(Date.now()/1000) + 600;

  const hash = await wc.writeContract({
    address: CORE,
    abi: CORE_ABI,
    functionName: 'buy',
    args: [BigInt(countryId), amountToken18, minOut, BigInt(deadline)],
    account: acc,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const after = await readCountry(countryId);
  return { hash, receipt, before, after };
}

async function doSell(privKey, countryId, amountToken18, slippageBps = 200) {
  const wc = makeWalletClient(privKey);
  const acc = (await wc.getAddresses())[0];
  const before = await readCountry(countryId);

  // sell minOut = net USDC6 tahmini üzerinden slippage
  const price8 = before.price8;
  const usdc6_est = (amountToken18 * price8) / (10n**18n) / 100n;
  const minOut = withSlippageDown(usdc6_est, slippageBps);
  const deadline = Math.floor(Date.now()/1000) + 600;

  const hash = await wc.writeContract({
    address: CORE,
    abi: CORE_ABI,
    functionName: 'sell',
    args: [BigInt(countryId), amountToken18, minOut, BigInt(deadline)],
    account: acc,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const after = await readCountry(countryId);
  return { hash, receipt, before, after };
}

module.exports = { doBuy, doSell };