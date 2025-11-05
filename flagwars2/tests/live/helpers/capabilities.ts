const { PublicClient } = require("viem");

type CoreCaps = {
  hasPaused: boolean;
  hasGetConfig: boolean;
  hasGetCurrentTier: boolean;
};

async function detectCoreCaps(pub: PublicClient, core: `0x${string}`, abi: any): Promise<CoreCaps> {
  // ABI içinde method imzaları var mı? (compile-time)
  const names = new Set<string>((abi || []).map((f: any) => f?.name).filter(Boolean));

  const hasPausedSig = names.has("paused");
  const hasGetConfigSig = names.has("getConfig");
  const hasGetCurrentTierSig = names.has("getCurrentTier");

  console.log(`🔍 Detecting capabilities for ${core}...`);
  console.log(`   ABI functions: ${Array.from(names).join(", ")}`);

  // Bazı zincirlerde ABI'da var ama runtime'da revert olabilir.
  // Bu nedenle 1 defa "dry-call" ile doğrula:
  async function safeCall(name: string, args: any[] = []): Promise<boolean> {
    try {
      await pub.readContract({ address: core, abi, functionName: name as any, args });
      return true;
    } catch (e: any) {
      console.log(`   ❌ ${name}(${args.join(", ")}) failed: ${e?.shortMessage || e?.message}`);
      return false;
    }
  }

  console.log("   🧪 Testing function availability...");

  const hasPaused = hasPausedSig ? await safeCall("paused") : false;
  const hasGetConfig = hasGetConfigSig ? await safeCall("getConfig") : false;
  // getCurrentTier(countryId) → test vektöründen bir id dene (90 gibi)
  const hasGetCurrentTier = hasGetCurrentTierSig ? await safeCall("getCurrentTier", [90n]) : false;

  const caps = { hasPaused, hasGetConfig, hasGetCurrentTier };
  
  console.log("   ✅ Capabilities detected:", caps);
  
  return caps;
}

module.exports = { detectCoreCaps };
