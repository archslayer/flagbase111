const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS!;

  console.log("🚀 Setting UK price...");

  const core = await ethers.getContractAt("FlagWarsCore", CORE_ADDRESS);

  // Set UK price (5.00 USDC)
  const tx = await core.seedCountryPrice(44, 5e6); // 5.00 USDC6
  await tx.wait();
  console.log("✅ UK price set to 5.00 USDC");
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});
