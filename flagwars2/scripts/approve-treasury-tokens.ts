import { ethers } from "ethers";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const TREASURY = process.env.TREASURY_ADDRESS as string;
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY as string;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PK as string;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  
  // Use deployer to send ETH to treasury
  const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const deployerBalance = await provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${ethers.formatEther(deployerBalance)} ETH`);
  
  // Send 0.01 ETH to treasury for gas
  const treasury = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);
  console.log(`\nSending 0.01 ETH to treasury ${TREASURY}...`);
  const tx = await deployer.sendTransaction({
    to: TREASURY,
    value: ethers.parseEther("0.01")
  });
  await tx.wait();
  console.log(`✓ Sent ETH to treasury`);
  
  // Wait a bit for the transaction to settle
  await new Promise(r => setTimeout(r, 10000));
  
  const treasuryBalance = await provider.getBalance(TREASURY);
  console.log(`Treasury balance: ${ethers.formatEther(treasuryBalance)} ETH\n`);
  
  if (treasuryBalance === 0n) {
    throw new Error("Treasury still has no ETH");
  }
  
  const coreAddr = "0x3c7B82C4A174A44b2276cD41982CF0c291380fA8";
  const tokenTRAddr = "0xb0c14e761fA6F43237A33CE0Cb92Aa326Dfa793E";
  const tokenUKAddr = "0x7668C426Ea6C6E0E5b474DE08fDFb31B9ab39621";
  const tokenUSAddr = "0x5ED996cc633C7BE2Ba6e213537B440d63ba8327D";
  
  const FlagTokenArtifact = require("../artifacts/contracts/FlagToken.sol/FlagToken.json");
  
  console.log("--- Approving tokens from Treasury ---\n");
  
  for (const [tokenAddr, name] of [
    [tokenTRAddr, "TR"],
    [tokenUKAddr, "UK"],
    [tokenUSAddr, "US"]
  ] as const) {
    const token = new ethers.Contract(tokenAddr, FlagTokenArtifact.abi, treasury);
    
    try {
      const tx = await token.approve(coreAddr, ethers.MaxUint256);
      console.log(`Approving ${name}...`);
      await tx.wait();
      console.log(`✓ Approved ${name} token\n`);
    } catch (error: any) {
      console.error(`✗ Failed to approve ${name}:`, error.message);
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log("=== Approval Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
