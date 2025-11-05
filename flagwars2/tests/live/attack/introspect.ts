require('dotenv').config({ path: '.env.local' });
const { createPublicClient, createWalletClient, http, keccak256, toBytes, encodeFunctionData, decodeFunctionResult } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { baseSepolia } = require("viem/chains");
const { CORE_ABI } = require("../helpers/contracts");
const { loadSpec } = require("../helpers/spec");

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;
const PK = (process.env.E2E_PRIVATE_KEY || "").trim();

function sel(sig: string) { return ("0x" + keccak256(toBytes(sig)).slice(2, 10)) as `0x${string}`; }

async function rawCall(client: any, data: `0x${string}`) {
  try { return await client.call({ to: CORE, data }); } catch (e) { return { error: e }; }
}

async function main() {
  if (!CORE || !PK) throw new Error("env missing");
  
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const account = privateKeyToAccount(PK);
  const wal = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

  console.log("🔍 Contract Introspection Analysis...");
  console.log(`📍 Contract: ${CORE}`);
  console.log(`👤 Account: ${account.address}`);

  // 1) ABI fonksiyonları listesi
  const fns = (CORE_ABI as any[]).filter(x => x.type === "function").map(x => ({
    name: x.name, 
    stateMutability: x.stateMutability, 
    inputs: x.inputs?.length || 0
  }));
  console.log("\n📋 ABI functions:", fns);

  // 2) paused() / pause() / unpause() selector denemeleri (ham call)
  const pausedSel = sel("paused()");     // 0x5c975abb
  const pauseSel = sel("pause()");       // 0x8456cb59
  const unpauseSel = sel("unpause()");   // 0x3f4ba83a
  console.log("\n🔍 Selectors:", { pausedSel, pauseSel, unpauseSel });

  const pausedCall = await rawCall(pub, pausedSel);
  console.log("📊 paused() rawCall:", pausedCall);

  // 3) attack signature gerçekten (uint256,uint256,uint256) mi?
  const attackAbi = (CORE_ABI as any[]).find((x) => x.type === "function" && x.name === "attack");
  console.log("\n⚔️ attack function:", attackAbi || "NOT IN ABI");

  // 4) attack payable mı?
  if (attackAbi) {
    console.log("💰 attack.stateMutability:", attackAbi.stateMutability);
  }

  // 5) getConfig/getCurrentTier var mı?
  const hasGetConfig = (CORE_ABI as any[]).some((x) => x.type === "function" && x.name === "getConfig");
  const hasGetTier = (CORE_ABI as any[]).some((x) => x.type === "function" && x.name === "getCurrentTier");
  console.log("\n🔧 Configuration functions:", { hasGetConfig, hasGetTier });

  // 6) fee mode tahmini:
  const feeMode = attackAbi?.stateMutability === "payable" ? "ETH_MSG_VALUE" : "USDC_ALLOWANCE";
  console.log("💸 feeMode_guess:", feeMode);

  // 7) owner() var mı? (Ownable varsayımı)
  const ownerAbi = (CORE_ABI as any[]).find(x => x.type === "function" && x.name === "owner" && x.inputs?.length === 0);
  if (ownerAbi) {
    try {
      const owner = await pub.readContract({ address: CORE, abi: CORE_ABI, functionName: "owner" });
      console.log("👑 owner:", owner);
      console.log("🔍 Is test account owner?", owner.toLowerCase() === account.address.toLowerCase());
    } catch { 
      console.log("❌ owner(): present in ABI but revert"); 
    }
  } else {
    console.log("❌ owner(): NOT IN ABI");
  }

  // 8) Pausable interface kontrolü
  const pausableFunctions = ["pause", "unpause", "paused"];
  const pausablePresent = pausableFunctions.filter(fn => 
    (CORE_ABI as any[]).some(x => x.type === "function" && x.name === fn)
  );
  console.log("\n⏸️ Pausable functions present:", pausablePresent);

  // 9) Access control functions
  const accessControlFunctions = ["renounceOwnership", "transferOwnership", "setOwner"];
  const accessPresent = accessControlFunctions.filter(fn => 
    (CORE_ABI as any[]).some(x => x.type === "function" && x.name === fn)
  );
  console.log("🔐 Access control functions present:", accessPresent);

  // 10) Whitelist/allowlist functions
  const whitelistFunctions = ["whitelistAttacker", "setAttacker", "allowAttacker", "setWhitelist", "setWhitelisted", "setAllowedAttacker"];
  const whitelistPresent = whitelistFunctions.filter(fn => 
    (CORE_ABI as any[]).some(x => x.type === "function" && x.name === fn)
  );
  console.log("📝 Whitelist functions present:", whitelistPresent);

  console.log("\n🎯 Summary:");
  console.log(`- Attack function: ${attackAbi ? "✅ Present" : "❌ Missing"}`);
  console.log(`- Attack payable: ${attackAbi?.stateMutability === "payable" ? "✅ Yes (ETH fee)" : "❌ No (USDC fee)"}`);
  console.log(`- Owner check: ${ownerAbi ? "✅ Present" : "❌ Missing"}`);
  console.log(`- Pausable: ${pausablePresent.length > 0 ? "✅ Present" : "❌ Missing"}`);
  console.log(`- Whitelist: ${whitelistPresent.length > 0 ? "✅ Present" : "❌ Missing"}`);
}

main().catch(e => { 
  console.error(e); 
  process.exit(1); 
});
