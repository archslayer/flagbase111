require('dotenv').config({ path: ".env.local" });

const { runPricesTest } = require("./prices-live.spec");
const { runBuySellTest } = require("./buy-sell-live.spec");
const { runAttackTest } = require("./attack-live.spec");

async function runAllTests(): Promise<void> {
  console.log("🚀 Starting Phase 2 Live Tests...");
  console.log(`📍 Contract: ${process.env.NEXT_PUBLIC_CORE_ADDRESS}`);
  console.log(`🌐 RPC: ${process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA}`);
  console.log("");

  try {
    // Run all tests
    await runPricesTest();
    console.log("\n" + "=".repeat(50) + "\n");
    
    await runBuySellTest();
    console.log("\n" + "=".repeat(50) + "\n");
    
    await runAttackTest();
    
    console.log("\n🎉 Phase 2 Live Tests completed!");
    console.log("📝 Check ./tests/live/phase2/RUN.md for detailed report");
    
  } catch (error) {
    console.error("❌ Test suite failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };
