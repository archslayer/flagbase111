const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const coreAddr = process.env.NEXT_PUBLIC_CORE_ADDRESS!;
  if (!coreAddr) {
    console.error("❌ NEXT_PUBLIC_CORE_ADDRESS not set");
    process.exit(1);
  }

  console.log("🔄 Unpausing contract:", coreAddr);
  
  const core = await ethers.getContractAt("FlagWarsCore_Production", coreAddr);

  try {
    const tx = await core.unpause();
    await tx.wait();
    console.log("✅ Contract unpaused successfully!");
  } catch (error) {
    console.log("❌ Unpause failed:", error.message);
  }
}

main().catch((e) => { 
  console.error("❌ Unpause failed:", e); 
  process.exit(1); 
});
