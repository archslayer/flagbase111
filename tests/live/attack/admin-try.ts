require('dotenv').config({ path: '.env.local' });
const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { baseSepolia } = require("viem/chains");
const { CORE_ABI } = require("../helpers/contracts");

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;
const PK = (process.env.E2E_PRIVATE_KEY || "").trim();

async function main() {
  if (!CORE || !PK) throw new Error("env missing");
  
  const account = privateKeyToAccount(PK);
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const wal = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

  console.log("🔧 Admin Operations Test...");
  console.log(`📍 Contract: ${CORE}`);
  console.log(`👤 Account: ${account.address}`);

  // 1) owner check (varsa)
  const hasOwner = (CORE_ABI as any[]).some((x) => x.type === "function" && x.name === "owner");
  if (hasOwner) {
    try {
      const owner = await pub.readContract({ address: CORE, abi: CORE_ABI, functionName: "owner" });
      console.log("👑 Contract owner:", owner);
      console.log("🔍 Is test account owner?", owner.toLowerCase() === account.address.toLowerCase());
      
      if (owner.toLowerCase() !== account.address.toLowerCase()) {
        console.log("❌ Not owner; admin ops skipped.");
        return;
      }
      console.log("✅ Test account is owner; proceeding with admin ops...");
    } catch {
      console.log("❌ owner() revert; admin ops skipped.");
      return;
    }
  } else {
    console.log("❌ No owner() in ABI; admin ops skipped.");
    return;
  }

  // 2) unpause() dene (varsa)
  const hasUnpause = (CORE_ABI as any[]).some((x) => x.type === "function" && x.name === "unpause");
  if (hasUnpause) {
    try {
      console.log("\n🔄 Attempting to unpause contract...");
      const hash = await wal.writeContract({ 
        address: CORE, 
        abi: CORE_ABI, 
        functionName: "unpause", 
        args: [] 
      });
      const rcpt = await pub.waitForTransactionReceipt({ hash });
      console.log("✅ unpause tx:", hash, rcpt.status);
      
      if (rcpt.status === "success") {
        console.log("🎉 Contract unpaused successfully!");
      }
    } catch (e) { 
      console.log("❌ unpause revert:", (e as Error).message); 
    }
  } else {
    console.log("❌ unpause(): not in ABI");
  }

  // 3) pause() dene (varsa) - test için
  const hasPause = (CORE_ABI as any[]).some((x) => x.type === "function" && x.name === "pause");
  if (hasPause) {
    try {
      console.log("\n⏸️ Attempting to pause contract...");
      const hash = await wal.writeContract({ 
        address: CORE, 
        abi: CORE_ABI, 
        functionName: "pause", 
        args: [] 
      });
      const rcpt = await pub.waitForTransactionReceipt({ hash });
      console.log("✅ pause tx:", hash, rcpt.status);
      
      if (rcpt.status === "success") {
        console.log("⏸️ Contract paused successfully!");
      }
    } catch (e) { 
      console.log("❌ pause revert:", (e as Error).message); 
    }
  } else {
    console.log("❌ pause(): not in ABI");
  }

  // 4) olası whitelist fonksiyonları
  const maybes = ["whitelistAttacker", "setAttacker", "allowAttacker", "setWhitelist", "setWhitelisted", "setAllowedAttacker"];
  console.log("\n📝 Testing whitelist functions...");
  
  for (const fn of maybes) {
    const present = (CORE_ABI as any[]).some((x) => x.type === "function" && x.name === fn);
    if (!present) continue;
    
    try {
      console.log(`🔧 Attempting ${fn}(${account.address}, true)...`);
      const hash = await wal.writeContract({ 
        address: CORE, 
        abi: CORE_ABI, 
        functionName: fn as any, 
        args: [account.address, true] 
      });
      const rcpt = await pub.waitForTransactionReceipt({ hash });
      console.log(`✅ ${fn} -> tx: ${hash}, status: ${rcpt.status}`);
    } catch (e) { 
      console.log(`❌ ${fn} revert:`, (e as Error).message); 
    }
  }

  // 5) Diğer admin fonksiyonları
  const adminFunctions = ["setFee", "setConfig", "setPaused", "setAllowed", "setActive"];
  console.log("\n⚙️ Testing other admin functions...");
  
  for (const fn of adminFunctions) {
    const present = (CORE_ABI as any[]).some((x) => x.type === "function" && x.name === fn);
    if (!present) continue;
    
    try {
      console.log(`🔧 Attempting ${fn}...`);
      // Bu fonksiyonlar parametre gerektirebilir, basit test için
      const hash = await wal.writeContract({ 
        address: CORE, 
        abi: CORE_ABI, 
        functionName: fn as any, 
        args: [] 
      });
      const rcpt = await pub.waitForTransactionReceipt({ hash });
      console.log(`✅ ${fn} -> tx: ${hash}, status: ${rcpt.status}`);
    } catch (e) { 
      console.log(`❌ ${fn} revert:`, (e as Error).message); 
    }
  }

  console.log("\n🎯 Admin operations completed!");
}

main().catch(e => { 
  console.error(e); 
  process.exit(1); 
});
