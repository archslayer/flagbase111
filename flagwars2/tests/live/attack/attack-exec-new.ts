require('dotenv').config({ path: '.env.local' });
const { createPublicClient, createWalletClient, http, decodeEventLog } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { baseSepolia } = require("viem/chains");

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;
const PK = (process.env.E2E_PRIVATE_KEY || "").trim();

// New Core ABI (from compiled contract)
const ABI = [
  {
    "inputs": [{"internalType": "uint256", "name": "id", "type": "uint256"}],
    "name": "getCountryInfo",
    "outputs": [
      {"internalType": "string", "name": "", "type": "string"},
      {"internalType": "address", "name": "", "type": "address"},
      {"internalType": "uint256", "name": "", "type": "uint256"},
      {"internalType": "uint256", "name": "", "type": "uint256"},
      {"internalType": "uint256", "name": "", "type": "uint256"},
      {"internalType": "bool", "name": "", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "fromId", "type": "uint256"},
      {"internalType": "uint256", "name": "toId", "type": "uint256"},
      {"internalType": "uint256", "name": "amountToken18", "type": "uint256"}
    ],
    "name": "attack",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paused",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getConfig",
    "outputs": [
      {
        "components": [
          {"internalType": "address", "name": "payToken", "type": "address"},
          {"internalType": "address", "name": "treasury", "type": "address"},
          {"internalType": "address", "name": "revenue", "type": "address"},
          {"internalType": "address", "name": "commissions", "type": "address"},
          {"internalType": "uint16", "name": "buyFeeBps", "type": "uint16"},
          {"internalType": "uint16", "name": "sellFeeBps", "type": "uint16"},
          {"internalType": "uint16", "name": "referralShareBps", "type": "uint16"},
          {"internalType": "uint16", "name": "revenueShareBps", "type": "uint16"},
          {"internalType": "uint64", "name": "priceMin8", "type": "uint64"},
          {"internalType": "uint64", "name": "kappa", "type": "uint64"},
          {"internalType": "uint64", "name": "lambda", "type": "uint64"},
          {"internalType": "bool", "name": "attackPayableETH", "type": "bool"}
        ],
        "internalType": "struct Config",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const toWei = (eth) => BigInt(Math.floor(parseFloat(eth) * 1e18).toString());

async function getInfo(pub, id) {
  const [name, token, price8, totalSupply, attacks, exists] = await pub.readContract({
    address: CORE, abi: ABI, functionName: "getCountryInfo", args: [BigInt(id)]
  });
  return { name, price8: BigInt(price8), totalSupply: BigInt(totalSupply), attacks: BigInt(attacks), exists };
}

async function main() {
  if (!CORE || !PK) throw new Error("env missing");
  
  const account = privateKeyToAccount(PK);
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const wal = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

  console.log("⚔️ Live Attack Test - New Production Core");
  console.log(`📍 Contract: ${CORE}`);
  console.log(`👤 Account: ${account.address}`);

  // Check contract state
  try {
    const paused = await pub.readContract({ address: CORE, abi: ABI, functionName: "paused" });
    console.log(`⏸️ Contract paused: ${paused}`);
    
    const config = await pub.readContract({ address: CORE, abi: ABI, functionName: "getConfig" });
    console.log(`💰 Attack payable ETH: ${config.attackPayableETH}`);
  } catch (e) {
    console.log("❌ Failed to read contract state:", e.message);
    return;
  }

  const fromId = 100, toId = 101; // TurkeyTest -> UKTest (fresh test countries)
  const amountToken18 = 10n ** 16n; // 0.01 TOKEN

  console.log(`\n🎯 Attack: ${fromId} → ${toId}, Amount: ${amountToken18.toString()}`);

  const beforeFrom = await getInfo(pub, fromId);
  const beforeTo = await getInfo(pub, toId);
  console.log("📊 Before:", { 
    fromPrice8: beforeFrom.price8.toString(), 
    toPrice8: beforeTo.price8.toString(),
    fromName: beforeFrom.name,
    toName: beforeTo.name
  });

  // Test different fee values
  const feeValues = [
    { label: "0 ETH", value: 0n },
    { label: "0.0001 ETH", value: toWei("0.0001") },
    { label: "0.001 ETH", value: toWei("0.001") },
    { label: "0.01 ETH", value: toWei("0.01") },
  ];

  let success = false;

  for (const fee of feeValues) {
    console.log(`\n🧪 Testing with ${fee.label}...`);
    
    const opts = { value: fee.value };
    const args = [BigInt(fromId), BigInt(toId), amountToken18];

    try {
      // Simulate first
      console.log("🔍 Simulating...");
      await pub.simulateContract({
        address: CORE, abi: ABI, functionName: "attack",
        args, account, ...opts
      });
      console.log("✅ Simulation successful!");

      // Send transaction
      console.log("🚀 Sending transaction...");
      const hash = await wal.writeContract({
        address: CORE, abi: ABI, functionName: "attack",
        args, ...opts
      });
      
      console.log(`📝 Transaction hash: ${hash}`);
      const rcpt = await pub.waitForTransactionReceipt({ hash });
      console.log(`✅ Transaction confirmed: ${rcpt.status}`);

      if (rcpt.status === "success") {
        console.log("🎉 Attack successful!");
        success = true;

        // Check event logs for price changes
        console.log("📋 Event logs:");
        console.log(`Total logs: ${rcpt.logs.length}`);
        for (const log of rcpt.logs) {
          console.log(`Log: ${log.address} topics: ${log.topics.length}`);
          try {
            const decoded = decodeEventLog({
              abi: ABI,
              data: log.data,
              topics: log.topics,
            });
            console.log(`Decoded event:`, decoded.eventName);
            if (decoded.eventName === "Attack") {
              console.log(`🎯 Attack Event:`, {
                fromId: decoded.args.fromId.toString(),
                toId: decoded.args.toId.toString(),
                newPriceFrom8: decoded.args.newPriceFrom8.toString(),
                newPriceTo8: decoded.args.newPriceTo8.toString(),
              });
            }
          } catch (e) {
            console.log(`Failed to decode log: ${e.message}`);
          }
        }

        // Wait a bit for block confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const afterFrom = await getInfo(pub, fromId);
        const afterTo = await getInfo(pub, toId);
        console.log("📊 After (contract read):", { 
          fromPrice8: afterFrom.price8.toString(), 
          toPrice8: afterTo.price8.toString()
        });

        const fromDelta = Number(afterFrom.price8) - Number(beforeFrom.price8);
        const toDelta = Number(afterTo.price8) - Number(beforeTo.price8);
        
        console.log("📈 Price changes (raw):");
        console.log(`- From: ${beforeFrom.price8.toString()} → ${afterFrom.price8.toString()} (delta: ${fromDelta})`);
        console.log(`- To: ${beforeTo.price8.toString()} → ${afterTo.price8.toString()} (delta: ${toDelta})`);
        
        console.log("📈 Price changes (USDC):");
        console.log(`- From country: ${fromDelta >= 0 ? '+' : ''}${(fromDelta / 1e8).toFixed(6)} USDC`);
        console.log(`- To country: ${toDelta >= 0 ? '+' : ''}${(toDelta / 1e8).toFixed(6)} USDC`);
        
        break; // Success, exit loop
      }
    } catch (e) {
      console.log(`❌ Failed with ${fee.label}:`, e.message);
    }
  }

  if (!success) {
    console.log("\n❌ All attack attempts failed");
  }

  console.log("\n🎯 Attack test completed!");
}

main().catch(e => { 
  console.error("❌ Attack test failed:", e); 
  process.exit(1); 
});
