const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Starting FlagWars Core Audit Tests...\n");

  try {
    // Compile contracts
    console.log("📦 Compiling contracts...");
    await hre.run("compile");
    console.log("✅ Compilation successful\n");

    // Run tests
    console.log("🧪 Running test suite...");
    await hre.run("test", { 
      testFiles: ["test/FlagWarsCore.test.js"],
      timeout: 60000 
    });
    console.log("✅ Tests completed\n");

    // Run coverage if available
    try {
      console.log("📊 Running coverage analysis...");
      await hre.run("coverage");
      console.log("✅ Coverage analysis completed\n");
    } catch (error) {
      console.log("⚠️  Coverage analysis not available\n");
    }

    console.log("🎯 Audit test suite completed successfully!");
    
  } catch (error) {
    console.error("❌ Audit test suite failed:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
