require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: '.env.local' });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { 
      optimizer: { 
        enabled: true, 
        runs: 200 
      },
      viaIR: true
    }
  },
  networks: {
    baseSepolia: {
      url: process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "",
      chainId: 84532,
      accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
    },
  },
  etherscan: {
    apiKey: process.env.BASESCAN_API_KEY || "",
  }
};
