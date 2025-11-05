const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS!;
  const TREASURY = process.env.TREASURY || process.env.NEXT_PUBLIC_CORE_ADDRESS || "0x0000000000000000000000000000000000000000"; // geçici
  const REVENUE  = process.env.REVENUE  || process.env.NEXT_PUBLIC_CORE_ADDRESS || "0x0000000000000000000000000000000000000000";
  const COMM     = process.env.COMMISSIONS || process.env.NEXT_PUBLIC_CORE_ADDRESS || "0x0000000000000000000000000000000000000000";

  const cfg = {
    payToken: USDC,
    treasury: TREASURY,
    revenue: REVENUE,
    commissions: COMM
  };

  console.log("🚀 Deploying Core...");
  
  const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"   // Base Sepolia USDC
  const treasury = (await ethers.getSigners())[0].address  // Deployer acts as treasury
  const revenue = (await ethers.getSigners())[0].address   // Revenue (attack fees) go to deployer
  
  console.log("Config:", { usdc, treasury, revenue });

  const Core = await ethers.getContractFactory("Core");
  const core = await Core.deploy(usdc, treasury, revenue);
  await core.waitForDeployment();
  const coreAddress = await core.getAddress();
  console.log("✅ Core deployed to:", coreAddress);

  // Check if contract is paused and unpause if needed
  try {
    console.log("🔄 Checking contract pause status...");
    const isPaused = await core.paused();
    if (isPaused) {
      console.log("🔄 Unpausing contract...");
      const tx = await core.unpause();
      await tx.wait();
      console.log("✅ Contract unpaused");
    } else {
      console.log("✅ Contract is already unpaused");
    }
  } catch (error) {
    console.log("⚠️ Could not check pause status:", error.message);
  }

  console.log("\n📝 Update your .env.local:");
  console.log(`NEXT_PUBLIC_CORE_ADDRESS=${coreAddress}`);
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});