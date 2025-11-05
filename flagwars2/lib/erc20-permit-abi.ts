import { parseAbi } from 'viem'

export const ERC20_PERMIT_ABI = parseAbi([
  'function name() view returns (string)',
  'function nonces(address) view returns (uint256)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
])
