require('dotenv').config({ path: '.env.local' });
const fs = require("fs/promises");
const path = require("path");
const { createPublicClient, createWalletClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { baseSepolia } = require("viem/chains");
const { CORE_ABI } = require("../helpers/contracts");
const { loadSpec } = require("../helpers/spec");
const { detectCaps } = require("./capabilities");
const { toTOKEN18, toETH18, fmtUSDC6, fmtP8 } = require("./units");

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;
const PK = (process.env.E2E_PRIVATE_KEY || "").trim();

async function getCountry(client: any, id: number) {
  const [name, token, price8, totalSupply, attacks, exists] = await client.readContract({
    address: CORE, abi: CORE_ABI, functionName: "getCountryInfo", args: [BigInt(id)]
  });
  return { id, name, token, price8: BigInt(price8), totalSupply: BigInt(totalSupply), attacks: BigInt(attacks), exists };
}

async function tryAttack(wallet: any, pub: any, args: {fromId:number, toId:number, amountToken: string}, msgValue?: bigint) {
  // CONTRACT SIGNATURE: attack(uint256,uint256,uint256)
  const amt = toTOKEN18(args.amountToken);
  
  // 1) simulate for revert reason (varsa)
  try {
    await pub.simulateContract({
      address: CORE, abi: CORE_ABI, functionName: "attack",
      args: [BigInt(args.fromId), BigInt(args.toId), amt],
      value: msgValue ?? 0n,
      account: wallet.account,
    });
  } catch (e) {
    return { ok: false as const, phase: "simulate", err: e };
  }
  
  // 2) send tx
  try {
    const hash = await wallet.writeContract({
      address: CORE, abi: CORE_ABI, functionName: "attack",
      args: [BigInt(args.fromId), BigInt(args.toId), amt],
      value: msgValue ?? 0n,
    });
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    return { ok: true as const, phase: "send", hash, status: rcpt.status };
  } catch (e) {
    return { ok: false as const, phase: "send", err: e };
  }
}

async function main() {
  if (!CORE) throw new Error("NEXT_PUBLIC_CORE_ADDRESS missing");
  if (!PK) throw new Error("E2E_PRIVATE_KEY missing");

  const account = privateKeyToAccount(PK);
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

  const report: string[] = [];
  const outDir = path.resolve("reports");
  await fs.mkdir(outDir, { recursive: true });

  console.log("🚀 Starting Live Attack Diagnose & E2E Test...");
  console.log(`📍 Contract: ${CORE}`);
  console.log(`👤 Account: ${account.address}`);

  // ---- Capabilities
  console.log("\n🔍 Detecting contract capabilities...");
  const caps = await detectCaps(CORE, CORE_ABI, RPC);
  report.push(`### Capabilities
- paused(): ${caps.has_paused ? "YES" : "NO/REVERT"}
- getConfig(): ${caps.has_getConfig ? "YES" : "NO/REVERT"}
- getCurrentTier(): ${caps.has_getCurrentTier ? "YES" : "NO/REVERT"}
- getCountryInfo(): ${caps.has_getCountryInfo ? "YES" : "NO"}`);

  // ---- Baseline countries
  const spec = loadSpec();
  const fromId = spec.testVectors?.attack?.fromId ?? 90;
  const toId = spec.testVectors?.attack?.toId ?? 44;
  const amtStr = spec.testVectors?.attack?.amountToken ?? "0.05";

  console.log(`\n📊 Reading baseline country states...`);
  const from0 = await getCountry(pub, fromId);
  const to0 = await getCountry(pub, toId);
  
  report.push(`\n### Baseline
- From(${fromId}) ${from0.name} price8=${fmtP8(from0.price8)} totalSupply=${from0.totalSupply}
- To(${toId}) ${to0.name} price8=${fmtP8(to0.price8)} totalSupply=${to0.totalSupply}`);

  // Floor guard (spec'e göre min 0.01 USDC ise price8 >= 1_000_000)
  const floorOk = from0.price8 >= 1_000_000n && to0.price8 >= 1_000_000n;
  report.push(`- Floor guard check (>=0.01 USDC): ${floorOk ? "OK" : "LOW (attack disallowed?)"}`);

  // ---- Attack fee stratejileri:
  const tierFeeUSDC = spec.attack?.feeTiers?.[0]?.fee ?? "0.30"; // örn 0.30 USDC
  const trialMsgValues: { label: string, value: bigint }[] = [
    { label: "msg.value=0", value: 0n },
    { label: `msg.value≈tierFee as ETH (${tierFeeUSDC})`, value: toETH18(String(tierFeeUSDC)) },
    { label: "msg.value=1e14 wei (~0.0001 ETH)", value: 100000000000000n },
  ];

  console.log(`\n⚔️ Testing attack strategies...`);
  let attackSucceeded = false;

  for (const t of trialMsgValues) {
    console.log(`\n🧪 Testing: ${t.label}`);
    const res = await tryAttack(wallet, pub, { fromId, toId, amountToken: amtStr }, t.value);
    
    if (res.ok) {
      report.push(`\n### Attack Succeeded with ${t.label}
- tx: ${res.hash}
- status: ${res.status}`);
      
      // state after
      const from1 = await getCountry(pub, fromId);
      const to1 = await getCountry(pub, toId);
      report.push(`- After:
  From price8: ${fmtP8(from0.price8)} → ${fmtP8(from1.price8)}
  To   price8: ${fmtP8(to0.price8)} → ${fmtP8(to1.price8)}
`);
      attackSucceeded = true;
      break;
    } else {
      const errorMsg = (res.err as Error)?.message || String(res.err);
      report.push(`\n### Attack Failed with ${t.label}
- phase: ${res.phase}
- error: ${errorMsg}`);
      console.log(`❌ Failed: ${errorMsg}`);
    }
  }

  if (!attackSucceeded) {
    report.push(`\n### Summary
❌ All attack attempts failed. Possible causes:
1. Contract is paused
2. Access control restrictions
3. Incorrect fee/amount parameters
4. Contract validation failures
5. ABI mismatch`);

    console.log("\n❌ All attack attempts failed");
  } else {
    console.log("\n✅ Attack succeeded!");
  }

  // Write report
  const reportPath = path.join(outDir, "attack-live.md");
  await fs.writeFile(reportPath, report.join("\n"));
  console.log(`\n📄 Report written to: ${reportPath}`);
  console.log("\n" + report.join("\n"));
}

main().catch((e) => { 
  console.error(e); 
  process.exit(1); 
});
