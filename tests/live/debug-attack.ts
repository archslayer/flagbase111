require('dotenv').config({ path: '.env.local' });
const { createPublicClient, createWalletClient, http, parseUnits } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { baseSepolia } = require("viem/chains");
const { CORE_ABI } = require("./helpers/contracts");

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;
const PK = (process.env.E2E_PRIVATE_KEY || "").trim();

async function debugAttack() {
  const account = privateKeyToAccount(PK);
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

  console.log("🔍 Debugging Attack Function...");
  
  // Test different parameters
  const testCases = [
    { fromId: 90, toId: 44, amount: "0.01", fee: parseUnits("0.001", 18) },
    { fromId: 90, toId: 44, amount: "0.001", fee: parseUnits("0.001", 18) },
    { fromId: 90, toId: 44, amount: "0.01", fee: 0n },
    { fromId: 90, toId: 44, amount: "0.01", fee: parseUnits("0.01", 18) },
  ];

  for (const testCase of testCases) {
    console.log(`\n🧪 Testing: ${testCase.fromId} → ${testCase.toId}, Amount: ${testCase.amount}, Fee: ${testCase.fee.toString()}`);
    
    try {
      // First try to simulate
      const result = await pub.simulateContract({
        address: CORE,
        abi: CORE_ABI,
        functionName: "attack",
        args: [BigInt(testCase.fromId), BigInt(testCase.toId), parseUnits(testCase.amount, 18)],
        value: testCase.fee,
        account: account.address,
      });
      
      console.log(`✅ Simulation successful: ${result.request.functionName}`);
      
      // If simulation works, try actual transaction
      const hash = await wallet.writeContract({
        address: CORE,
        abi: CORE_ABI,
        functionName: "attack",
        args: [BigInt(testCase.fromId), BigInt(testCase.toId), parseUnits(testCase.amount, 18)],
        value: testCase.fee,
      });
      
      console.log(`🚀 Transaction sent: ${hash}`);
      const receipt = await pub.waitForTransactionReceipt({ hash });
      console.log(`✅ Transaction confirmed: ${receipt.status}`);
      
      if (receipt.status === "success") {
        console.log(`🎉 SUCCESS with parameters: ${JSON.stringify(testCase)}`);
        break;
      }
      
    } catch (e: any) {
      console.log(`❌ Failed: ${e.shortMessage || e.message}`);
      
      // Try to get more detailed error info
      if (e.cause?.data) {
        console.log(`   Error data: ${e.cause.data}`);
      }
      if (e.cause?.reason) {
        console.log(`   Reason: ${e.cause.reason}`);
      }
      if (e.details) {
        console.log(`   Details: ${e.details}`);
      }
      
      // Check if it's a specific revert reason
      if (e.message?.includes("execution reverted")) {
        console.log(`   🔍 This is a contract revert - likely a validation failure`);
        console.log(`   💡 Possible causes: paused, insufficient balance, invalid parameters, or access control`);
      }
    }
  }
}

debugAttack().catch(console.error);
