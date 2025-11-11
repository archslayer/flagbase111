const { publicClient } = require('./client');
const { CORE } = require('./env');

async function detectCapabilities() {
  let paused = null;
  let hasGetConfig = false;
  
  try {
    const p = await publicClient.readContract({
      address: CORE,
      abi: [
        { name: 'paused', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] }
      ],
      functionName: 'paused',
      args: [],
    });
    paused = Boolean(p);
  } catch {
    paused = null;
  }

  try {
    await publicClient.readContract({
      address: CORE,
      abi: [
        { name: 'getConfig', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' },{ type: 'uint256' },{ type: 'uint256' }] }
      ],
      functionName: 'getConfig',
      args: [],
    });
    hasGetConfig = true;
  } catch {
    hasGetConfig = false;
  }

  return { paused, hasGetConfig };
}

module.exports = { detectCapabilities };