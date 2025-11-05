### Capabilities
- paused(): NO/REVERT
- getConfig(): NO/REVERT
- getCurrentTier(): NO/REVERT
- getCountryInfo(): YES

### Baseline
- From(90) Turkey price8=5.00000000 totalSupply=50000000000000000000000
- To(44) United Kingdom price8=5.00000000 totalSupply=50000000000000000000000
- Floor guard check (>=0.01 USDC): OK

### Attack Failed with msg.value=0
- phase: simulate
- error: The contract function "attack" reverted.

Contract Call:
  address:   0x781dd56430774e630dE83f98c29e7FB3cC61f36b
  function:  attack(uint256 fromCountryId, uint256 toCountryId, uint256 amount)
  args:            (90, 44, 100000000000000000)
  sender:    0x1c749BF6F2ccC3121b4413Aa49a9C7FaEa374d82

Docs: https://viem.sh/docs/contract/simulateContract
Version: viem@2.38.3

### Attack Failed with msg.value≈tierFee as ETH (0.30)
- phase: simulate
- error: The contract function "attack" reverted.

Contract Call:
  address:   0x781dd56430774e630dE83f98c29e7FB3cC61f36b
  function:  attack(uint256 fromCountryId, uint256 toCountryId, uint256 amount)
  args:            (90, 44, 100000000000000000)
  sender:    0x1c749BF6F2ccC3121b4413Aa49a9C7FaEa374d82

Docs: https://viem.sh/docs/contract/simulateContract
Version: viem@2.38.3

### Attack Failed with msg.value=1e14 wei (~0.0001 ETH)
- phase: simulate
- error: The contract function "attack" reverted.

Contract Call:
  address:   0x781dd56430774e630dE83f98c29e7FB3cC61f36b
  function:  attack(uint256 fromCountryId, uint256 toCountryId, uint256 amount)
  args:            (90, 44, 100000000000000000)
  sender:    0x1c749BF6F2ccC3121b4413Aa49a9C7FaEa374d82

Docs: https://viem.sh/docs/contract/simulateContract
Version: viem@2.38.3

### Summary
❌ All attack attempts failed. Possible causes:
1. Contract is paused
2. Access control restrictions
3. Incorrect fee/amount parameters
4. Contract validation failures
5. ABI mismatch