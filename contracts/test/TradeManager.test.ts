import {expect} from "chai";
import hre from "hardhat";

// describe("TradeManager", function() {
//     async function deployTradeManager() {
//         const connection = await hre.network.create();
//         const ethers = connection.ethers;
//         const [ owner, importer, exporter, randomUser ] = 
//             await ethers.getSigners();
//         const TradeManager = await ethers.getContractFactory("TradeManager");
//         const tradeManager = await TradeManager.deploy(owner.address);
//         await tradeManager.waitForDeployment();
//         return { tradeManager, owner, importer, exporter, randomUser, ethers};
//     }
        
//     describe("Trade Creation", function () {
//         it("Should create a trade successfully", async function () {
//             const { tradeManager, importer, exporter, ethers } = await deployTradeManager();
//             const amount = ethers.parseEther("1");
//             const deadline = Math.floor(Date.now() / 1000) + 3600;
//             const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));
//             await tradeManager.connect(importer).createTrade(exporter.address, amount, deadline, documentHash);
//             const trade = await tradeManager.getTrade(0);
//             expect(trade.importer).to.equal(importer.address);
//             expect(trade.exporter).to.equal(exporter.address);
//         });
//     });

//     describe("Trade Acceptance", function () {
//         it("Exporter should accept trade", async function() {
//             const { tradeManager, importer, exporter, ethers } = await deployTradeManager();
//             const amount = ethers.parseEther("1");
//             const deadline = Math.floor(Date.now() / 1000) + 3600;
//             const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));
//             await tradeManager.connect(importer).createTrade(exporter.address, amount, deadline, documentHash);
//             await tradeManager.connect(exporter).acceptTrade(0);
//             const trade = await tradeManager.getTrade(0);
//             expect(trade.status).to.equal(1);
//         });
//     });
// });

describe("TradeManager", function() {
    async function deployTradeManager() {
        const connection = await hre.network.create();
        const ethers = connection.ethers;
        const [ owner, importer, exporter, oracle, escrow, randomUser] = await ethers.getSigners();
        const TradeManager = await ethers.getContractFactory("TradeManager");
        const tradeManager = await TradeManager.deploy(owner.address);
        await tradeManager.waitForDeployment();
        return { ethers, tradeManager, owner, importer, exporter, oracle, escrow, randomUser};
    }

    async function createTrade(tradeManager: any, importer: any, exporter: any, ethers: any) {
        const amount = ethers.parseEther("1");
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));
        await tradeManager.connect(importer).createTrade(exporter.address, amount, deadline, documentHash);
    }

    //  TRADE CREATION -------------------------------------

    describe("Trade Creation", function() {
        it("Should create a valid trade", async function() {
            const {tradeManager, importer, exporter, ethers} = await deployTradeManager();
            const amount = ethers.parseEther("1");
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));
            await expect(tradeManager.connect(importer).createTrade(exporter.address, amount,deadline, documentHash))
            .to.emit(tradeManager, "TradeCreated")
            .withArgs(0n,importer.address, exporter.address, amount);

            const trade = await tradeManager.getTrade(0);
            expect(trade.tradeId).to.equal(0n);
            expect(trade.importer).to.equal(importer.address);
            expect(trade.exporter).to.equal(exporter.address);
            expect(trade.amount).to.equal(amount);
            expect(trade.documentHash).to.equal(documentHash);

            // Created = 0
            expect(trade.status).to.equal(0n);
        });

        it("Should increment trade counter", async function() {
            const { tradeManager, importer, exporter, ethers} = await deployTradeManager();
            await createTrade(tradeManager, importer, exporter, ethers);
            await createTrade(tradeManager, importer, exporter, ethers);
            expect(await tradeManager.getTradeCounter()).to.equal(2n);
        });

        it("Should reject zero exporter address", async function() {
            const { tradeManager, importer, ethers} = await deployTradeManager();
            const amount = ethers.parseEther("1");
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));
            await expect(tradeManager.connect(importer).createTrade(ethers.ZeroAddress, amount, deadline, documentHash))
            .to.be.revertedWithCustomError(tradeManager, "InvalidExporter");
        });

        it("Should reject importer and exporter being the same address", async function() {
            const {tradeManager, importer, ethers} = await deployTradeManager();
            const amount = ethers.parseEther("1");
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));
            await expect(tradeManager.connect(importer).createTrade(importer.address, amount, deadline, documentHash))
            .to.be.revertedWithCustomError(tradeManager, "InvalidExporter");
        });

        it("Should reject zero amount trade", async function() {
            const { tradeManager, importer, exporter, ethers} = await deployTradeManager();
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));
            await expect(tradeManager.connect(importer).createTrade(exporter.address, 0 ,deadline, documentHash))
            .to.be.revertedWithCustomError(tradeManager, "InvalidAmount");
        });

        it("Should reject an expired deadline", async function() {
            const {tradeManager, importer ,exporter, ethers} = await deployTradeManager();
            const amount = ethers.parseEther("1");
            const deadline = Math.floor(Date.now() / 1000) - 3600;
            const documentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice"));
            await expect(tradeManager.connect(importer).createTrade(exporter.address, amount, deadline, documentHash))
            .to.be.revertedWithCustomError(tradeManager, "InvalidDeadline");
        });
    });

    //  TRADE ACCEPTANCE -------------------------------------
    
    describe("Trade Acceptance", function() {
        it("Exporter should accept a valid trade", async function() {
            const {tradeManager, importer, exporter, ethers} = await deployTradeManager();
            await createTrade(tradeManager, importer, exporter, ethers);
            await expect(tradeManager.connect(exporter).acceptTrade(0))
            .to.emit(tradeManager, "TradeAccepted")
            .withArgs(0n);

            const trade = await tradeManager.getTrade(0);
            // Accepted = 1
            expect(trade.status).to.equal(1n);
        });

        it("Should reject acceptance of a non exporter", async function() {
            const {tradeManager, importer, exporter, randomUser, ethers} = await deployTradeManager();
            await createTrade(tradeManager, importer, exporter, ethers);
            await expect(tradeManager.connect(randomUser).acceptTrade(0))
            .to.be.revertedWithCustomError(tradeManager, "Unauthorized");
        });

        it("Should reject the exporter accepting the same trade twice", async function() {
            const {tradeManager, importer, exporter, ethers} = await deployTradeManager();
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await expect(tradeManager.connect(exporter).acceptTrade(0))
            .to.be.revertedWithCustomError(tradeManager, "InvalidTradeState");
        });

        it("Should reject acceptance of a non existent trade", async function() {
            const {tradeManager, exporter} = await deployTradeManager();
            await expect(tradeManager.connect(exporter).acceptTrade(999))
            .to.be.revertedWithCustomError(tradeManager, "TradeNotFound");
        });
    });

    // TRADE CANCELLATION -------------------------------------

    describe("Trade Cancellation", function() {
        it("Importer should be able to cancel a Created trade ", async function() {
            const {tradeManager, importer, exporter, ethers} = await deployTradeManager();
            await createTrade(tradeManager, importer, exporter, ethers);
            await expect(tradeManager.connect(importer).cancelTrade(0))
            .to.emit(tradeManager, "TradeCancelled")
            .withArgs(0n);

            const trade = await tradeManager.getTrade(0);

            // Cancelled = 5
            expect(trade.status).to.equal(5n);
        });

        it("Should reject cancellation by the exporter", async function() {
            const {tradeManager, importer, exporter, ethers} = await deployTradeManager();
            await createTrade(tradeManager, importer, exporter, ethers);
            await expect(tradeManager.connect(exporter).cancelTrade(0))
            .to.be.revertedWithCustomError(tradeManager, "Unauthorized");
        });

        it("Should reject cancellation after acceptance", async function() {
            const {tradeManager, importer, exporter, ethers} = await deployTradeManager();
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await expect(tradeManager.connect(importer).cancelTrade(0))
            .to.be.revertedWithCustomError(tradeManager, "InvalidTradeState");
        });

        it("Should reject cancellation of a non existent trade", async function() {
            const {tradeManager, importer} = await deployTradeManager();
            await expect(tradeManager.connect(importer).cancelTrade(999))
            .to.be.revertedWithCustomError(tradeManager, "TradeNotFound");
        });
    });

    // ACCESS CONTROl -------------------------------------

    describe("Access Control", function() {
        it("Owner should be able to set the escrow contract", async function() {
            const {tradeManager, owner, escrow} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            expect(await tradeManager.escrowContract()).to.equal(escrow.address);
        });

        it("Non owner should not be able to set the escrow contact", async function() {
            const {tradeManager, randomUser, escrow} = await deployTradeManager();
            await expect(tradeManager.connect(randomUser).setEscrowContract(escrow.address))
            .to.be.revertedWithCustomError(tradeManager, "OwnableUnauthorizedAccount");
        });

        it("Should reject zero escrow address", async function() {
            const {tradeManager, owner, ethers} = await deployTradeManager();
            await expect(tradeManager.connect(owner).setEscrowContract(ethers.ZeroAddress))
            .to.be.revertedWithCustomError(tradeManager, "InvalidAddress");
        });

        it("Owner should be able to set the orcale contract", async function() {
            const {tradeManager, owner, oracle} = await deployTradeManager();
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            expect(await tradeManager.oracleContract()).to.equal(oracle.address);
        });

        it("'Non owner should not be able to set the oracle contract", async function() {
            const {tradeManager, randomUser, oracle} = await deployTradeManager();
            await expect(tradeManager.connect(randomUser).setOracleContract(oracle.address))
            .to.be.revertedWithCustomError(tradeManager, "OwnableUnauthorizedAccount");
        });

        it("Should reject zero oracle address", async function() {
            const {tradeManager, owner, ethers} = await deployTradeManager();
            await expect(tradeManager.connect(owner).setOracleContract(ethers.ZeroAddress))
            .to.be.revertedWithCustomError(tradeManager, "InvalidAddress");
        });
    });

    // ESCROW AUTHORIZATION -------------------------------------

    describe("Escrow Authorization", function() {
        it("Configured escrow should be able to mark a trade as Funded", async function() {
            const {tradeManager, owner, importer, exporter, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await expect(tradeManager.connect(escrow).markTradeFunded(0))
            .to.emit(tradeManager, "TradeStatusUpdated")
            .withArgs(0n,1n, 2n);

            const trade = await tradeManager.getTrade(0);
            // Funded = 2
            expect(trade.status).to.equal(2n);
        });

        it("Non escrow should not mark a trade as Funded", async function() {
            const {tradeManager, owner, importer, exporter, randomUser,escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await expect(tradeManager.connect(randomUser).markTradeFunded(0))
            .to.be.revertedWithCustomError(tradeManager, "Unauthorized");
        });
    });

    // ORACLE AUTHORIZATION -------------------------------------

    describe("Oracle Authorization", function() {
        it("Configured oracle should be able to mark a trade as Shipped", async function() {
            const {tradeManager, owner, importer, exporter, oracle, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await expect(tradeManager.connect(oracle).markTradeShipped(0))
            .to.emit(tradeManager, "TradeStatusUpdated")
            .withArgs(0n,2n, 3n);

            const trade = await tradeManager.getTrade(0);
            // Shipped = 3
            expect(trade.status).to.equal(3n);
        });

        it("Non oracle address should not mark a trade as Shipped", async function() {
            const {tradeManager, owner, importer, exporter, oracle, escrow, randomUser, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await expect(tradeManager.connect(randomUser).markTradeShipped(0))
            .to.be.revertedWithCustomError(tradeManager, "Unauthorized");
        });

        it("Configured oracle should be able to mark a trade as Disputed", async function() {
            const {tradeManager, owner, importer, exporter, oracle, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await expect(tradeManager.connect(oracle).markTradeDisputed(0))
            .to.emit(tradeManager, "TradeStatusUpdated")
            .withArgs(0n,2n, 6n);

            const trade = await tradeManager.getTrade(0);
            // Disputed = 6
            expect(trade.status).to.equal(6n);
        });
    });

    // COMPLETE LIFECYCLE --------------------------------------

    describe("Complete Trade Lifecycle", function() {
        it("Should move a trade from Created to Completed", async function() {
            const {tradeManager, owner, importer, exporter, oracle, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await tradeManager.connect(oracle).markTradeShipped(0);
            await expect(tradeManager.connect(escrow).markTradeCompleted(0))
            .to.emit(tradeManager, "TradeStatusUpdated")
            .withArgs(0n,3n, 4n);

            const trade = await tradeManager.getTrade(0);
            // Completed = 4
            expect(trade.status).to.equal(4n);
        });
    });

    // INVALID STATE TRANSITIONS --------------------------------------

    describe("Invalid State Transitions", function() {
        it("Should reject Created -> Funded", async function() {
            const {tradeManager, owner, importer, exporter, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await expect(tradeManager.connect(escrow).markTradeFunded(0))
            .to.be.revertedWithCustomError(tradeManager, "InvalidTradeState");
        });

        it("Should reject Created -> Completed", async function() {
            const {tradeManager, owner, importer, exporter, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await expect(tradeManager.connect(escrow).markTradeCompleted(0))
            .to.be.revertedWithCustomError(tradeManager, "InvalidTradeState");
        });

        it("Should reject Accepted -> Shipped", async function() {
            const {tradeManager, owner, importer, exporter, oracle, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await expect(tradeManager.connect(oracle).markTradeShipped(0))
            .to.be.revertedWithCustomError(tradeManager, "InvalidTradeState");
        });

        it("Should reject Funded -> Completed", async function() {
            const {tradeManager, owner, importer, exporter, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await expect(tradeManager.connect(escrow).markTradeCompleted(0))
            .to.be.revertedWithCustomError(tradeManager, "InvalidTradeState");
        });

        it("Should reject Shipped -> Disputed", async function() {
            const {tradeManager, owner, importer, exporter, oracle, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await tradeManager.connect(oracle).markTradeShipped(0);
            await expect(tradeManager.connect(oracle).markTradeDisputed(0))
            .to.be.revertedWithCustomError(tradeManager, "InvalidTradeState");
        });

        it("Should reject Completed -> any further state", async function() {
            const {tradeManager, owner, importer, exporter, oracle, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await tradeManager.connect(oracle).markTradeShipped(0);
            await tradeManager.connect(escrow).markTradeCompleted(0);
            await expect(tradeManager.connect(escrow).markTradeFunded(0))
            .to.be.revertedWithCustomError(tradeManager, "InvalidTradeState");
        });

        it("Should reject Cancelled -> any further state", async function() {
            const {tradeManager, owner, importer, exporter, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(importer).cancelTrade(0);
            await expect(tradeManager.connect(escrow).markTradeFunded(0))
            .to.be.revertedWithCustomError(tradeManager, "InvalidTradeState");
        });
    });

    // TRADE RETRIEVAL --------------------------------------

    describe("Trade Retrieval", function() {
        it("Should return the correct trade", async function() {
            const {tradeManager, importer, exporter, ethers} = await deployTradeManager();
            await createTrade(tradeManager, importer, exporter, ethers);
            const trade = await tradeManager.getTrade(0);
            expect(trade.tradeId).to.equal(0n);
            expect(trade.importer).to.equal(importer.address);
            expect(trade.exporter).to.equal(exporter.address);
        });

        it("Should reject retrieval of a non existent trade", async function() {
            const {tradeManager} = await deployTradeManager();
            await expect(tradeManager.getTrade(999))
            .to.be.revertedWithCustomError(tradeManager, "TradeNotFound");
        });
    });

    // DISPUTE RESOLUTION --------------------------------------

    describe("Dispute Resolution", function() {
        it("Should allow an oracle to dispute a funded trade", async function() {
            const {tradeManager, owner, importer, exporter, oracle, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await expect(tradeManager.connect(oracle).markTradeDisputed(0))
            .to.emit(tradeManager, "TradeStatusUpdated")
            .withArgs(0n,2n, 6n);

            const trade = await tradeManager.getTrade(0);
            // Disputed = 6
            expect(trade.status).to.equal(6n);
        });

        it("Should allow escrow to resolve a dispute in favor of the exporter", async function(){
            const {tradeManager, owner, importer, exporter, oracle, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await tradeManager.connect(oracle).markTradeDisputed(0);
            await expect(tradeManager.connect(escrow).markTradeCompleted(0))
            .to.emit(tradeManager, "TradeStatusUpdated")
            .withArgs(0n,6n, 4n);

            const trade = await tradeManager.getTrade(0);
            //Completed = 4
            expect(trade.status).to.equal(4n);
        });

        it("Should allow escrow to refund a disputed trade", async function() {
            const {tradeManager, owner, importer, exporter, oracle, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await tradeManager.connect(oracle).markTradeDisputed(0);
            await expect(tradeManager.connect(escrow).markTradeRefunded(0))
            .to.emit(tradeManager, "TradeStatusUpdated")
            .withArgs(0n,6n, 7n);

            const trade = await tradeManager.getTrade(0);
            // Refunded = 7
            expect(trade.status).to.equal(7n);
        });

        it("Should reject refunding a non disputed trade", async function() {
            const {tradeManager, owner, importer, exporter, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await expect(tradeManager.connect(escrow).markTradeRefunded(0))
            .to.be.revertedWithCustomError(tradeManager,"InvalidTradeState");
        });

        it("Should reject a non escrow address from refunding a trade", async function() {
            const {tradeManager, owner, importer, randomUser, exporter, escrow, oracle, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await tradeManager.connect(oracle).markTradeDisputed(0);
            await expect(tradeManager.connect(randomUser).markTradeRefunded(0))
            .to.be.revertedWithCustomError(tradeManager,"Unauthorized");
        });

        it("Should reject any transition from Refunded", async function() {
            const {tradeManager, owner, importer, exporter, escrow, oracle, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await tradeManager.connect(oracle).markTradeDisputed(0);
            await tradeManager.connect(escrow).markTradeRefunded(0);
            const refundedTrade = await tradeManager.getTrade(0);
            expect(refundedTrade.status).to.equal(7n);
            await expect(tradeManager.connect(escrow).markTradeCompleted(0))
            .to.be.revertedWithCustomError(tradeManager, "InvalidTradeState");
        });

        it("Should reject any transition from Completed", async function() {
            const {tradeManager, owner, importer, exporter, escrow, oracle, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await tradeManager.connect(owner).setOracleContract(oracle.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(exporter).acceptTrade(0);
            await tradeManager.connect(escrow).markTradeFunded(0);
            await tradeManager.connect(oracle).markTradeShipped(0);
            await tradeManager.connect(escrow).markTradeCompleted(0);
            const completedTrade = await tradeManager.getTrade(0);
            expect(completedTrade.status).to.equal(4n);
            await expect(tradeManager.connect(escrow).markTradeCompleted(0))
            .to.be.revertedWithCustomError(tradeManager,"InvalidTradeState");
        });

        it("Should reject any transistion from Cancelled", async function() {
            const {tradeManager, owner, importer, exporter, escrow, ethers} = await deployTradeManager();
            await tradeManager.connect(owner).setEscrowContract(escrow.address);
            await createTrade(tradeManager, importer, exporter, ethers);
            await tradeManager.connect(importer).cancelTrade(0);
            const cancelledTrade = await tradeManager.getTrade(0);
            expect(cancelledTrade.status).to.equal(5n);
            await expect(tradeManager.connect(escrow).markTradeFunded(0))
            .to.be.revertedWithCustomError(tradeManager,"InvalidTradeState");
        });
    });
});