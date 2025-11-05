const { ethers } = require("hardhat");

async function main() {
  console.log("⏸️  Unpausing FlagWarsCore_Production...\n");

  const [deployer] = await ethers.getSigners();
  const coreAddress = process.env.NEXT_PUBLIC_CORE_ADDRESS || "0xb47D23AAF7f16A3D08D4a714aeF49f50fB6B879d";

  console.log("Deployer address:", deployer.address);
  console.log("Core address:", coreAddress, "\n");

  const Core = await ethers.getContractFactory("FlagWarsCore_Production");
  const core = Core.attach(coreAddress);

  console.log("Sending unpause transaction...");
  const tx = await core.unpause({ gasLimit: 100000 }); // Explicit gas limit
  console.log("Transaction hash:", tx.hash);
  
  console.log("Waiting for confirmation...");
  await tx.wait();
  
  console.log("✅ Contract unpaused successfully!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

