require('dotenv').config({ path: '.env.local' });
const fs = require("fs/promises");
const path = require("path");
const { createPublicClient, createWalletClient, http, parseUnits, formatUnits } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { baseSepolia } = require("viem/chains");
const { detectCoreCaps } = require("./helpers/capabilities");
const { loadSpec } = require("./helpers/spec");
const { CORE_ABI } = require("./helpers/contracts");

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;
const PK = (process.env.E2E_PRIVATE_KEY || "").trim();

function toTOKEN18(x: string): bigint { return parseUnits(x, 18); }
function fmtUSDC6(n: bigint) { return formatUnits(n, 6); }
function fmtP8(n: bigint) { return Number(n) / 1e8; }

async function readCountry(pub: any, id: number) {
  const [name, token, price8, totalSupply, attacks, exists] = await pub.readContract({
    address: CORE, abi: CORE_ABI, functionName: "getCountryInfo", args: [BigInt(id)]
  });
  return { id, name, token, price8: BigInt(price8), totalSupply: BigInt(totalSupply), attacks: BigInt(attacks), exists };
}

async function main() {
  if (!CORE) throw new Error("NEXT_PUBLIC_CORE_ADDRESS missing");
  if (!PK) throw new Error("E2E_PRIVATE_KEY missing");

  console.log("🚀 Starting Live Attack E2E Test...");
  console.log(`📍 Core Contract: ${CORE}`);
  console.log(`🔗 RPC: ${RPC}`);
  console.log(`👤 Account: ${privateKeyToAccount(PK).address}`);

  const account = privateKeyToAccount(PK);
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

  const r: { name: string; status: "PASS" | "FAIL" | "SKIP"; note?: string }[] = [];
  const outDir = path.resolve("reports");
  await fs.mkdir(outDir, { recursive: true });

  // Test vektörleri (spec'ten)
  const spec = loadSpec();
  const fromId = spec.testVectors?.attack?.fromId ?? 90;
  const toId = spec.testVectors?.attack?.toId ?? 44;
  const amount = spec.testVectors?.attack?.amountToken ?? "0.01";

  console.log(`\n🎯 Test Vector: Attack ${fromId} → ${toId}, Amount: ${amount} TOKEN18`);

  // 0) Preflight checks
  try {
    const [chainId, blockNumber] = await Promise.all([
      pub.getChainId(),
      pub.getBlockNumber()
    ]);
    console.log(`✅ Network: ChainId=${chainId}, Block=${blockNumber}`);
    
    const balance = await pub.getBalance({ address: account.address });
    console.log(`💰 Account Balance: ${formatUnits(balance, 18)} ETH`);
    
    if (balance < parseUnits("0.005", 18)) {
      r.push({ name: "ETH Balance Check", status: "FAIL", note: `Insufficient ETH: ${formatUnits(balance, 18)}` });
    } else {
      r.push({ name: "ETH Balance Check", status: "PASS", note: `${formatUnits(balance, 18)} ETH` });
    }
  } catch (e: any) {
    r.push({ name: "Preflight Checks", status: "FAIL", note: e?.message });
    return r;
  }

  // 1) Contract capabilities detection
  console.log(`\n🔍 Detecting contract capabilities...`);
  const caps = await detectCoreCaps(pub, CORE, CORE_ABI);
  
  // 2) Read initial state
  console.log(`\n📊 Reading initial country states...`);
  try {
    const fromBefore = await readCountry(pub, fromId);
    const toBefore = await readCountry(pub, toId);
    
    console.log(`📈 From Country ${fromId}: Price=${fmtP8(fromBefore.price8)}, Supply=${formatUnits(fromBefore.totalSupply, 18)}`);
    console.log(`📉 To Country ${toId}: Price=${fmtP8(toBefore.price8)}, Supply=${formatUnits(toBefore.totalSupply, 18)}`);
    
    r.push({ name: "Initial State Read", status: "PASS", note: `From: ${fmtP8(fromBefore.price8)}, To: ${fmtP8(toBefore.price8)}` });
    
    // 3) Attack fee estimation
    let attackFee = parseUnits("0.001", 18); // Default small fee
    if (caps.hasGetCurrentTier) {
      try {
        const tier = await pub.readContract({
          address: CORE,
          abi: CORE_ABI,
          functionName: "getCurrentTier",
          args: [BigInt(fromId)]
        });
        attackFee = BigInt(tier[2]);
        console.log(`💸 Attack Fee: ${formatUnits(attackFee, 18)} ETH`);
      } catch (e) {
        console.log(`⚠️ Could not get tier fee, using 0.001 ETH default`);
      }
    } else {
      console.log(`⚠️ getCurrentTier not available, using 0.001 ETH default`);
    }
    
    // 4) Execute attack transaction
    console.log(`\n⚔️ Executing attack transaction...`);
    try {
      const hash = await wallet.writeContract({
        address: CORE,
        abi: CORE_ABI,
        functionName: "attack",
        args: [BigInt(fromId), BigInt(toId), toTOKEN18(amount)],
        value: attackFee,
      });
      
      console.log(`📝 Transaction Hash: ${hash}`);
      console.log(`⏳ Waiting for confirmation...`);
      
      const receipt = await pub.waitForTransactionReceipt({ hash });
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      
      if (receipt.status === "success") {
        r.push({ name: "Attack Transaction", status: "PASS", note: `Hash: ${hash.slice(0, 10)}...` });
        
        // 5) Verify price changes
        console.log(`\n📊 Verifying price changes...`);
        const fromAfter = await readCountry(pub, fromId);
        const toAfter = await readCountry(pub, toId);
        
        const fromPriceChange = fmtP8(fromAfter.price8) - fmtP8(fromBefore.price8);
        const toPriceChange = fmtP8(toAfter.price8) - fmtP8(toBefore.price8);
        
        console.log(`📈 From Country ${fromId}: ${fmtP8(fromBefore.price8)} → ${fmtP8(fromAfter.price8)} (${fromPriceChange >= 0 ? '+' : ''}${fromPriceChange.toFixed(6)})`);
        console.log(`📉 To Country ${toId}: ${fmtP8(toBefore.price8)} → ${fmtP8(toAfter.price8)} (${toPriceChange >= 0 ? '+' : ''}${toPriceChange.toFixed(6)})`);
        
        const expectedFromDecrease = fromPriceChange < 0;
        const expectedToIncrease = toPriceChange > 0;
        
        if (expectedFromDecrease && expectedToIncrease) {
          r.push({ name: "Price Delta Verification", status: "PASS", note: `From↓ ${fromPriceChange.toFixed(6)}, To↑ ${toPriceChange.toFixed(6)}` });
        } else {
          r.push({ name: "Price Delta Verification", status: "FAIL", note: `Unexpected changes: From ${fromPriceChange.toFixed(6)}, To ${toPriceChange.toFixed(6)}` });
        }
        
      } else {
        r.push({ name: "Attack Transaction", status: "FAIL", note: `Transaction failed` });
      }
      
    } catch (e: any) {
      console.error(`❌ Attack transaction failed:`, e.message);
      r.push({ name: "Attack Transaction", status: "FAIL", note: e?.shortMessage || e?.message });
    }
    
  } catch (e: any) {
    r.push({ name: "Initial State Read", status: "FAIL", note: e?.message });
  }

  // Generate report
  console.log(`\n📋 Generating report...`);
  const reportPath = path.join(outDir, "attack-live-report.md");
  const md = [
    "# Live Attack E2E Report",
    "",
    `**Timestamp:** ${new Date().toISOString()}`,
    `**Core Contract:** ${CORE}`,
    `**Test Vector:** Attack ${fromId} → ${toId}, Amount: ${amount} TOKEN18`,
    "",
    "| Test | Status | Notes |",
    "|------|--------|-------|",
    ...r.map(row => `| ${row.name} | ${row.status} | ${row.note || ""} |`)
  ].join("\n");
  
  await fs.writeFile(reportPath, md, "utf8");
  console.log(`📄 Report written to: ${reportPath}`);
  
  // Console summary
  console.log(`\n=== Live Attack E2E Summary ===`);
  r.forEach(row => {
    const icon = row.status === "PASS" ? "✅" : row.status === "FAIL" ? "❌" : "⏭️";
    console.log(`${icon} ${row.name}: ${row.status} ${row.note ? `(${row.note})` : ""}`);
  });
  
  const failed = r.some(row => row.status === "FAIL");
  console.log(`\n${failed ? "❌ Tests failed" : "✅ All tests passed"}`);
  
  return r;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
