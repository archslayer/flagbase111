const { ethers } = require("hardhat");

async function main() {
  console.log("💰 Checking contract balances...\n");

  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS;
  const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS;

  if (!CORE_ADDRESS || !USDC_ADDRESS) {
    throw new Error("Missing env vars");
  }

  console.log("Core Contract:", CORE_ADDRESS);
  console.log("USDC Address:", USDC_ADDRESS, "\n");

  // Get USDC contract
  const USDC = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
    USDC_ADDRESS
  );

  // Check Core contract's USDC balance
  const balance = await USDC.balanceOf(CORE_ADDRESS);
  const decimals = await USDC.decimals();

  console.log("=".repeat(60));
  console.log("Core Contract USDC Balance:");
  console.log(`  Raw: ${balance.toString()}`);
  console.log(`  Formatted: ${ethers.formatUnits(balance, decimals)} USDC`);
  console.log("=".repeat(60));

  if (balance === 0n) {
    console.log("\n⚠️  WARNING: Contract has NO USDC!");
    console.log("Sell will fail because contract can't pay users.");
    console.log("\nTo fix: Send USDC to contract for treasury liquidity.");
  } else {
    console.log("\n✅ Contract has USDC for sell operations");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

