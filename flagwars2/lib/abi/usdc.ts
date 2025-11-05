export const usdcAbi = [
  { "type":"function","name":"balanceOf","inputs":[{"name":"owner","type":"address"}],"outputs":[{"type":"uint256"}],"stateMutability":"view" },
  { "type":"function","name":"allowance","inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"outputs":[{"type":"uint256"}],"stateMutability":"view" },
  { "type":"function","name":"approve","inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"type":"bool"}],"stateMutability":"nonpayable" }
] as const;
