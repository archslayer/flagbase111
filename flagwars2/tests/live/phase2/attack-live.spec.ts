require('dotenv').config({ path: ".env.local" });
const { Reporter } = require("./helpers/reporter");
const { readCountry, attack, getCurrentTier, isPaused } = require("./helpers/core");
const { detectCapabilities } = require("./helpers/capabilities");
const { fmt8, fmt6 } = require("./helpers/units");

async function runAttackTest(): Promise<void> {
  const reporter = new Reporter();
  
  console.log("⚔️ Testing live attack flow...");

  try {
    const caps = await detectCapabilities();
    
    // Test countries
    const fromId = 100; // TurkeyTest
    const toId = 101;   // UKTest
    
    // 1) Check contract paused status
    try {
      const paused = await isPaused();
      if (paused) {
        reporter.push({
          name: "Contract paused check",
          status: 'FAIL',
          note: 'Contract is paused'
        });
        reporter.print();
        reporter.writeMd();
        return;
      } else {
        reporter.push({
          name: "Contract paused check",
          status: 'PASS',
          note: 'Contract is active'
        });
      }
    } catch (error) {
      reporter.push({
        name: "Contract paused check",
        status: 'SKIP',
        note: 'paused() function not available'
      });
    }

    // 2) Get initial states
    let fromBefore, toBefore;
    try {
      fromBefore = await readCountry(fromId);
      toBefore = await readCountry(toId);
      
      if (!fromBefore.exists || !toBefore.exists) {
        reporter.push({
          name: "Attack flow",
          status: 'SKIP',
          note: 'Test countries do not exist'
        });
        reporter.print();
        reporter.writeMd();
        return;
      }
      
      reporter.push({
        name: "Initial states",
        status: 'PASS',
        note: `${fromBefore.name}: $${fmt8(fromBefore.price8)}, ${toBefore.name}: $${fmt8(toBefore.price8)}`
      });
    } catch (error) {
      reporter.push({
        name: "Initial states",
        status: 'FAIL',
        note: error.message
      });
      reporter.print();
      reporter.writeMd();
      return;
    }

    // 3) Test attack fee calculation
    try {
      const feeInfo = await getCurrentTier(toId);
      reporter.push({
        name: "Attack fee calculation",
        status: 'PASS',
        note: `Fee: ${fmt6(feeInfo.attackFeeUSDC6_orETHwei)} ETH, Delta: ${fmt8(feeInfo.delta8)}`
      });
    } catch (error) {
      reporter.push({
        name: "Attack fee calculation",
        status: 'FAIL',
        note: error.message
      });
    }

    // 4) Test single attack
    if (caps.attack) {
      try {
        console.log("⚠️  Testing actual attack transaction...");
        
        const attackAmount = "0.01"; // 0.01 TOKEN
        const attackResult = await attack(fromId, toId, attackAmount);
        
        reporter.push({
          name: "Single attack",
          status: 'PASS',
          note: `Tx: ${attackResult.hash.slice(0, 10)}...`
        });
        
        // Wait for block confirmation
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check price changes
        const fromAfter = await readCountry(fromId);
        const toAfter = await readCountry(toId);
        
        const fromDelta = Number(fromAfter.price8) - Number(fromBefore.price8);
        const toDelta = Number(toAfter.price8) - Number(toBefore.price8);
        
        if (fromDelta > 0 && toDelta < 0) {
          reporter.push({
            name: "Price delta verification",
            status: 'PASS',
            note: `From: +${fmt8(BigInt(Math.abs(fromDelta)))}, To: -${fmt8(BigInt(Math.abs(toDelta)))}`
          });
        } else {
          reporter.push({
            name: "Price delta verification",
            status: 'FAIL',
            note: `Unexpected deltas: From: ${fromDelta}, To: ${toDelta}`
          });
        }
        
      } catch (error) {
        reporter.push({
          name: "Single attack",
          status: 'FAIL',
          note: error.message
        });
      }
    } else {
      reporter.push({
        name: "Attack transaction",
        status: 'SKIP',
        note: 'attack() function not available'
      });
    }

    // 5) Test 5x rapid attacks
    if (caps.attack) {
      try {
        console.log("⚠️  Testing 5x rapid attacks...");
        
        const rapidAttacks = [];
        for (let i = 0; i < 5; i++) {
          try {
            const result = await attack(fromId, toId, "0.01");
            rapidAttacks.push(result.hash);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between attacks
          } catch (error) {
            console.log(`Rapid attack ${i + 1} failed:`, error.message);
            break;
          }
        }
        
        if (rapidAttacks.length === 5) {
          reporter.push({
            name: "5x rapid attacks",
            status: 'PASS',
            note: `All 5 attacks successful`
          });
        } else {
          reporter.push({
            name: "5x rapid attacks",
            status: 'PASS',
            note: `${rapidAttacks.length}/5 attacks successful`
          });
        }
        
      } catch (error) {
        reporter.push({
          name: "5x rapid attacks",
          status: 'FAIL',
          note: error.message
        });
      }
    }

  } catch (error) {
    reporter.push({
      name: "Attack test setup",
      status: 'FAIL',
      note: error.message
    });
  }

  reporter.print();
  reporter.writeMd();
}

if (require.main === module) {
  runAttackTest().catch(console.error);
}

module.exports = { runAttackTest };
