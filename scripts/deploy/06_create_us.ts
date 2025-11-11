const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS!;
  const US_TOKEN = process.env.US_TOKEN_ADDRESS!;

  console.log("🚀 Creating US...");

  const core = await ethers.getContractAt("FlagWarsCore", CORE_ADDRESS);

  // Create US (ID: 1)
  const tx = await core.createCountry(1, "United States", US_TOKEN);
  await tx.wait();
  console.log("✅ US created");
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});
