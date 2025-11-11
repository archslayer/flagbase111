const fs = require("fs");

type Spec = {
  pricing: { 
    params: { 
      priceMin: string 
    } 
  },
  warBalance: { 
    wb1: { 
      threshold: number, 
      windowSec: number, 
      multiplierBps: number 
    }, 
    wb2: { 
      threshold: number, 
      windowSec: number, 
      multiplierBps: number 
    } 
  },
  antiDump: { 
    tiers: Array<{ 
      thresholdPctBps: number, 
      extraFeeBps: number, 
      cooldownSec: number 
    }> 
  },
  testVectors: { 
    attack: { 
      fromId: number, 
      toId: number, 
      amountToken: string 
    } 
  }
};

function loadSpec(): Spec {
  try {
    const raw = fs.readFileSync("spec/flagwars.spec.json", "utf8");
    return JSON.parse(raw);
  } catch (error) {
    // Fallback spec if file doesn't exist
    return {
      pricing: { params: { priceMin: "0.01" } },
      warBalance: {
        wb1: { threshold: 1000, windowSec: 3600, multiplierBps: 150 },
        wb2: { threshold: 5000, windowSec: 7200, multiplierBps: 200 }
      },
      antiDump: {
        tiers: [
          { thresholdPctBps: 1000, extraFeeBps: 50, cooldownSec: 300 },
          { thresholdPctBps: 2000, extraFeeBps: 100, cooldownSec: 600 }
        ]
      },
      testVectors: {
        attack: { fromId: 90, toId: 44, amountToken: "0.1" }
      }
    };
  }
}

module.exports = { loadSpec };
