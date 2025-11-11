const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  console.log("🚀 Deploying tokens...");

  // Deploy Turkey token
  const TurkeyToken = await ethers.getContractFactory("FlagWarsToken");
  const turkeyToken = await TurkeyToken.deploy("Turkey Flag", "TR");
  await turkeyToken.waitForDeployment();
  const turkeyAddress = await turkeyToken.getAddress();
  console.log("✅ Turkey token deployed to:", turkeyAddress);

  // Deploy UK token
  const UKToken = await ethers.getContractFactory("FlagWarsToken");
  const ukToken = await UKToken.deploy("United Kingdom Flag", "UK");
  await ukToken.waitForDeployment();
  const ukAddress = await ukToken.getAddress();
  console.log("✅ UK token deployed to:", ukAddress);

  // Deploy US token
  const USToken = await ethers.getContractFactory("FlagWarsToken");
  const usToken = await USToken.deploy("United States Flag", "US");
  await usToken.waitForDeployment();
  const usAddress = await usToken.getAddress();
  console.log("✅ US token deployed to:", usAddress);

  console.log("\n📝 Update your .env.local:");
  console.log(`TURKEY_TOKEN_ADDRESS=${turkeyAddress}`);
  console.log(`UK_TOKEN_ADDRESS=${ukAddress}`);
  console.log(`US_TOKEN_ADDRESS=${usAddress}`);
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});
