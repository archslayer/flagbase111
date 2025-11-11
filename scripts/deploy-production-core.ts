const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying FlagWarsCore_Production to Base Sepolia...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Contract addresses
  const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
  const FEE_TOKEN = USDC_ADDRESS; // For now, use USDC as fee token too (can be changed later)
  const TREASURY = deployer.address; // For now, deployer is treasury
  const REVENUE = deployer.address; // Revenue wallet
  const COMMISSIONS = deployer.address; // Referral commissions wallet

  // Config parameters
  const config = {
    payToken: USDC_ADDRESS,
    feeToken: FEE_TOKEN,   // ERC20 token for attack fees (when not USDC)
    treasury: TREASURY,
    revenue: REVENUE,
    commissions: COMMISSIONS,
    buyFeeBps: 0,          // 0% fee on buy
    sellFeeBps: 500,       // 5% fee on sell (500 basis points)
    referralShareBps: 3000, // 30% of fee goes to referral
    revenueShareBps: 7000,  // 70% of fee goes to revenue
    priceMin8: 1_000_000,   // 0.01 USDC (1e8 decimals)
    kappa: 55_000,          // 0.00055 USDC (price step up on buy)
    lambda: 55_550,         // 0.0005555 USDC (price step down on sell)
    attackFeeInUSDC: true,  // Attack uses USDC fees (not alternative token)
    
    // Attack tier thresholds (PRICE8)
    tier1Price8: 500_000_000,    // 5 USDC * 1e8
    tier2Price8: 1_000_000_000,  // 10 USDC * 1e8
    tier3Price8: 1_500_000_000,  // 15 USDC * 1e8
    
    // Attack tier deltas (PRICE8)
    delta1_8: 110_000,     // 0.0011 * 1e8
    delta2_8: 90_000,      // 0.0009 * 1e8
    delta3_8: 70_000,      // 0.0007 * 1e8
    delta4_8: 50_000,      // 0.0005 * 1e8
    
    // Attack tier fees - USDC mode (6 decimals)
    fee1_USDC6: 300_000,   // 0.30 USDC * 1e6
    fee2_USDC6: 350_000,   // 0.35 USDC * 1e6
    fee3_USDC6: 400_000,   // 0.40 USDC * 1e6
    fee4_USDC6: 450_000,   // 0.45 USDC * 1e6
    
    // Attack tier fees - TOKEN mode (18 decimals) - not used when attackFeeInUSDC=true
    fee1_TOKEN18: ethers.parseEther("0.3"),   // 0.3 tokens
    fee2_TOKEN18: ethers.parseEther("0.35"),  // 0.35 tokens
    fee3_TOKEN18: ethers.parseEther("0.4"),   // 0.4 tokens
    fee4_TOKEN18: ethers.parseEther("0.45")   // 0.45 tokens
  };

  console.log("Config:");
  console.log("- USDC Address:", config.payToken);
  console.log("- Fee Token Address:", config.feeToken);
  console.log("- Treasury:", config.treasury);
  console.log("- Revenue:", config.revenue);
  console.log("- Commissions:", config.commissions);
  console.log("- Buy Fee:", config.buyFeeBps / 100, "%");
  console.log("- Sell Fee:", config.sellFeeBps / 100, "%");
  console.log("- Referral Share:", config.referralShareBps / 100, "%");
  console.log("- Revenue Share:", config.revenueShareBps / 100, "%");
  console.log("- Price Min:", config.priceMin8 / 1e8, "USDC");
  console.log("- Kappa:", config.kappa / 1e8, "USDC");
  console.log("- Lambda:", config.lambda / 1e8, "USDC");
  console.log("- Attack Fee Mode:", config.attackFeeInUSDC ? "USDC (6d)" : "TOKEN (18d)");
  console.log("\n🎯 Attack Tiers:");
  if (config.attackFeeInUSDC) {
    console.log("- Tier 1 (≤$5.00): Δ=" + (config.delta1_8 / 1e8) + ", Fee=" + (config.fee1_USDC6 / 1e6) + " USDC");
    console.log("- Tier 2 (≤$10.00): Δ=" + (config.delta2_8 / 1e8) + ", Fee=" + (config.fee2_USDC6 / 1e6) + " USDC");
    console.log("- Tier 3 (≤$15.00): Δ=" + (config.delta3_8 / 1e8) + ", Fee=" + (config.fee3_USDC6 / 1e6) + " USDC");
    console.log("- Tier 4 (>$15.00): Δ=" + (config.delta4_8 / 1e8) + ", Fee=" + (config.fee4_USDC6 / 1e6) + " USDC\n");
  } else {
    console.log("- Tier 1 (≤$5.00): Δ=" + (config.delta1_8 / 1e8) + ", Fee=" + ethers.formatEther(config.fee1_TOKEN18) + " TOKEN");
    console.log("- Tier 2 (≤$10.00): Δ=" + (config.delta2_8 / 1e8) + ", Fee=" + ethers.formatEther(config.fee2_TOKEN18) + " TOKEN");
    console.log("- Tier 3 (≤$15.00): Δ=" + (config.delta3_8 / 1e8) + ", Fee=" + ethers.formatEther(config.fee3_TOKEN18) + " TOKEN");
    console.log("- Tier 4 (>$15.00): Δ=" + (config.delta4_8 / 1e8) + ", Fee=" + ethers.formatEther(config.fee4_TOKEN18) + " TOKEN\n");
  }

  // Deploy Core
  console.log("Deploying FlagWarsCore_Production...");
  const Core = await ethers.getContractFactory("FlagWarsCore_Production");
  const core = await Core.deploy(config);
  await core.waitForDeployment();
  const coreAddress = await core.getAddress();

  console.log("✅ FlagWarsCore_Production deployed to:", coreAddress);
  console.log("   Transaction hash:", core.deploymentTransaction()?.hash);
  console.log("   Block number:", core.deploymentTransaction()?.blockNumber, "\n");

  // Unpause contract
  console.log("Unpausing contract...");
  const unpauseTx = await core.unpause();
  await unpauseTx.wait();
  console.log("✅ Contract unpaused\n");

  // Summary
  console.log("=".repeat(60));
  console.log("📋 DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("Network: Base Sepolia (ChainID: 84532)");
  console.log("Deployer:", deployer.address);
  console.log("Core Contract:", coreAddress);
  console.log("USDC Address:", USDC_ADDRESS);
  console.log("=".repeat(60));
  console.log("\n✅ Deployment successful!");
  console.log("\n📝 Next steps:");
  console.log("1. Update .env.local with new CORE address:");
  console.log(`   NEXT_PUBLIC_CORE_ADDRESS=${coreAddress}`);
  console.log("2. Seed countries using scripts/seed-countries.ts");
  console.log("3. Verify contract on Basescan");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

