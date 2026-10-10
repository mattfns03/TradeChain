import {expect} from "chai";
import { symlinkSync } from "fs";
import hre from "hardhat";

describe("Escrow", function () {
    async function deploySystem() {
        const {ethers} = await hre.network.connect();

        const [ owner, importer, exporter, oracle, randomUser] = await ethers.getSigners();

        const MockUSDC = await ethers.getContractFactory("MockUSDC");

        const token: any = await MockUSDC.deploy(owner.address);

        await token.waitForDeployment();

        const TradeManager = await ethers.getContractFactory("TradeManager");

        const tradeManager = await TradeManager.deploy(owner.address);

        await tradeManager.waitForDeployment();

        const Escrow = await ethers.getContractFactory("Escrow");

        const escrow: any = await Escrow.deploy(owner.address, await tradeManager.getAddress(), await token.getAddress());

        await escrow.waitForDeployment();

        await tradeManager.connect(owner).setEscrowContract(await escrow.getAddress());

        await tradeManager.connect(owner).setOracleContract(oracle.address);

        const importerInitialBalance = ethers.parseUnits("10000", 6);

        await token.connect(owner).mint(importer.address, importerInitialBalance);

        return {ethers, owner, importer, exporter, oracle, randomUser, token, tradeManager, escrow};
    }

    async function createAcceptedTrade(system: any) {
        const {tradeManager, importer, exporter, ethers} = system;

        const amount = ethers.parseUnits("5000", 6);

        const deadline = Math.floor(Date.now()/ 1000) + 3600;

        const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));

        await tradeManager.connect(importer).createTrade(exporter.address,amount, deadline, documentHash);

        await tradeManager.connect(exporter).acceptTrade(0);

        return amount;
    }

    // =============================================================
    //                           DEPLOYMENT
    // =============================================================

    describe("Deployment", function() {
        it("Should set the TradeManager address", async function() {
            const {tradeManager, escrow} = await deploySystem();
            expect(await escrow.tradeManager()).to.equal(await tradeManager.getAddress());
        });


        it("Should set the settlement token", async function() {
            const {token, escrow} = await deploySystem();
            expect(await escrow.settlementToken()).to.equal(await token.getAddress());
        });

        it("Should reject a zero tradeManager address", async function() {
            const {owner, token, ethers} = await deploySystem();

            const Escrow = await ethers.getContractFactory("Escrow");

            await expect(Escrow.deploy(owner.address, ethers.ZeroAddress, await token.getAddress()))
            .to.be.revertedWithCustomError(Escrow, "InvalidAddress");
        });
    });

    // =============================================================
    //                             DEPOSIT
    // =============================================================

    describe("Deposit", function() {
        it("Should successfully deposit trade funds", async function() {
        const system = await deploySystem();

        const {tradeManager, escrow, importer, token} = system;

        const amount  = await createAcceptedTrade(system);

        await token.connect(importer).approve(await escrow.getAddress(), amount);

        await expect(escrow.connect(importer).deposit(0))
        .to.emit(escrow, "EscrowDeposited")
        .withArgs(0n,importer.address,amount);

        const escrowData = await escrow.getEscrow(0);

        expect(escrowData.importer).to.equal(importer.address);
        expect(escrowData.amount).to.equal(amount);
        expect(escrowData.funded).to.equal(true);
        expect(escrowData.released).to.equal(false);
        expect(escrowData.refunded).to.equal(false);
        expect(await token.balanceOf(await escrow.getAddress())).to.equal(amount);
        expect(await escrow.getEscrowBalance()).to.equal(amount);
        const trade = await tradeManager.getTrade(0);

        //Funded = 2
        expect(trade.status).to.equal(2n);

        });


        it("Should reject deposit by a non-importer", async function() {
            const system = await deploySystem();

            const {escrow, exporter,randomUser, token, ethers} = system;
            const amount  = await createAcceptedTrade(system);

            await token.connect(exporter).approve(await escrow.getAddress(), amount);
            await expect(escrow.connect(randomUser).deposit(0))
            .to.be.revertedWithCustomError(escrow, "Unauthorized");
        });


        it("Should reject deposit before trade acceptance", async function() {
            const system = await deploySystem();

            const {tradeManager, escrow, importer, exporter, token, ethers} = system;

            const amount = ethers.parseUnits("5000", 6);

            const deadline = Math.floor(Date.now()/ 1000) + 3600;

            const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));

            await tradeManager.connect(importer).createTrade(exporter.address,amount, deadline, documentHash);

            await token.connect(importer).approve(await escrow.getAddress(), amount);

            await expect(escrow.connect(importer).deposit(0))
            .to.be.revertedWithCustomError(escrow, "InvalidTradeState");
        });


        it("Should reject duplicate deposits", async function() {
            const system = await deploySystem();
            const {importer, escrow, token} = system;

            const amount  = await createAcceptedTrade(system);

            await token.connect(importer).approve(await escrow.getAddress(), amount);

            await escrow.connect(importer).deposit(0);
            await expect(escrow.connect(importer).deposit(0))
            .to.be.revertedWithCustomError(escrow, "InvalidTradeState");
        });


        it("Should reject deposits when the importer has insufficient funds", async function() {
            const system = await deploySystem();
            const {importer, escrow, token, ethers} = system;

            const amount  = await createAcceptedTrade(system);
            await token.connect(importer).approve(await escrow.getAddress(), amount - 1n);
            await expect(escrow.connect(importer).deposit(0))
            .to.be.revert(ethers);
        });
    });

    // =============================================================
    //                         RELEASE FUNDS
    // =============================================================

    describe("Release Funds", function() {
        it("Should release funds after shipment confirmation", async function() {
            const system = await deploySystem();
            const {tradeManager, escrow, importer, exporter, oracle, token} = system;

            const amount  = await createAcceptedTrade(system);
            await token.connect(importer).approve(await escrow.getAddress(), amount);
            await escrow.connect(importer).deposit(0);

            await tradeManager.connect(oracle).markTradeShipped(0);
            const exporterBalanceBefore = await token.balanceOf(exporter.address);
            await expect(escrow.connect(randomUserPlaceholder(system)).releaseFunds(0))
            .to.emit(escrow, "FundsReleased")
            .withArgs(0n, exporter.address, amount);

            const exporterBalanceAfter = await token.balanceOf(exporter.address);
            expect(exporterBalanceAfter - exporterBalanceBefore).to.equal(amount);
            expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n);

            const escrowData = await escrow.getEscrow(0);
            expect(escrowData.released).to.equal(true);
            const trade = await tradeManager.getTrade(0);

            //Completed = 4
            expect(trade.status).to.equal(4n);
        });


        it("Should reject release before shipment", async function() {
            const system = await deploySystem();
            const {importer, escrow, token, randomUser} = system;

            const amount  = await createAcceptedTrade(system);
            await token.connect(importer).approve(await escrow.getAddress(), amount);
            await escrow.connect(importer).deposit(0);

            await expect(escrow.connect(randomUser).releaseFunds(0))
            .to.be.revertedWithCustomError(escrow, "InvalidTradeState");
        });


        it("Should reject release when the trade has not been funded", async function() {
            const system = await deploySystem();
            const { tradeManager, exporter, oracle, escrow} = system;

            await createAcceptedTrade(system);

            await expect(tradeManager.connect(oracle).markTradeShipped(0))
            .to.be.revertedWithCustomError(tradeManager, "InvalidTradeState");
        });


        it("Should reject releasing the same escrow twice", async function() {
            const system = await deploySystem();
            const { tradeManager, importer, escrow, oracle, token, exporter, randomUser} = system;

            const amount  = await createAcceptedTrade(system);
            await token.connect(importer).approve(await escrow.getAddress(), amount);
            await escrow.connect(importer).deposit(0);
            await tradeManager.connect(oracle).markTradeShipped(0);
            await escrow.connect(randomUser).releaseFunds(0);
            await expect(escrow.connect(randomUser).releaseFunds(0))
            .to.be.revertedWithCustomError(escrow, "InvalidTradeState");
        });
    });


    // =============================================================
    //                             REFUND
    // =============================================================


    describe("Refund", function() {
        it("Should refund importer after a dispute", async function() {
            const system = await deploySystem();
            const { tradeManager, owner, importer, escrow, oracle, token} = system;

            const amount  = await createAcceptedTrade(system);
            await token.connect(importer).approve(await escrow.getAddress(), amount);
            await escrow.connect(importer).deposit(0);
            await tradeManager.connect(oracle).markTradeDisputed(0);
            const importerBalanceBefore = await token.balanceOf(importer.address);
            await expect(escrow.connect(owner).refund(0))
            .to.emit(escrow, "FundsRefunded")
            .withArgs(0n, importer.address, amount);

            const importerBalanceAfter = await token.balanceOf(importer.address);
            expect(importerBalanceAfter - importerBalanceBefore).to.equal(amount);
            expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n);

            const escrowData = await escrow.getEscrow(0);
            expect(escrowData.refunded).to.equal(true);
            const trade = await tradeManager.getTrade(0);

            //Refunded = 7
            expect(trade.status).to.equal(7n);
        });


        it("Should reject refund by a non-owner", async function() {
            const system = await deploySystem();
            const {tradeManager, owner, importer, escrow, oracle, token, randomUser} = system;

            const amount = await createAcceptedTrade(system);

            await token.connect(importer).approve(await escrow.getAddress(), amount);
            await escrow.connect(importer).deposit(0);
            await tradeManager.connect(oracle).markTradeDisputed(0);
            await expect(escrow.connect(randomUser).refund(0))
            .to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
        });


        it("Should reject refund before a dispute", async function() {
            const system = await deploySystem();
            const {owner, importer, escrow, token} = system;

            const amount = await createAcceptedTrade(system);

            await token.connect(importer).approve(await escrow.getAddress(), amount);

            await escrow.connect(importer).deposit(0);

            await expect(escrow.connect(owner).refund(0))
            .to.be.revertedWithCustomError(escrow, "InvalidTradeState");
        });


        it("Should reject refunding an already settled escrow", async function() {
            const system = await deploySystem();
            const {tradeManager, owner, importer, escrow, oracle, token} = system;

            const amount = createAcceptedTrade(system);

            await token.connect(importer).approve(await escrow.getAddress(), amount);
            await escrow.connect(importer).deposit(0);
            await tradeManager.connect(oracle).markTradeDisputed(0);
            await escrow.connect(owner).refund(0);
            await expect(escrow.connect(owner).refund(0))
            .to.be.revertedWithCustomError(escrow, "InvalidTradeState");
        });
    });

    // =============================================================
    //                         VIEW FUNCTIONS
    // =============================================================

    describe("View functions", function() {
        it("Should return zero escrow balance intially", async function() {
            const {escrow} = await deploySystem();
            expect(await escrow.getEscrowBalance()).to.equal(0n);
        });
    });
});



function randomUserPlaceholder(
    system: any
) {
    return system.randomUser;
}