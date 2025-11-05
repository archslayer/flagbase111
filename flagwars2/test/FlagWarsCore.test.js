const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FlagWarsCore", function () {
  let core, usdc, token, treasury, revenue, commissions;
  let owner, user1, user2;
  let countryId = 90; // Turkey

  beforeEach(async function () {
    [owner, user1, user2, treasury, revenue, commissions] = await ethers.getSigners();

    // Deploy mock USDC (6 decimals)
    const USDC = await ethers.getContractFactory("MockUSDC");
    usdc = await USDC.deploy();
    await usdc.waitForDeployment();

    // Deploy mock token (18 decimals)
    const Token = await ethers.getContractFactory("MockToken");
    token = await Token.deploy("Turkey Flag", "TR");
    await token.waitForDeployment();

    // Deploy core contract
    const Core = await ethers.getContractFactory("FlagWarsCore");
    core = await Core.deploy(
      usdc.target,
      treasury.address,
      revenue.address,
      commissions.address
    );
    await core.waitForDeployment();

    // Create country and seed it
    await core.createCountry(countryId, "Turkey", token.target);
    await core.seedCountryPrice(countryId, 5e6); // 5.00 USDC
    await core.seedCountrySupply(countryId, ethers.parseEther("50000"));

    // Mint tokens to treasury
    await token.mint(treasury.address, ethers.parseEther("50000"));

    // Mint USDC to users
    await usdc.mint(user1.address, ethers.parseUnits("1000", 6));
    await usdc.mint(user2.address, ethers.parseUnits("1000", 6));
    await usdc.mint(treasury.address, ethers.parseUnits("10000", 6));
  });

  describe("Deployment", function () {
    it("Should set correct initial values", async function () {
      expect(await core.KAPPA()).to.equal(55_000);
      expect(await core.LAMBDA()).to.equal(55_550);
      expect(await core.PRICE_MIN()).to.equal(1_000_000);
      expect(await core.SELL_FEE_BPS()).to.equal(500);
    });

    it("Should create country correctly", async function () {
      const countryInfo = await core.getCountryInfo(countryId);
      expect(countryInfo.name).to.equal("Turkey");
      expect(countryInfo.token).to.equal(token.target);
      expect(countryInfo.exists).to.be.true;
    });
  });

  describe("Buy Function", function () {
    beforeEach(async function () {
      // Approve USDC spending
      await usdc.connect(user1).approve(core.target, ethers.parseUnits("100", 6));
    });

    it("Should buy tokens correctly", async function () {
      const amount = ethers.parseEther("1");
      const price = await core.getBuyPrice(countryId, amount);
      
      const tx = await core.connect(user1).buy(countryId, amount, 0, Math.floor(Date.now() / 1000) + 3600);
      
      // Check events
      await expect(tx)
        .to.emit(core, "Buy")
        .withArgs(countryId, user1.address, amount, price, price);
      
      // Check user token balance
      expect(await token.balanceOf(user1.address)).to.equal(amount);
      
      // Check treasury USDC balance increased
      expect(await usdc.balanceOf(treasury.address)).to.be.gt(0);
    });

    it("Should enforce minimum buy amount", async function () {
      const amount = ethers.parseEther("0.001"); // Very small amount
      
      await expect(
        core.connect(user1).buy(countryId, amount, 0, Math.floor(Date.now() / 1000) + 3600)
      ).to.be.revertedWithCustomError(core, "MinBuyNotMet");
    });

    it("Should enforce slippage protection", async function () {
      const amount = ethers.parseEther("1");
      const minOut = ethers.parseUnits("100", 6); // Very high minimum
      
      await expect(
        core.connect(user1).buy(countryId, amount, minOut, Math.floor(Date.now() / 1000) + 3600)
      ).to.be.revertedWithCustomError(core, "SlippageExceeded");
    });
  });

  describe("Sell Function", function () {
    beforeEach(async function () {
      // First buy some tokens
      await usdc.connect(user1).approve(core.target, ethers.parseUnits("100", 6));
      await core.connect(user1).buy(countryId, ethers.parseEther("1"), 0, Math.floor(Date.now() / 1000) + 3600);
      
      // Approve token spending for sell
      await token.connect(user1).approve(core.target, ethers.parseEther("1"));
    });

    it("Should sell tokens correctly", async function () {
      const amount = ethers.parseEther("0.5");
      const price = await core.getSellPrice(countryId, amount);
      
      const tx = await core.connect(user1).sell(countryId, amount, 0, Math.floor(Date.now() / 1000) + 3600);
      
      // Check events
      await expect(tx)
        .to.emit(core, "Sell")
        .withArgs(countryId, user1.address, amount, price, price);
      
      // Check user token balance decreased
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("0.5"));
      
      // Check user USDC balance increased
      expect(await usdc.balanceOf(user1.address)).to.be.gt(0);
    });

    it("Should enforce floor price", async function () {
      const amount = ethers.parseEther("1000"); // Very large amount
      
      await expect(
        core.connect(user1).sell(countryId, amount, 0, Math.floor(Date.now() / 1000) + 3600)
      ).to.be.revertedWithCustomError(core, "FloorPriceViolation");
    });

    it("Should check treasury USDC sufficiency", async function () {
      // Drain treasury USDC
      await usdc.connect(treasury).transfer(user2.address, await usdc.balanceOf(treasury.address));
      
      const amount = ethers.parseEther("0.1");
      
      await expect(
        core.connect(user1).sell(countryId, amount, 0, Math.floor(Date.now() / 1000) + 3600)
      ).to.be.revertedWithCustomError(core, "InsufficientTreasuryUSDC");
    });
  });

  describe("Attack Function", function () {
    let fromId = 44; // GB

    beforeEach(async function () {
      // Create second country
      await core.createCountry(fromId, "United Kingdom", token.target);
      await core.seedCountryPrice(fromId, 5e6);
      await core.seedCountrySupply(fromId, ethers.parseEther("50000"));
      
      // Mint tokens to treasury
      await token.mint(treasury.address, ethers.parseEther("50000"));
      
      // Approve USDC for attack fee
      await usdc.connect(user1).approve(core.target, ethers.parseUnits("10", 6));
    });

    it("Should execute free attack correctly", async function () {
      const amount = ethers.parseEther("0.1");
      
      const tx = await core.connect(user1).attack(fromId, countryId, amount);
      
      // Check events
      await expect(tx)
        .to.emit(core, "Attack")
        .withArgs(fromId, countryId, user1.address, 0, await core.KAPPA() / 10n);
      
      await expect(tx)
        .to.emit(core, "FreeAttackUsed")
        .withArgs(user1.address, fromId, countryId, 1, await tx.timestamp);
    });

    it("Should exhaust free attacks after 2 uses", async function () {
      const amount = ethers.parseEther("0.1");
      
      // Use first free attack
      await core.connect(user1).attack(fromId, countryId, amount);
      
      // Use second free attack
      await core.connect(user1).attack(fromId, countryId, amount);
      
      // Third attack should require fee
      const tx = await core.connect(user1).attack(fromId, countryId, amount);
      
      await expect(tx)
        .to.emit(core, "Attack")
        .withArgs(fromId, countryId, user1.address, 300000, await core.KAPPA() / 10n); // 0.30 USDC fee
    });
  });

  describe("Pausable", function () {
    it("Should pause and unpause correctly", async function () {
      await core.pause();
      
      await expect(
        core.connect(user1).buy(countryId, ethers.parseEther("1"), 0, Math.floor(Date.now() / 1000) + 3600)
      ).to.be.revertedWithCustomError(core, "EnforcedPause");
      
      await core.unpause();
      
      // Should work after unpause
      await usdc.connect(user1).approve(core.target, ethers.parseUnits("100", 6));
      await expect(
        core.connect(user1).buy(countryId, ethers.parseEther("1"), 0, Math.floor(Date.now() / 1000) + 3600)
      ).to.not.be.reverted;
    });
  });

  describe("Access Control", function () {
    it("Should only allow owner to create countries", async function () {
      await expect(
        core.connect(user1).createCountry(99, "Test", token.target)
      ).to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount");
    });

    it("Should only allow owner to seed prices", async function () {
      await expect(
        core.connect(user1).seedCountryPrice(countryId, 5e6)
      ).to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount");
    });

    it("Should only allow owner to pause", async function () {
      await expect(
        core.connect(user1).pause()
      ).to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount");
    });
  });

  describe("Invariant Tests", function () {
    it("Should maintain USDC balance invariant", async function () {
      const initialTreasuryUSDC = await usdc.balanceOf(treasury.address);
      const initialCoreUSDC = await usdc.balanceOf(core.target);
      
      // Perform buy operation
      await usdc.connect(user1).approve(core.target, ethers.parseUnits("100", 6));
      await core.connect(user1).buy(countryId, ethers.parseEther("1"), 0, Math.floor(Date.now() / 1000) + 3600);
      
      // Treasury USDC should increase (fees collected)
      expect(await usdc.balanceOf(treasury.address)).to.be.gte(initialTreasuryUSDC);
      
      // Core contract should not hold USDC (fees distributed)
      expect(await usdc.balanceOf(core.target)).to.equal(initialCoreUSDC);
    });

    it("Should maintain token supply invariant", async function () {
      const initialSupply = await core.getCountryInfo(countryId);
      
      // Buy tokens
      await usdc.connect(user1).approve(core.target, ethers.parseUnits("100", 6));
      await core.connect(user1).buy(countryId, ethers.parseEther("1"), 0, Math.floor(Date.now() / 1000) + 3600);
      
      const afterBuySupply = await core.getCountryInfo(countryId);
      expect(afterBuySupply.totalSupply).to.equal(initialSupply.totalSupply + ethers.parseEther("1"));
      
      // Sell tokens
      await token.connect(user1).approve(core.target, ethers.parseEther("1"));
      await core.connect(user1).sell(countryId, ethers.parseEther("0.5"), 0, Math.floor(Date.now() / 1000) + 3600);
      
      const afterSellSupply = await core.getCountryInfo(countryId);
      expect(afterSellSupply.totalSupply).to.equal(initialSupply.totalSupply + ethers.parseEther("0.5"));
    });
  });

  describe("Fuzz Tests", function () {
    it("Should handle random buy amounts correctly", async function () {
      await usdc.connect(user1).approve(core.target, ethers.parseUnits("1000", 6));
      
      // Random amounts between 0.001 and 10 tokens
      for (let i = 0; i < 10; i++) {
        const amount = ethers.parseEther((Math.random() * 9.999 + 0.001).toString());
        
        try {
          await core.connect(user1).buy(countryId, amount, 0, Math.floor(Date.now() / 1000) + 3600);
          
          // Verify user received tokens
          expect(await token.balanceOf(user1.address)).to.be.gte(amount);
        } catch (error) {
          // Some amounts might fail due to minimum requirements
          expect(error.message).to.include("MinBuyNotMet");
        }
      }
    });

    it("Should maintain price floor under all conditions", async function () {
      await usdc.connect(user1).approve(core.target, ethers.parseUnits("1000", 6));
      
      // Buy many tokens to increase price
      for (let i = 0; i < 5; i++) {
        await core.connect(user1).buy(countryId, ethers.parseEther("1"), 0, Math.floor(Date.now() / 1000) + 3600);
      }
      
      // Price should never go below minimum
      const countryInfo = await core.getCountryInfo(countryId);
      expect(countryInfo.price).to.be.gte(await core.PRICE_MIN());
    });
  });
});