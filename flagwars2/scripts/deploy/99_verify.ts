const { run } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const addr = process.env.NEXT_PUBLIC_CORE_ADDRESS!;
  if (!addr) {
    console.error("❌ NEXT_PUBLIC_CORE_ADDRESS not set");
    process.exit(1);
  }

  const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS!;
  const TREASURY = process.env.TREASURY || addr;
  const REVENUE = process.env.REVENUE || addr;
  const COMM = process.env.COMMISSIONS || addr;

  const cfg = [
    USDC,
    TREASURY,
    REVENUE,
    COMM,
    0,      // buyFeeBps
    500,    // sellFeeBps
    3000,   // referralShareBps
    7000,   // revenueShareBps
    1000000, // priceMin8
    55000,  // kappa
    55550,  // lambda
    true    // attackPayableETH
  ];

  console.log("🔍 Verifying contract at:", addr);
  console.log("Constructor args:", cfg);

  try {
    await run("verify:verify", {
      address: addr,
      constructorArguments: cfg,
    });
    console.log("✅ Contract verified successfully!");
  } catch (error) {
    console.log("❌ Verification failed:", error.message);
  }
}

main().catch(e => { 
  console.error("❌ Verify failed:", e); 
  process.exit(1); 
});