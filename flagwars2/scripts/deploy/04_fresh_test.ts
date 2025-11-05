const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

const COUNTRIES = [
  { id: 100, name: "TurkeyTest" },
  { id: 101, name: "UKTest" },
];

async function main() {
  const coreAddr = process.env.NEXT_PUBLIC_CORE_ADDRESS!;
  if (!coreAddr) {
    console.error("❌ NEXT_PUBLIC_CORE_ADDRESS not set in .env.local");
    process.exit(1);
  }

  console.log("🌍 Seeding fresh test countries to Core:", coreAddr);
  
  const core = await ethers.getContractAt("FlagWarsCore_Production", coreAddr);

  for (const c of COUNTRIES) {
    const price8 = 5_0000_0000; // $5.00 * 1e8 (fresh price)
    const supply18 = ethers.parseUnits("50000", 18); // 50k supply
    
    try {
      const tx = await core.createCountry(c.id, c.name, ethers.ZeroAddress, price8, supply18);
      await tx.wait();
      console.log(`✅ Seeded: ${c.name} (ID: ${c.id}) - Price: ${price8}`);
    } catch (error) {
      console.log(`❌ Failed to seed ${c.name}:`, error.message);
    }
  }

  console.log("🎉 Fresh test seeding completed!");
}

main().catch((e) => { 
  console.error("❌ Seed failed:", e); 
  process.exit(1); 
});
