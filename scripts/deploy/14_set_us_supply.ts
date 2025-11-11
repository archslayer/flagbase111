const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS!;

  console.log("🚀 Setting US supply to 50,000...");

  const core = await ethers.getContractAt("FlagWarsCore", CORE_ADDRESS);

  // Set US supply (50,000 tokens)
  const tx = await core.setInitialSupply(1, ethers.parseEther("50000"));
  await tx.wait();
  console.log("✅ US supply set to 50,000");
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});
