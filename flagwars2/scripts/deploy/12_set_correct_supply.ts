const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS!;

  console.log("🚀 Setting correct supply (50,000)...");

  const core = await ethers.getContractAt("FlagWarsCore", CORE_ADDRESS);

  // Set Turkey supply (50,000 tokens)
  console.log("Setting Turkey supply to 50,000...");
  const tx1 = await core.setInitialSupply(90, ethers.parseEther("50000"));
  await tx1.wait();
  console.log("✅ Turkey supply set to 50,000");

  // Set UK supply (50,000 tokens)
  console.log("Setting UK supply to 50,000...");
  const tx2 = await core.setInitialSupply(44, ethers.parseEther("50000"));
  await tx2.wait();
  console.log("✅ UK supply set to 50,000");

  // Set US supply (50,000 tokens)
  console.log("Setting US supply to 50,000...");
  const tx3 = await core.setInitialSupply(1, ethers.parseEther("50000"));
  await tx3.wait();
  console.log("✅ US supply set to 50,000");

  console.log("\n✅ All supply set to 50,000!");
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});
