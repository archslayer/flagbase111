const { parseUnits, formatUnits } = require("viem");

const toTOKEN18 = (x: string) => parseUnits(x, 18);
const toETH18 = (x: string) => parseUnits(x, 18);
const fmtUSDC6 = (n: bigint) => formatUnits(n, 6);
const fmtP8 = (n: bigint) => (Number(n) / 1e8).toFixed(8);

module.exports = {
  toTOKEN18,
  toETH18,
  fmtUSDC6,
  fmtP8
};
