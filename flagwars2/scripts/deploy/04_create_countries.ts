const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS!;
  const TURKEY_TOKEN = process.env.TURKEY_TOKEN_ADDRESS!;
  const UK_TOKEN = process.env.UK_TOKEN_ADDRESS!;
  const US_TOKEN = process.env.US_TOKEN_ADDRESS!;

  console.log("🚀 Creating countries...");

  const core = await ethers.getContractAt("FlagWarsCore", CORE_ADDRESS);

  // Create Turkey (ID: 90)
  console.log("Creating Turkey...");
  const tx1 = await core.createCountry(90, "Turkey", TURKEY_TOKEN);
  await tx1.wait();
  console.log("✅ Turkey created");

  // Create UK (ID: 44)
  console.log("Creating UK...");
  const tx2 = await core.createCountry(44, "United Kingdom", UK_TOKEN);
  await tx2.wait();
  console.log("✅ UK created");

  // Create US (ID: 1)
  console.log("Creating US...");
  const tx3 = await core.createCountry(1, "United States", US_TOKEN);
  await tx3.wait();
  console.log("✅ US created");

  console.log("\n✅ All countries created successfully!");
}

main().catch((e) => { 
  console.error("❌ Deploy failed:", e); 
  process.exit(1); 
});
