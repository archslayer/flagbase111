const { createPublicClient, http } = require("viem");
const { baseSepolia } = require("viem/chains");

async function detectCaps(address: `0x${string}`, abi: any, rpc: string) {
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  
  const can = async (fn: string, args: any[] = []) => {
    try {
      await client.readContract({ address, abi, functionName: fn as any, args });
      return true;
    } catch { 
      return false; 
    }
  };
  
  return {
    has_getCountryInfo: await can("getCountryInfo", [1n]),
    has_getConfig: await can("getConfig"),
    has_getCurrentTier: await can("getCurrentTier", [1n]),
    has_paused: await can("paused"),
  };
}

module.exports = { detectCaps };
