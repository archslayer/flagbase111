const { createPublicClient, http, walletActions, createWalletClient } = require("viem");
const { baseSepolia } = require("viem/chains");

function makePublic() {
  const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
  return createPublicClient({ chain: baseSepolia, transport: http(rpc) });
}

function makeWallet() {
  const pk = process.env.DEPLOYER_PK;
  if (!pk) return null;
  return createWalletClient({
    chain: baseSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org"),
    account: (pk as `0x${string}`)
  }).extend(walletActions);
}

module.exports = { makePublic, makeWallet };
