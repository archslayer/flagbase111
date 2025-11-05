const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  console.log("🚀 Deploying US token...");

  // Deploy US token
  const USToken = await ethers.getContractFactory("FlagWarsToken");
  const usToken = await USToken.deploy("United States Flag", "US");
  await usToken.waitForDeployment();
  const usAddress = await usToken.getAddress();
  console.log("✅ US token deployed to:", usAddress);

  console.log("\n📝 Update your .env.local:");
  console.log(`US_TOKEN_ADDRESS=${usAddress}`);
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});
