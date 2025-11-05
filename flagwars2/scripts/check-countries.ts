const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Checking countries in FlagWarsCore_Production...\n");

  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS;
  if (!CORE_ADDRESS) {
    throw new Error("NEXT_PUBLIC_CORE_ADDRESS not set");
  }

  console.log("Core address:", CORE_ADDRESS, "\n");

  const Core = await ethers.getContractAt("FlagWarsCore_Production", CORE_ADDRESS);

  const countriesToCheck = [
    { id: 90, expectedName: "Turkey" },
    { id: 44, expectedName: "United Kingdom" },
    { id: 1, expectedName: "United States" }
  ];

  console.log("=".repeat(70));
  for (const country of countriesToCheck) {
    try {
      const info = await Core.getCountryInfo(country.id);
      const [name, token, price8, totalSupply18, attacks, exists] = info;

      console.log(`\nCountry ID ${country.id} (Expected: ${country.expectedName}):`);
      console.log(`  Name: "${name}"`);
      console.log(`  Exists: ${exists}`);
      console.log(`  Price: ${Number(price8) / 1e8} USDC`);
      console.log(`  Total Supply: ${ethers.formatEther(totalSupply18)} tokens`);
      
      const remaining = await Core.remainingSupply(country.id);
      console.log(`  Remaining Supply: ${ethers.formatEther(remaining)} tokens`);
      console.log(`  Attacks: ${attacks.toString()}`);
      console.log(`  Token Address: ${token}`);
    } catch (error) {
      console.error(`\n❌ Error checking country ID ${country.id}:`, error.message);
    }
  }
  console.log("\n" + "=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

