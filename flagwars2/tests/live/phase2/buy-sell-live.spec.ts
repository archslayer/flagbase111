require('dotenv').config({ path: ".env.local" });
const { Reporter } = require("./helpers/reporter");
const { readCountry, getBuyPrice, getSellPrice, buy, sell, getConfig } = require("./helpers/core");
const { detectCapabilities } = require("./helpers/capabilities");
const { fmt8, fmt6, calculateSlippage } = require("./helpers/units");

async function runBuySellTest(): Promise<void> {
  const reporter = new Reporter();
  
  console.log("🛒 Testing live buy/sell flow...");

  try {
    const caps = await detectCapabilities();
    
    if (!caps.getBuyPrice) {
      reporter.push({
        name: "Buy/Sell flow",
        status: 'SKIP',
        note: 'getBuyPrice not available'
      });
      reporter.print();
      reporter.writeMd();
      return;
    }

    // Test country (Turkey - ID 90)
    const testCountryId = 90;
    
    // 1) Get initial state
    let beforeState;
    try {
      beforeState = await readCountry(testCountryId);
      if (!beforeState.exists) {
        reporter.push({
          name: "Buy/Sell flow",
          status: 'SKIP',
          note: 'Test country does not exist'
        });
        reporter.print();
        reporter.writeMd();
        return;
      }
      reporter.push({
        name: "Initial state",
        status: 'PASS',
        note: `${beforeState.name}: $${fmt8(beforeState.price8)}`
      });
    } catch (error) {
      reporter.push({
        name: "Initial state",
        status: 'FAIL',
        note: error.message
      });
      reporter.print();
      reporter.writeMd();
      return;
    }

    // 2) Test buy price calculation
    try {
      const buyAmount = "0.01"; // 0.01 TOKEN
      const buyPrice = await getBuyPrice(testCountryId, buyAmount);
      const minOut = calculateSlippage(buyPrice, 200); // 2% slippage
      
      reporter.push({
        name: "Buy price calculation",
        status: 'PASS',
        note: `${buyAmount} TOKEN = ${fmt6(buyPrice)} USDC (min: ${fmt6(minOut)})`
      });
    } catch (error) {
      reporter.push({
        name: "Buy price calculation",
        status: 'FAIL',
        note: error.message
      });
    }

    // 3) Test sell price calculation
    try {
      const sellAmount = "0.005"; // 0.005 TOKEN
      const sellPrice = await getSellPrice(testCountryId, sellAmount);
      const minOut = calculateSlippage(sellPrice, 200); // 2% slippage
      
      reporter.push({
        name: "Sell price calculation",
        status: 'PASS',
        note: `${sellAmount} TOKEN = ${fmt6(sellPrice)} USDC (min: ${fmt6(minOut)})`
      });
    } catch (error) {
      reporter.push({
        name: "Sell price calculation",
        status: 'FAIL',
        note: error.message
      });
    }

    // 4) Test floor price guard
    try {
      const config = await getConfig();
      const currentPrice = beforeState.price8;
      
      if (currentPrice > config.priceMin8) {
        reporter.push({
          name: "Floor price guard",
          status: 'PASS',
          note: `Current: $${fmt8(currentPrice)}, Floor: $${fmt8(config.priceMin8)}`
        });
      } else {
        reporter.push({
          name: "Floor price guard",
          status: 'FAIL',
          note: `Price at floor: $${fmt8(currentPrice)}`
        });
      }
    } catch (error) {
      reporter.push({
        name: "Floor price guard",
        status: 'FAIL',
        note: error.message
      });
    }

    // 5) Optional: Test actual buy/sell transactions (commented out for safety)
    /*
    if (caps.buy && caps.sell) {
      try {
        console.log("⚠️  Testing actual buy/sell transactions...");
        
        // Buy transaction
        const buyResult = await buy(testCountryId, "0.01", minOut);
        reporter.push({
          name: "Buy transaction",
          status: 'PASS',
          note: `Tx: ${buyResult.hash.slice(0, 10)}...`
        });
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Sell transaction
        const sellResult = await sell(testCountryId, "0.005", minOut);
        reporter.push({
          name: "Sell transaction",
          status: 'PASS',
          note: `Tx: ${sellResult.hash.slice(0, 10)}...`
        });
        
      } catch (error) {
        reporter.push({
          name: "Buy/Sell transactions",
          status: 'FAIL',
          note: error.message
        });
      }
    }
    */

  } catch (error) {
    reporter.push({
      name: "Buy/Sell test setup",
      status: 'FAIL',
      note: error.message
    });
  }

  reporter.print();
  reporter.writeMd();
}

if (require.main === module) {
  runBuySellTest().catch(console.error);
}

module.exports = { runBuySellTest };
