const { publicClient } = require('./client');
const { CORE } = require('./env');

async function readCountry(id) {
  const [name, , price8, totalSupply, attacks, exists] = await publicClient.readContract({
    address: CORE,
    abi: [
      { name: 'getCountryInfo', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'id', type: 'uint256' }],
        outputs: [
          { type: 'string' }, { type: 'address' }, { type: 'uint256' },
          { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }
        ]
      }
    ],
    functionName: 'getCountryInfo',
    args: [BigInt(id)],
  });
  return { id, name, price8, totalSupply, attacks, exists };
}

module.exports = { readCountry };