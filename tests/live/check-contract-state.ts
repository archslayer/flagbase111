require('dotenv').config({ path: '.env.local' });
const { createPublicClient, http } = require("viem");
const { baseSepolia } = require("viem/chains");
const { CORE_ABI } = require("./helpers/contracts");

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;

async function checkContractState() {
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });

  console.log("🔍 Checking Contract State...");
  console.log(`📍 Contract: ${CORE}`);
  
  // Check basic contract info
  try {
    const code = await pub.getCode({ address: CORE });
    console.log(`📦 Contract Code Length: ${code.length} bytes`);
    
    if (code === "0x") {
      console.log("❌ No contract code found at this address!");
      return;
    }
  } catch (e) {
    console.log(`❌ Error checking contract code: ${e.message}`);
    return;
  }

  // Try to call different functions to see what works
  const functions = [
    "paused",
    "getConfig", 
    "getCountryInfo",
    "getCurrentTier",
    "owner",
    "priceMin",
    "buyFeeBps",
    "sellFeeBps"
  ];

  for (const funcName of functions) {
    try {
      let result;
      if (funcName === "getCountryInfo") {
        result = await pub.readContract({
          address: CORE,
          abi: CORE_ABI,
          functionName: funcName,
          args: [90n]
        });
      } else if (funcName === "getCurrentTier") {
        result = await pub.readContract({
          address: CORE,
          abi: CORE_ABI,
          functionName: funcName,
          args: [90n]
        });
      } else {
        result = await pub.readContract({
          address: CORE,
          abi: CORE_ABI,
          functionName: funcName
        });
      }
      
      console.log(`✅ ${funcName}: ${JSON.stringify(result)}`);
    } catch (e: any) {
      console.log(`❌ ${funcName}: ${e.shortMessage || e.message}`);
    }
  }

  // Check if we can read country info for different IDs
  console.log("\n🌍 Checking Country Info...");
  for (const id of [44, 90, 1, 2, 3]) {
    try {
      const result = await pub.readContract({
        address: CORE,
        abi: CORE_ABI,
        functionName: "getCountryInfo",
        args: [BigInt(id)]
      });
      console.log(`✅ Country ${id}: exists=${result[5]}, name="${result[0]}", price=${result[2]}, supply=${result[3]}`);
    } catch (e: any) {
      console.log(`❌ Country ${id}: ${e.shortMessage || e.message}`);
    }
  }
}

checkContractState().catch(console.error);
