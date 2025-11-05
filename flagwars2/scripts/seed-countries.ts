const { ethers } = require("hardhat");

async function main() {
  console.log("🌍 Seeding countries to FlagWarsCore_Production...\n");

  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS;
  if (!CORE_ADDRESS) {
    throw new Error("NEXT_PUBLIC_CORE_ADDRESS not set in .env.local");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("Core address:", CORE_ADDRESS, "\n");

  // Get Core contract
  const Core = await ethers.getContractAt("FlagWarsCore_Production", CORE_ADDRESS);

  // Countries to seed
  const countries = [
    {
      id: 90,
      name: "Turkey",
      token: ethers.ZeroAddress, // No separate ERC20 token (using internal balance)
      price8: BigInt(500_000_000), // 5.00 USDC (8 decimals)
      supply18: ethers.parseEther("50000") // 50,000 tokens
    },
    {
      id: 44,
      name: "United Kingdom",
      token: ethers.ZeroAddress,
      price8: BigInt(500_000_000), // 5.00 USDC
      supply18: ethers.parseEther("50000") // 50,000 tokens
    },
    {
      id: 1,
      name: "United States",
      token: ethers.ZeroAddress,
      price8: BigInt(500_000_000), // 5.00 USDC
      supply18: ethers.parseEther("50000") // 50,000 tokens
    }
  ];

  for (const country of countries) {
    console.log(`Creating country: ${country.name} (ID: ${country.id})`);
    console.log(`  Price: ${Number(country.price8) / 1e8} USDC`);
    console.log(`  Supply: ${ethers.formatEther(country.supply18)} tokens`);

    try {
      const tx = await Core.createCountry(
        country.id,
        country.name,
        country.token,
        country.price8,
        country.supply18
      );

      console.log(`  Transaction hash: ${tx.hash}`);
      await tx.wait();
      console.log(`  ✅ ${country.name} created!\n`);
    } catch (error: any) {
      console.error(`  ❌ Failed to create ${country.name}:`, error.message, "\n");
    }
  }

  console.log("=".repeat(60));
  console.log("📋 SEEDING SUMMARY");
  console.log("=".repeat(60));

  // Verify countries
  for (const country of countries) {
    try {
      const info = await Core.getCountryInfo(country.id);
      const [name, token, price8, totalSupply18, attacks, exists] = info;

      console.log(`\n${name} (ID: ${country.id}):`);
      console.log(`  Exists: ${exists}`);
      console.log(`  Price: ${Number(price8) / 1e8} USDC`);
      console.log(`  Total Supply: ${ethers.formatEther(totalSupply18)} tokens`);
      console.log(`  Remaining Supply: ${ethers.formatEther(await Core.remainingSupply(country.id))} tokens`);
      console.log(`  Attacks: ${attacks.toString()}`);
    } catch (error: any) {
      console.error(`Failed to get info for country ${country.id}:`, error.message);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Seeding complete!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

