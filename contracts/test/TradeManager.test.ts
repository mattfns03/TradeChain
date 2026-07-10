import {expect} from "chai";
import hre from "hardhat";

describe("TradeManager", function() {
    async function deployTradeManager() {
        const connection = await hre.network.create();
        const ethers = connection.ethers;
        const [ owner, importer, exporter, randomUser ] = 
            await ethers.getSigners();
        const TradeManager = await ethers.getContractFactory("TradeManager");
        const tradeManager = await TradeManager.deploy(owner.address);
        await tradeManager.waitForDeployment();
        return { tradeManager, owner, importer, exporter, randomUser, ethers};
    }
        
    describe("Trade Creation", function () {
        it("Should create a trade successfully", async function () {
            const { tradeManager, importer, exporter, ethers } = await deployTradeManager();
            const amount = ethers.parseEther("1");
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));
            await tradeManager.connect(importer).createTrade(exporter.address, amount, deadline, documentHash);
            const trade = await tradeManager.getTrade(0);
            expect(trade.importer).to.equal(importer.address);
            expect(trade.exporter).to.equal(exporter.address);
        });
    });

    describe("Trade Acceptance", function () {
        it("Exporter should accept trade", async function() {
            const { tradeManager, importer, exporter, ethers } = await deployTradeManager();
            const amount = ethers.parseEther("1");
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));
            await tradeManager.connect(importer).createTrade(exporter.address, amount, deadline, documentHash);
            await tradeManager.connect(exporter).acceptTrade(0);
            const trade = await tradeManager.getTrade(0);
            expect(trade.status).to.equal(1);
        });
    });
});