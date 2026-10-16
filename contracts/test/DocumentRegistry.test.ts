import { equal } from "assert";
import { expect } from "chai";
import hre from "hardhat";

describe("DocumentRegistry", function() {
    async function deploySystem() {
        const {ethers} = await hre.network.connect();

        const [owner, importer,exporter, outsider] = await ethers.getSigners();

        // ---------------------------------------------------------
        // Deploy TradeManager
        // ---------------------------------------------------------

        const TradeManager = await ethers.getContractFactory("TradeManager");
        const tradeManager = await TradeManager.deploy(owner.address);
        await tradeManager.waitForDeployment();

        // ---------------------------------------------------------
        // Deploy DocumentRegistry
        // ---------------------------------------------------------

        const DocumentRegistry = await ethers.getContractFactory("DocumentRegistry");
        const registry = await DocumentRegistry.deploy(await tradeManager.getAddress());
        await registry.waitForDeployment();

        // ---------------------------------------------------------
        // Create one trade for the test cases
        // ---------------------------------------------------------

        const amount = ethers.parseEther("1");
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const tradeDocumentHash = ethers.keccak256(ethers.toUtf8Bytes("trade-agreement"));
        await tradeManager.connect(importer).createTrade(exporter.address, amount,deadline,tradeDocumentHash);
        return {ethers, owner, importer, exporter, outsider, tradeManager, registry};
    }

    const TEST_CID = "bafybeigdyrzt5sfp7udm7hu76uhmockcid";
    async function calculateContentHash(ethers: any, content: string = "MathewsTestInvoiceContent") {
        return ethers.keccak256(ethers.toUtf8Bytes(content));
    }

    // =============================================================
    //                           DEPLOYMENT
    // =============================================================

    describe("Deployment", function() {
        it("Should set the TradeManager address", async function() {
            const { tradeManager, registry} = await deploySystem();
            expect(await registry.tradeManager()).to.equal(await tradeManager.getAddress());
        });


        it("Should reject a zero TradeManager Address", async function() {
            const {ethers} = await hre.network.connect();
            const DocumentRegistry = await ethers.getContractFactory("DocumentRegistry");
            await expect(DocumentRegistry.deploy(ethers.ZeroAddress))
            .to.be.revertedWithCustomError(DocumentRegistry, "InvalidAddress");
        });
    });

    // =============================================================
    //                      DOCUMENT REGISTRATION
    // =============================================================

    describe("Document Registration", function () {
        it("Should register a document submitted by the importer", async function(){
            const {ethers, registry, importer} = await deploySystem();
            const ContentHash = await calculateContentHash(ethers);
            await expect(registry.connect(importer).registerDocument(0,0,TEST_CID,ContentHash))
            .to.emit(registry,"DocumentRegistered")
            .withArgs(0n,0n,importer.address,0n,TEST_CID,ContentHash);

            const document = await registry.getDocument(0);

            expect(document.documentId).to.equal(0n);
            expect(document.tradeId).to.equal(0n);
            expect(document.uploader).to.equal(importer.address);
            expect(document.documentType).to.equal(0n);
            expect(document.cid).to.equal(TEST_CID);
            expect(document.contentHash).to.equal(ContentHash);
            expect(document.uploadedAt).to.greaterThan(0n);
            expect(document.revoked).to.equal(false);
            expect(document.revokedAt).to.equal(0n);
        });

        it("Should allow the exporter to register a document", async function() {
            const { ethers, registry, exporter} = await deploySystem();
            const contentHash = await calculateContentHash(ethers, "bill-of-lading");
            await registry.connect(exporter).registerDocument(0,1,TEST_CID,contentHash);
            const document = await registry.getDocument(0);

            //BillOfLading = 1
            expect(document.documentType).to.equal(1n);
            expect(document.uploader).to.equal(exporter.address);
        });

        it("Should reject document registration by an unrelated wallet", async function() {
            const { ethers, registry, outsider} = await deploySystem();
            const contentHash = await calculateContentHash(ethers);
            await expect(registry.connect(outsider).registerDocument(0,0,TEST_CID,contentHash))
            .to.be.revertedWithCustomError(registry, "Unauthorized");
        });

        it("Should reject registration for a non-existent trade", async function() {
            const { ethers, registry, tradeManager, importer} = await deploySystem();
            const contentHash = await calculateContentHash(ethers);
            await expect(registry.connect(importer).registerDocument(999,0,TEST_CID,contentHash))
            .to.be.revertedWithCustomError(tradeManager, "TradeNotFound");
        });

        it("Should reject an empty CID", async function() {
            const { ethers, registry, importer} = await deploySystem();
            const contentHash = await calculateContentHash(ethers);
            await expect(registry.connect(importer).registerDocument(0,0,"",contentHash))
            .to.be.revertedWithCustomError(registry, "InvalidCID");
        });

        it("Should reject a CID longer than the allowed maximum", async function() {
            const { ethers, registry, importer} = await deploySystem();
            const contentHash = await calculateContentHash(ethers);
            const oversizedCID = "a".repeat(129);

            await expect(registry.connect(importer).registerDocument(0,0,oversizedCID,contentHash))
            .to.be.revertedWithCustomError(registry,"InvalidCID");
        });

        it("Should reject a zero contentHash", async function(){
            const {ethers, registry, importer} = await deploySystem();
            await expect(registry.connect(importer).registerDocument(0,0,TEST_CID,ethers.ZeroHash))
            .to.be.revertedWithCustomError(registry, "InvalidContentHash");
        });

        it("Should assign sequential document IDs", async function(){
            const { ethers, registry, importer, exporter} = await deploySystem();
            const firstHash = await calculateContentHash(ethers, "invoice");
            const secondHash = await calculateContentHash(ethers, "packing-List");
            await registry.connect(importer).registerDocument(0,0,TEST_CID,firstHash);
            await registry.connect(exporter).registerDocument(0,3,TEST_CID,secondHash);
            expect(await registry.getDocumentCount()).to.equal(2n);
            const firstDocument = await registry.getDocument(0);
            const secondDocument = await registry.getDocument(1);

            expect(firstDocument.documentId).to.equal(0);
            expect(secondDocument.documentId).to.equal(1);
        });
    });

    // =============================================================
    //                       DOCUMENT RETRIEVAL
    // =============================================================

    describe("Document Retrieval", function () {
        it("Should retrun all document IDs for a trade", async function() {
            const {ethers, registry, importer, exporter} = await deploySystem();
            const invoiceHash = await calculateContentHash(ethers, "invoice");
            const billOfLadingHash = await calculateContentHash(ethers, "bill-of-lading");
            await registry.connect(importer).registerDocument(0,0,TEST_CID,invoiceHash);
            await registry.connect(exporter).registerDocument(0,1,TEST_CID,billOfLadingHash);
            const documentIds = await registry.getDocumentForTrade(0);
            expect(documentIds).to.deep.equal([0n,1n]); 
        });

        it("Should reject retrieving documents for a non-existent trade", async function(){
            const {registry, tradeManager} = await deploySystem();
            await expect(registry.getDocumentForTrade(999))
            .to.be.revertedWithCustomError(tradeManager, "TradeNotFound");
        });

        it("Should reject retrieving a non-existent document", async function() {
            const { registry} = await deploySystem();
            await expect(registry.getDocument(999))
            .to.be.revertedWithCustomError(registry, "DocumentNotFound");
        });
    });


    // =============================================================
    //                       DOCUMENT REVOCATION
    // =============================================================

    describe("Document Revocation", function() {
        it("Should allow the uploader to revoke a document", async function() {
            const { ethers, registry, importer} = await deploySystem();
            const contentHash = await calculateContentHash(ethers);
            await registry.connect(importer).registerDocument(0,0,TEST_CID,contentHash);
            await expect(registry.connect(importer).revokeDocument(0))
            .to.emit(registry, "DocumentRevoked")
            .withArgs(0n,0n,importer.address);

            const document = await registry.getDocument(0);
            expect(document.revoked).to.equal(true);
            expect(document.revokedAt).to.be.greaterThan(0n);
        });


        it("Should reject revocation by someone other than the uploader", async function() {
            const { ethers, registry, importer, exporter} = await deploySystem();

            const contentHash = await calculateContentHash(ethers);
            await registry.connect(importer).registerDocument(0,0,TEST_CID,contentHash);
            await expect(registry.connect(exporter).revokeDocument(0))
            .to.be.revertedWithCustomError(registry, "Unauthorized");
        });

        it("Should reject revoking a document Twice", async function() {
            const {ethers, registry, importer} = await deploySystem();
            const contentHash = await calculateContentHash(ethers);
            await registry.connect(importer).registerDocument(0,0,TEST_CID,contentHash);
            await registry.connect(importer).revokeDocument(0);
            await expect(registry.connect(importer).revokeDocument(0))
            .to.be.revertedWithCustomError(registry, "DocumentAlreadyRevoked");
        });

        it("Should retain the original record after revocation", async function() {
            const {ethers, registry, importer} = await deploySystem();
            const contentHash = await calculateContentHash(ethers, "original-invoice");
            await registry.connect(importer).registerDocument(0,0,TEST_CID,contentHash);
            await registry.connect(importer).revokeDocument(0);
            const document = await registry.getDocument(0);

            expect(document.documentId).to.equal(0n);
            expect(document.cid).to.equal(TEST_CID);
            expect(document.contentHash).to.equal(contentHash);
            expect(document.uploader).to.equal(importer.address);
            expect(document.revoked).to.equal(true);

            //Revocation must not decrease the global count 
            expect(await registry.getDocumentCount()).to.equal(1n);

            //The revoked document id stays in the trade history
            expect(await registry.getDocumentForTrade(0)).to.deep.equal([0n]);
        });

        it("Should reject revoking a non-existent document",async function(){
            const {registry, importer} = await deploySystem();
            await expect(registry.connect(importer).revokeDocument(999))
            .to.be.revertedWithCustomError(registry, "DocumentNotFound");
        });
    });
});