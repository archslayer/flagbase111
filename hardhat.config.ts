require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: ".env.local" });

const HARDHAT_RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const HARDHAT_PK = process.env.DEPLOYER_PK || "0x";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true }
  },
  networks: {
    baseSepolia: { url: HARDHAT_RPC, accounts: HARDHAT_PK !== "0x" ? [HARDHAT_PK] : [] }
  },
  etherscan: {
    apiKey: {
      basesepolia: process.env.BASESCAN_API_KEY || ""
    },
    customChains: [
      { 
        network: "basesepolia", 
        chainId: 84532, 
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        } 
      }
    ]
  }
};
