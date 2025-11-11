import fs from 'fs';
import path from 'path';

export interface FlagWarsSpec {
  metadata: {
    name: string;
    version: string;
    stage: string;
    network: string;
    chainId: number;
    effectiveAtBlock: number;
    specHash: string;
  };
  addresses: {
    core: string;
    achievements: string;
    paymentToken: string;
    treasury: string;
    revenue: string;
    commissions: string;
  };
  tokens: {
    payment: {
      symbol: string;
      decimals: number;
      unit: string;
    };
    countryToken: {
      symbol: string;
      decimals: number;
      unit: string;
    };
  };
  pricing: {
    model: string;
    params: {
      kappa: string;
      lambda: string;
      priceMin: string;
      pricePrecision: string;
    };
    units: {
      kappa: string;
      lambda: string;
      priceMin: string;
      pricePrecision: string;
    };
  };
  fees: {
    buyFeeBps: number;
    sellFeeBps: number;
    referralShareBps: number;
    revenueShareBps: number;
    units: {
      buyFeeBps: string;
      sellFeeBps: string;
      referralShareBps: string;
      revenueShareBps: string;
    };
  };
  attack: {
    freeAttackLimit: number;
    feeTiers: Array<{
      threshold: number;
      thresholdUnit: string;
      fee: string;
      feeUnit: string;
      delta: string;
      deltaUnit: string;
    }>;
    spamLimits: {
      perTargetPerMin: number;
      totalPerMin: number;
      units: {
        perTargetPerMin: string;
        totalPerMin: string;
      };
    };
  };
  warBalance: {
    wb1: {
      threshold: number;
      thresholdUnit: string;
      windowSec: number;
      multiplierBps: number;
    };
    wb2: {
      threshold: number;
      thresholdUnit: string;
      windowSec: number;
      multiplierBps: number;
    };
    units: {
      windowSec: string;
      multiplierBps: string;
    };
  };
  antiDump: {
    tiers: Array<{
      thresholdPctBps: number;
      extraFeeBps: number;
      cooldownSec: number;
    }>;
    units: {
      thresholdPctBps: string;
      extraFeeBps: string;
      cooldownSec: string;
    };
  };
  achievements: {
    mintFee: string;
    mintFeeUnit: string;
    sbtTransferable: boolean;
  };
  dustProtection: {
    minBuyUsdc: string;
    minSellUsdc: string;
    units: {
      minBuyUsdc: string;
      minSellUsdc: string;
    };
  };
  featureFlags: {
    requireUsdcApproval: boolean;
    sseAuthRequired: boolean;
    maintenanceMode: boolean;
  };
  security: {
    jwtExpSeconds: number;
    siweDomains: string[];
    allowedOrigins: string[];
    rateLimit: {
      windowSec: number;
      maxReq: number;
    };
  };
  testVectors: {
    buy: {
      countryId: number;
      amountToken: string;
    };
    sell: {
      countryId: number;
      amountToken: string;
    };
    attack: {
      fromId: number;
      toId: number;
      amountToken: string;
    };
  };
}

export function loadSpec(): FlagWarsSpec {
  const specPath = path.resolve(process.cwd(), 'spec/flagwars.spec.json');
  
  if (!fs.existsSync(specPath)) {
    throw new Error('spec/flagwars.spec.json not found');
  }
  
  const specContent = fs.readFileSync(specPath, 'utf8');
  const spec = JSON.parse(specContent) as FlagWarsSpec;
  
  console.log(`✅ Loaded spec: ${spec.metadata.name} v${spec.metadata.version}`);
  console.log(`📋 Network: ${spec.metadata.network} (chainId: ${spec.metadata.chainId})`);
  
  return spec;
}

export function validateSpec(spec: FlagWarsSpec): boolean {
  console.log('🔍 Validating spec...');
  
  // Validate required fields
  if (!spec.addresses.core || !spec.addresses.paymentToken) {
    throw new Error('Missing required addresses in spec');
  }
  
  // Validate token decimals
  if (spec.tokens.payment.decimals !== 6) {
    throw new Error(`Invalid payment token decimals: ${spec.tokens.payment.decimals}, expected 6`);
  }
  
  if (spec.tokens.countryToken.decimals !== 18) {
    throw new Error(`Invalid country token decimals: ${spec.tokens.countryToken.decimals}, expected 18`);
  }
  
  // Validate pricing model
  if (spec.pricing.model !== 'STATIC_HALF_STEP') {
    throw new Error(`Invalid pricing model: ${spec.pricing.model}, expected STATIC_HALF_STEP`);
  }
  
  // Validate fee ranges
  if (spec.fees.buyFeeBps < 0 || spec.fees.buyFeeBps > 10000) {
    throw new Error(`Invalid buyFeeBps: ${spec.fees.buyFeeBps}, must be 0-10000`);
  }
  
  if (spec.fees.sellFeeBps < 0 || spec.fees.sellFeeBps > 10000) {
    throw new Error(`Invalid sellFeeBps: ${spec.fees.sellFeeBps}, must be 0-10000`);
  }
  
  console.log('✅ Spec validation passed');
  return true;
}