const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS!;

  console.log("🚀 Setting prices and supply...");

  const core = await ethers.getContractAt("FlagWarsCore", CORE_ADDRESS);

  // Set Turkey price (5.00 USDC)
  console.log("Setting Turkey price...");
  const tx1 = await core.seedCountryPrice(90, 5e6); // 5.00 USDC6
  await tx1.wait();
  console.log("✅ Turkey price set to 5.00 USDC");

  // Set UK price (5.00 USDC)
  console.log("Setting UK price...");
  const tx2 = await core.seedCountryPrice(44, 5e6); // 5.00 USDC6
  await tx2.wait();
  console.log("✅ UK price set to 5.00 USDC");

  // Set US price (5.00 USDC)
  console.log("Setting US price...");
  const tx3 = await core.seedCountryPrice(1, 5e6); // 5.00 USDC6
  await tx3.wait();
  console.log("✅ US price set to 5.00 USDC");

  console.log("\n✅ All prices set successfully!");
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});
