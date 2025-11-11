require('dotenv').config({ path: '.env.local' });
const { createPublicClient, http } = require("viem");
const { baseSepolia } = require("viem/chains");
const { CORE_ABI } = require("../helpers/contracts");

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;

async function main() {
  if (!CORE) {
    console.error("NEXT_PUBLIC_CORE_ADDRESS missing");
    process.exit(1);
  }

  const client = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const latest = await client.getBlockNumber();
  const from = latest - 1000n > 0n ? latest - 1000n : 0n; // son ~1k blok (RPC limit)

  console.log(`🔍 Scanning events from block ${from} to ${latest}...`);

  const logs = await client.getLogs({
    address: CORE,
    fromBlock: from,
    toBlock: "latest",
  });

  console.log(`📊 Found ${logs.length} total logs`);

  // Eventleri ABI ile decode etmeyi dene:
  const decoded = [];
  for (const log of logs) {
    try {
      const evt = client.decodeEventLog({ 
        abi: CORE_ABI, 
        data: log.data, 
        topics: log.topics 
      });
      decoded.push({ 
        blockNumber: log.blockNumber, 
        eventName: evt.eventName, 
        args: evt.args 
      });
    } catch { 
      // topic eşleşmeyenleri atla
    }
  }

  console.log(`\n🎯 Decoded ${decoded.length} events (last ~30k blocks):`);
  
  // Event türlerine göre grupla
  const eventTypes = {};
  for (const d of decoded) {
    if (!eventTypes[d.eventName]) {
      eventTypes[d.eventName] = [];
    }
    eventTypes[d.eventName].push(d);
  }

  // Her event türü için son 5 örneği göster
  for (const [eventName, events] of Object.entries(eventTypes)) {
    console.log(`\n📋 ${eventName} (${events.length} total):`);
    const recent = (events as any[]).slice(-5);
    for (const event of recent) {
      console.log(`  Block ${event.blockNumber}: ${JSON.stringify(event.args)}`);
    }
  }

  // Özel kontroller
  console.log(`\n🔍 Special Checks:`);
  
  // Paused/Unpaused eventleri var mı?
  const pausedEvents = decoded.filter(d => d.eventName === 'Paused');
  const unpausedEvents = decoded.filter(d => d.eventName === 'Unpaused');
  
  if (pausedEvents.length > 0) {
    console.log(`⚠️ Found ${pausedEvents.length} Paused events - contract may be paused`);
    console.log(`   Latest pause: Block ${pausedEvents[pausedEvents.length - 1].blockNumber}`);
  } else {
    console.log(`✅ No Paused events found`);
  }
  
  if (unpausedEvents.length > 0) {
    console.log(`✅ Found ${unpausedEvents.length} Unpaused events`);
    console.log(`   Latest unpause: Block ${unpausedEvents[unpausedEvents.length - 1].blockNumber}`);
  }

  // Attack eventleri var mı?
  const attackEvents = decoded.filter(d => 
    d.eventName && d.eventName.toLowerCase().includes('attack')
  );
  
  if (attackEvents.length > 0) {
    console.log(`⚔️ Found ${attackEvents.length} attack-related events`);
    console.log(`   Latest attack: Block ${attackEvents[attackEvents.length - 1].blockNumber}`);
  } else {
    console.log(`❌ No attack events found - may indicate attacks are not working`);
  }
}

main().catch((e) => { 
  console.error(e); 
  process.exit(1); 
});
