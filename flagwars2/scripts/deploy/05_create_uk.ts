const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS!;
  const UK_TOKEN = process.env.UK_TOKEN_ADDRESS!;

  console.log("🚀 Creating UK...");

  const core = await ethers.getContractAt("FlagWarsCore", CORE_ADDRESS);

  // Create UK (ID: 44)
  const tx = await core.createCountry(44, "United Kingdom", UK_TOKEN);
  await tx.wait();
  console.log("✅ UK created");
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});
