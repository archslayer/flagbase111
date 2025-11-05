const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS!;

  console.log("🚀 Setting supply...");

  const core = await ethers.getContractAt("FlagWarsCore", CORE_ADDRESS);

  // Set Turkey supply (1000 tokens)
  console.log("Setting Turkey supply...");
  const tx1 = await core.setInitialSupply(90, ethers.parseEther("1000"));
  await tx1.wait();
  console.log("✅ Turkey supply set to 1000");

  // Set UK supply (1000 tokens)
  console.log("Setting UK supply...");
  const tx2 = await core.setInitialSupply(44, ethers.parseEther("1000"));
  await tx2.wait();
  console.log("✅ UK supply set to 1000");

  // Set US supply (1000 tokens)
  console.log("Setting US supply...");
  const tx3 = await core.setInitialSupply(1, ethers.parseEther("1000"));
  await tx3.wait();
  console.log("✅ US supply set to 1000");

  console.log("\n✅ All supply set successfully!");
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});
