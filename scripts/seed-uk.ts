const { ethers } = require("hardhat");

async function main() {
  console.log("🇬🇧 Seeding United Kingdom...\n");

  const [deployer] = await ethers.getSigners();
  const coreAddress = process.env.NEXT_PUBLIC_CORE_ADDRESS;
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS;

  const Core = await ethers.getContractFactory("FlagWarsCore_Production");
  const core = Core.attach(coreAddress);

  console.log("Creating United Kingdom (ID: 44)...");
  const tx = await core.createCountry(
    44,
    "United Kingdom",
    usdcAddress,
    ethers.parseUnits("5", 8), // price8
    ethers.parseUnits("50000", 18) // supply18
  );
  await tx.wait();
  console.log("Transaction hash:", tx.hash);
  console.log("✅ United Kingdom created!\n");

  // Verify
  const info = await core.getCountryInfo(44);
  const remaining = await core.remainingSupply(44);
  console.log("United Kingdom (ID: 44):");
  console.log("  Exists:", info[5]);
  console.log("  Price:", ethers.formatUnits(info[2], 8), "USDC");
  console.log("  Total Supply:", ethers.formatUnits(info[3], 18), "tokens");
  console.log("  Remaining Supply:", ethers.formatUnits(remaining, 18), "tokens");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

