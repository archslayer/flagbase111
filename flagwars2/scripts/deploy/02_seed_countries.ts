const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

const COUNTRIES = [
  { id: 90, name: "Turkey" },
  { id: 44, name: "UK" },
  { id: 1,  name: "USA" },
  { id: 2,  name: "Canada" },
  { id: 3,  name: "Germany" },
  { id: 4,  name: "France" },
  { id: 5,  name: "Japan" },
  { id: 6,  name: "Australia" },
  { id: 7,  name: "Brazil" },
  { id: 8,  name: "India" },
  { id: 9,  name: "China" },
  { id: 10, name: "Russia" },
  { id: 11, name: "Italy" },
  { id: 12, name: "Spain" },
  { id: 13, name: "Netherlands" },
  { id: 14, name: "Sweden" },
  { id: 15, name: "Switzerland" },
  { id: 16, name: "South Korea" },
  { id: 17, name: "Mexico" },
  { id: 18, name: "Argentina" },
  { id: 19, name: "South Africa" },
  { id: 20, name: "Thailand" },
  { id: 21, name: "Vietnam" },
  { id: 22, name: "Philippines" },
  { id: 23, name: "Indonesia" },
  { id: 24, name: "Malaysia" },
  { id: 25, name: "Singapore" },
  { id: 26, name: "UAE" },
  { id: 27, name: "Saudi Arabia" },
  { id: 28, name: "Israel" },
  { id: 29, name: "Poland" },
  { id: 30, name: "Portugal" },
  { id: 31, name: "Greece" },
  { id: 32, name: "Ukraine" },
  { id: 33, name: "Nigeria" },
  { id: 34, name: "Egypt" },
  { id: 35, name: "Morocco" },
];

async function main() {
  const coreAddr = process.env.NEXT_PUBLIC_CORE_ADDRESS!;
  if (!coreAddr) {
    console.error("❌ NEXT_PUBLIC_CORE_ADDRESS not set in .env.local");
    process.exit(1);
  }

  console.log("🌍 Seeding countries to Core:", coreAddr);
  
  const core = await ethers.getContractAt("FlagWarsCore_Production", coreAddr);

  for (const c of COUNTRIES) {
    const price8 = 5_0000_0000; // $5.00 * 1e8
    const supply18 = ethers.parseUnits("50000", 18); // 50k supply
    
    try {
      const tx = await core.createCountry(c.id, c.name, ethers.ZeroAddress, price8, supply18);
      await tx.wait();
      console.log(`✅ Seeded: ${c.name} (ID: ${c.id})`);
    } catch (error) {
      console.log(`❌ Failed to seed ${c.name}:`, error.message);
    }
  }

  console.log("🎉 Country seeding completed!");
}

main().catch((e) => { 
  console.error("❌ Seed failed:", e); 
  process.exit(1); 
});
