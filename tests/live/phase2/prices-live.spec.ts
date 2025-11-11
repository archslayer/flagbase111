require('dotenv').config({ path: ".env.local" });
const { Reporter } = require("./helpers/reporter");
const { readCountry, getBuyPrice, getSellPrice } = require("./helpers/core");
const { detectCapabilities } = require("./helpers/capabilities");
const { fmt8, fmt6, token18AtPrice8ToUSDC6 } = require("./helpers/units");

async function runPricesTest(): Promise<void> {
  const reporter = new Reporter();
  
  console.log("🔍 Testing live price reading and scaling...");

  try {
    // Test country IDs
    const testCountries = [90, 44, 100, 101]; // Turkey, UK, TurkeyTest, UKTest
    
    // 1) Test getCountryInfo
    for (const countryId of testCountries) {
      try {
        const country = await readCountry(countryId);
        if (country.exists) {
          reporter.push({
            name: `getCountryInfo(${countryId})`,
            status: 'PASS',
            note: `${country.name}: $${fmt8(country.price8)}`
          });
        } else {
          reporter.push({
            name: `getCountryInfo(${countryId})`,
            status: 'SKIP',
            note: 'Country does not exist'
          });
        }
      } catch (error) {
        reporter.push({
          name: `getCountryInfo(${countryId})`,
          status: 'FAIL',
          note: error.message
        });
      }
    }

    // 2) Test price scaling conversion
    try {
      const country = await readCountry(90); // Turkey
      if (country.exists) {
        const testAmount = BigInt("1000000000000000000"); // 1 TOKEN18
        const expectedUSDC6 = token18AtPrice8ToUSDC6(testAmount, country.price8);
        
        reporter.push({
          name: "Price scaling conversion",
          status: 'PASS',
          note: `1 TOKEN = ${fmt6(expectedUSDC6)} USDC at $${fmt8(country.price8)}`
        });
      } else {
        reporter.push({
          name: "Price scaling conversion",
          status: 'SKIP',
          note: 'Turkey country not found'
        });
      }
    } catch (error) {
      reporter.push({
        name: "Price scaling conversion",
        status: 'FAIL',
        note: error.message
      });
    }

    // 3) Test getBuyPrice/getSellPrice if available
    const caps = await detectCapabilities();
    
    if (caps.getBuyPrice) {
      try {
        const buyPrice = await getBuyPrice(90, "1.0"); // 1 TOKEN
        reporter.push({
          name: "getBuyPrice(90, 1.0)",
          status: 'PASS',
          note: `${fmt6(buyPrice)} USDC`
        });
      } catch (error) {
        reporter.push({
          name: "getBuyPrice(90, 1.0)",
          status: 'FAIL',
          note: error.message
        });
      }
    } else {
      reporter.push({
        name: "getBuyPrice",
        status: 'SKIP',
        note: 'Function not available'
      });
    }

    if (caps.getSellPrice) {
      try {
        const sellPrice = await getSellPrice(90, "1.0"); // 1 TOKEN
        reporter.push({
          name: "getSellPrice(90, 1.0)",
          status: 'PASS',
          note: `${fmt6(sellPrice)} USDC`
        });
      } catch (error) {
        reporter.push({
          name: "getSellPrice(90, 1.0)",
          status: 'FAIL',
          note: error.message
        });
      }
    } else {
      reporter.push({
        name: "getSellPrice",
        status: 'SKIP',
        note: 'Function not available'
      });
    }

  } catch (error) {
    reporter.push({
      name: "Prices test setup",
      status: 'FAIL',
      note: error.message
    });
  }

  reporter.print();
  reporter.writeMd();
}

if (require.main === module) {
  runPricesTest().catch(console.error);
}

module.exports = { runPricesTest };
