const { formatUnits, parseUnits } = require("viem");

const USDC_DEC = 6;
const TOKEN_DEC = 18;

function toUSDC6(n: string) { 
  return parseUnits(n, USDC_DEC); 
}

function toTOKEN18(n: string) { 
  return parseUnits(n, TOKEN_DEC); 
}

function fmtUSDC(x: bigint) { 
  return Number(formatUnits(x, USDC_DEC)); 
}

function fmtTOKEN(x: bigint) { 
  return Number(formatUnits(x, TOKEN_DEC)); 
}

module.exports = { USDC_DEC, TOKEN_DEC, toUSDC6, toTOKEN18, fmtUSDC, fmtTOKEN };
