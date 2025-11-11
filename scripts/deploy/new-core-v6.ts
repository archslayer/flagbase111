import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as string;
const TREASURY = process.env.TREASURY_ADDRESS as string;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PK as string;

interface DeployedContracts {
  core: string;
  tokenTR: string;
  tokenUK: string;
  tokenUS: string;
}

async function main() {
  console.log("=== Core v6 Setup (Skip Deploy) ===");
  console.log(`RPC: ${RPC}`);
  console.log(`USDC: ${USDC}`);
  console.log(`TREASURY: ${TREASURY}`);
  
  // Connect to network
  const provider = new ethers.JsonRpcProvider(RPC);
  const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
  
  console.log(`Deployer: ${deployer.address}`);
  const balance = await provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    throw new Error("Deployer has no ETH");
  }
  
  // Deploy FlagToken contracts
  console.log("\n--- Deploying FlagTokens ---");
  const FlagTokenArtifact = require("../../artifacts/contracts/FlagToken.sol/FlagToken.json");
  const FlagTokenFactory = new ethers.ContractFactory(
    FlagTokenArtifact.abi,
    FlagTokenArtifact.bytecode,
    deployer
  );
  
  // Deploy TR Token
  console.log("Deploying TR Token...");
  const tokenTR = await FlagTokenFactory.deploy("Turkey Flag", "TRFLAG", TREASURY);
  await tokenTR.waitForDeployment();
  const tokenTRAddr = await tokenTR.getAddress();
  console.log(`✓ TR Token: ${tokenTRAddr}`);
  
  // Deploy UK Token
  console.log("Deploying UK Token...");
  await new Promise(r => setTimeout(r, 2000));
  const tokenUK = await FlagTokenFactory.deploy("United Kingdom Flag", "UKFLAG", TREASURY);
  await tokenUK.waitForDeployment();
  const tokenUKAddr = await tokenUK.getAddress();
  console.log(`✓ UK Token: ${tokenUKAddr}`);
  
  // Deploy US Token
  console.log("Deploying US Token...");
  await new Promise(r => setTimeout(r, 2000));
  const tokenUS = await FlagTokenFactory.deploy("United States Flag", "USFLAG", TREASURY);
  await tokenUS.waitForDeployment();
  const tokenUSAddr = await tokenUS.getAddress();
  console.log(`✓ US Token: ${tokenUSAddr}`);
  
  // Deploy Core
  console.log("\n--- Deploying Core ---");
  await new Promise(r => setTimeout(r, 3000)); // Wait to avoid nonce issues
  const CoreArtifact = require("../../artifacts/contracts/Core.sol/Core.json");
  const CoreFactory = new ethers.ContractFactory(
    CoreArtifact.abi,
    CoreArtifact.bytecode,
    deployer
  );
  const core = await CoreFactory.deploy(USDC, TREASURY);
  await core.waitForDeployment();
  const coreAddr = await core.getAddress();
  console.log(`✓ Core: ${coreAddr}`);
  
  // Mint tokens to Core
  console.log("\n--- Minting tokens to Core ---");
  const SUPPLY_PER_COUNTRY = ethers.parseUnits("50000", 18); // 50,000 tokens per country
  
  // Mint directly to Core (Core will hold the inventory)
  for (const [token, tokenAddr, name] of [
    [tokenTR, tokenTRAddr, "TR"],
    [tokenUK, tokenUKAddr, "UK"],
    [tokenUS, tokenUSAddr, "US"]
  ] as const) {
    // Mint to Core address (Core will hold the tokens)
    await token.mint(coreAddr, SUPPLY_PER_COUNTRY);
    console.log(`✓ Minted ${name}: ${ethers.formatUnits(SUPPLY_PER_COUNTRY, 18)} tokens to Core`);
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Add countries to Core
  console.log("\n--- Adding countries to Core ---");
  
  // Turkey (ID: 90)
  await core.addCountry(
    90,
    "Turkey",
    tokenTRAddr,
    ethers.parseUnits("5", 8), // 5.00 USDC start price (in PRICE8)
    55000,  // kappa8: price increment per buy
    55550,  // lambda8: price decrement per sell
    ethers.parseUnits("1", 8)  // priceMin8: 1.00 USDC floor
  );
  console.log("✓ Added Turkey (ID: 90)");
  
  await new Promise(r => setTimeout(r, 2000)); // Nonce fix
  
  // United Kingdom (ID: 44)
  await core.addCountry(
    44,
    "United Kingdom",
    tokenUKAddr,
    ethers.parseUnits("5", 8),
    55000,
    55550,
    ethers.parseUnits("1", 8)
  );
  console.log("✓ Added United Kingdom (ID: 44)");
  
  await new Promise(r => setTimeout(r, 2000)); // Nonce fix
  
  // United States (ID: 1)
  await core.addCountry(
    1,
    "United States",
    tokenUSAddr,
    ethers.parseUnits("5", 8),
    55000,
    55550,
    ethers.parseUnits("1", 8)
  );
  console.log("✓ Added United States (ID: 1)");
  
  // Authorize Core for USDC pulls (for attack fees)
  console.log("\n--- Setting authorization ---");
  await core.setAuthorized(coreAddr, true);
  console.log("✓ Authorized Core for USDC pulls");
  
  // Save deployment info
  const deployment: DeployedContracts = {
    core: coreAddr,
    tokenTR: tokenTRAddr,
    tokenUK: tokenUKAddr,
    tokenUS: tokenUSAddr
  };
  
  const outputPath = path.resolve(__dirname, '../../deployment/core-v6-base-sepolia.json');
  fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));
  console.log(`\n✓ Deployment info saved to: ${outputPath}`);
  
  console.log("\n=== Deployment Complete ===");
  console.log(`Core: ${coreAddr}`);
  console.log(`TR Token: ${tokenTRAddr}`);
  console.log(`UK Token: ${tokenUKAddr}`);
  console.log(`US Token: ${tokenUSAddr}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
