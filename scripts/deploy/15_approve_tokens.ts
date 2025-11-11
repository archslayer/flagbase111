const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS!;
  const TURKEY_TOKEN = process.env.TURKEY_TOKEN_ADDRESS!;
  const UK_TOKEN = process.env.UK_TOKEN_ADDRESS!;
  const US_TOKEN = process.env.US_TOKEN_ADDRESS!;

  console.log("🚀 Approving tokens for treasury...");

  // Turkey token approval
  console.log("Approving Turkey token...");
  const turkeyToken = await ethers.getContractAt("IERC20", TURKEY_TOKEN);
  const tx1 = await turkeyToken.approve(CORE_ADDRESS, ethers.MaxUint256);
  await tx1.wait();
  console.log("✅ Turkey token approved");

  // UK token approval
  console.log("Approving UK token...");
  const ukToken = await ethers.getContractAt("IERC20", UK_TOKEN);
  const tx2 = await ukToken.approve(CORE_ADDRESS, ethers.MaxUint256);
  await tx2.wait();
  console.log("✅ UK token approved");

  // US token approval
  console.log("Approving US token...");
  const usToken = await ethers.getContractAt("IERC20", US_TOKEN);
  const tx3 = await usToken.approve(CORE_ADDRESS, ethers.MaxUint256);
  await tx3.wait();
  console.log("✅ US token approved");

  console.log("\n✅ All tokens approved for treasury!");
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});
