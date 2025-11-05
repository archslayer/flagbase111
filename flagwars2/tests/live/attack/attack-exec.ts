require('dotenv').config({ path: '.env.local' });
const { createPublicClient, createWalletClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { baseSepolia } = require("viem/chains");
const { CORE_ABI } = require("../helpers/contracts");
const { loadSpec } = require("../helpers/spec");
const { detectCaps } = require("./capabilities");
const { toTOKEN18, toETH18, fmtP8 } = require("./units");

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;
const PK = (process.env.E2E_PRIVATE_KEY || "").trim();

async function getCountry(pub: any, id: number) {
  const [name, token, price8, totalSupply, attacks, exists] = await pub.readContract({
    address: CORE, abi: CORE_ABI, functionName: "getCountryInfo", args: [BigInt(id)]
  });
  return { id, name, token, price8: BigInt(price8), totalSupply: BigInt(totalSupply), attacks: BigInt(attacks), exists };
}

async function main() {
  if (!CORE || !PK) throw new Error("env missing");
  
  const account = privateKeyToAccount(PK);
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const wal = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

  console.log("⚔️ Attack Execution Test...");
  console.log(`📍 Contract: ${CORE}`);
  console.log(`👤 Account: ${account.address}`);

  const caps = await detectCaps(CORE, CORE_ABI, RPC);
  const spec = loadSpec();
  const fromId = spec.testVectors?.attack?.fromId ?? 90;
  const toId = spec.testVectors?.attack?.toId ?? 44;
  const amount = spec.testVectors?.attack?.amountToken ?? "0.05";

  console.log(`\n🎯 Test Vector: Attack ${fromId} → ${toId}, Amount: ${amount} TOKEN18`);

  const from0 = await getCountry(pub, fromId);
  const to0 = await getCountry(pub, toId);
  console.log("📊 Baseline:", { 
    fromPrice: fmtP8(from0.price8), 
    toPrice: fmtP8(to0.price8),
    fromName: from0.name,
    toName: to0.name
  });

  // fee mode
  const attackAbi = (CORE_ABI as any[]).find((x) => x.type === "function" && x.name === "attack");
  if (!attackAbi) throw new Error("attack() not present in ABI");
  
  const feeMode = attackAbi.stateMutability === "payable" ? "ETH_MSG_VALUE" : "USDC_ALLOWANCE";
  console.log("💸 feeMode:", feeMode);

  const args = [BigInt(fromId), BigInt(toId), toTOKEN18(amount)];
  
  // Test different fee values
  const feeValues = [
    { label: "0 ETH", value: 0n },
    { label: "0.001 ETH", value: toETH18("0.001") },
    { label: "0.01 ETH", value: toETH18("0.01") },
    { label: "0.1 ETH", value: toETH18("0.1") },
  ];

  let success = false;

  for (const fee of feeValues) {
    console.log(`\n🧪 Testing with ${fee.label}...`);
    
    const opts = { value: fee.value };

    console.log(`💰 msg.value: ${fee.value.toString()}`);

    // 1) simulate
    try {
      console.log("🔍 Simulating attack transaction...");
      await pub.simulateContract({ 
        address: CORE, 
        abi: CORE_ABI, 
        functionName: "attack", 
        args, 
        account, 
        ...opts 
      });
      console.log("✅ Simulation successful!");
    } catch (e) { 
      console.log("❌ simulate revert:", (e as Error).message); 
      continue;
    }

    // 2) send
    try {
      console.log("🚀 Sending attack transaction...");
      const hash = await wal.writeContract({ 
        address: CORE, 
        abi: CORE_ABI, 
        functionName: "attack", 
        args, 
        ...opts 
      });
      console.log(`📝 Transaction hash: ${hash}`);
      
      const rcpt = await pub.waitForTransactionReceipt({ hash });
      console.log(`✅ Transaction confirmed: ${rcpt.status}`);
      
      if (rcpt.status === "success") {
        console.log("🎉 Attack successful!");
        success = true;
        
        const from1 = await getCountry(pub, fromId);
        const to1 = await getCountry(pub, toId);
        console.log("📊 After attack:", { 
          fromPrice: fmtP8(from1.price8), 
          toPrice: fmtP8(to1.price8)
        });
        
        const fromDelta = Number(fmtP8(from1.price8)) - Number(fmtP8(from0.price8));
        const toDelta = Number(fmtP8(to1.price8)) - Number(fmtP8(to0.price8));
        
        console.log("📈 Price changes:");
        console.log(`- From country: ${fromDelta >= 0 ? '+' : ''}${fromDelta.toFixed(6)} USDC`);
        console.log(`- To country: ${toDelta >= 0 ? '+' : ''}${toDelta.toFixed(6)} USDC`);
        
        // Expected: from price should decrease, to price should increase
        if (fromDelta < 0 && toDelta > 0) {
          console.log("✅ Price changes are as expected!");
        } else {
          console.log("⚠️ Price changes are unexpected");
        }
        break; // Success, exit loop
      } else {
        console.log("❌ Transaction failed");
      }
    } catch (e) { 
      console.log("❌ send revert:", (e as Error).message); 
    }
  }

  if (!success) {
    console.log("\n❌ All fee values failed");
    console.log("💡 Possible causes:");
    console.log("- Contract is paused");
    console.log("- Access control restrictions");
    console.log("- Invalid amount or country parameters");
    console.log("- Fee calculation mismatch");
  }

  console.log("\n🎯 Attack execution completed!");
}

main().catch(e => { 
  console.error(e); 
  process.exit(1); 
});