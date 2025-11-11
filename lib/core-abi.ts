// Client-safe Core contract ABI
// Bu dosya client bundle'a dahil edilebilir (node:crypto veya redis yok)

import { parseAbi } from 'viem'

export const CORE_ABI = parseAbi([
  // New simplified buy/sell
  'function buy(uint256 id, uint256 amount18, uint256 maxInUSDC6, uint256 deadline)',
  'function sell(uint256 id, uint256 amount18, uint256 minOutUSDC6, uint256 deadline)',
  'function sellWithPermit(uint256 id, uint256 amount18, uint256 minOutUSDC6, uint256 tradeDeadline, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s)',
  'function quoteBuy(uint256 id, uint256 amount18) view returns (uint256 grossUSDC6, uint256 feeUSDC6, uint256 netUSDC6)',
  'function quoteSell(uint256 id, uint256 amount18) view returns (uint256 grossUSDC6, uint256 feeUSDC6, uint256 netUSDC6)',
  // Country info - MUST match Core.sol Country struct order!
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)',
  'function remainingSupply(uint256 id) view returns (uint256)',
  // ERC20 balance (directly from token)
  'function addCountry(uint256 id, string name, address token, uint256 price8Start, uint32 kappa8, uint32 lambda8, uint256 priceMin8)',
  // Pause
  'function paused() view returns (bool)',
  'function pause()',
  'function unpause()',
  'function owner() view returns (address)',
  'function setAuthorized(address who, bool v)',
  'function pullUSDCFrom(address from, uint256 amount, address to)',
  // Fees
  'function setFees(uint16 buyFee, uint16 sellFee)',
  'function buyFeeBps() view returns (uint16)',
  'function sellFeeBps() view returns (uint16)',
  // Immutables
  'function USDC() view returns (address)',
  'function TREASURY() view returns (address)',
  // Events
  'event CountryAdded(uint256 indexed id, string name, address token)',
  'event Bought(uint256 indexed id, address user, uint256 amount, uint256 usdcPaid, uint256 fee)',
  'event Sold(uint256 indexed id, address user, uint256 amount, uint256 usdcReceived, uint256 fee)',
  // Attack functions
  'function attack(uint256 fromId, uint256 toId, uint256 amountToken18)',
  'struct AttackItem { uint256 fromId; uint256 toId; uint256 amountToken18; }',
  'function attackBatch(AttackItem[] items)',
  'function previewAttackFee(address user, uint256 attackerPrice8) view returns (uint256 baseFeeUSDC6, uint256 appliedTier, uint256 appliedMulBps, uint256 finalFeeUSDC6, bool isFreeAttackAvailable)',
  'function getWarBalanceState(address user) view returns (uint256 wb1Count, uint256 wb1Threshold, uint256 wb1Window, uint256 wb1Multiplier, uint256 wb1MulBps, uint256 wb2Count, uint256 wb2Threshold, uint256 wb2Window, uint256 wb2Multiplier, uint256 wb2MulBps, uint256 currentMultiplier)',
  // Events
  'event Attack(uint256 indexed fromId, uint256 indexed toId, address indexed user, uint256 amount, uint256 fee)'
])

