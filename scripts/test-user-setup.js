/**
 * Test User Setup Script
 * Creates a test user with some country tokens for testing attack functionality
 */

const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Setting up test user...");
  
  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  // Get contract instances
  const Core = await ethers.getContractFactory("FlagWarsCore");
  const core = Core.attach("0x781dd56430774e630dE83f98c29e7FB3cC61f36b"); // Core contract address
  
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = MockUSDC.attach("0x036CbD53842c5426634e7929541eC2318f3dCF7e"); // USDC address
  
  // Test user addresses (you can replace with your own)
  const testUsers = [
    "0x1234567890123456789012345678901234567890", // Replace with actual test addresses
    deployer.address // Use deployer as test user for now
  ];
  
  const testUser = testUsers[1]; // Use deployer for now
  
  console.log("Test user:", testUser);
  
  // Check USDC balance
  const usdcBalance = await usdc.balanceOf(testUser);
  console.log("USDC balance:", ethers.utils.formatUnits(usdcBalance, 6));
  
  // Mint USDC if needed
  if (usdcBalance.lt(ethers.utils.parseUnits("1000", 6))) {
    console.log("Minting USDC...");
    await usdc.mint(testUser, ethers.utils.parseUnits("1000", 6));
    console.log("✅ USDC minted");
  }
  
  // Test countries to buy tokens for
  const testCountries = [26, 44, 90]; // Turkey, UK, and another country
  
  for (const countryId of testCountries) {
    try {
      console.log(`\n🏴 Checking country ${countryId}...`);
      
      // Check if country exists
      const countryInfo = await core.getCountryInfo(countryId);
      console.log("Country exists:", countryInfo.exists);
      console.log("Country name:", countryInfo.name);
      console.log("Country price:", ethers.utils.formatUnits(countryInfo.price, 8));
      
      if (!countryInfo.exists) {
        console.log("⚠️ Country doesn't exist, skipping...");
        continue;
      }
      
      // Check current token balance
      const tokenAddress = countryInfo.token;
      const Token = await ethers.getContractFactory("MockToken");
      const token = Token.attach(tokenAddress);
      
      const currentBalance = await token.balanceOf(testUser);
      console.log("Current token balance:", ethers.utils.formatEther(currentBalance));
      
      // Buy some tokens if balance is low
      if (currentBalance.lt(ethers.utils.parseEther("1"))) {
        console.log("Buying tokens...");
        
        // Approve USDC spending
        const buyAmount = ethers.utils.parseEther("0.5"); // 0.5 tokens
        const buyPrice = await core.getBuyPrice(countryId, buyAmount);
        console.log("Buy price:", ethers.utils.formatUnits(buyPrice, 6), "USDC");
        
        await usdc.connect(deployer).approve(core.address, buyPrice);
        
        // Buy tokens
        const tx = await core.connect(deployer).buy(
          countryId,
          buyAmount,
          buyPrice,
          Math.floor(Date.now() / 1000) + 300 // 5 minute deadline
        );
        
        await tx.wait();
        console.log("✅ Tokens purchased:", ethers.utils.formatEther(buyAmount));
        
        // Check new balance
        const newBalance = await token.balanceOf(testUser);
        console.log("New token balance:", ethers.utils.formatEther(newBalance));
      } else {
        console.log("✅ Sufficient token balance");
      }
      
    } catch (error) {
      console.error(`❌ Error with country ${countryId}:`, error.message);
    }
  }
  
  console.log("\n🎉 Test user setup complete!");
  console.log("You can now test the attack functionality with this user.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
