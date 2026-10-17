import {network} from "hardhat";
import { mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import { mock } from "node:test";

const {ethers, networkName} = await network.create();

async function main(): Promise<void> {
    // This script is intentionally restricted to local development.
    // MockUSDC is not a production settlement token.
    if(networkName !== "localhost") {
        throw new Error(`This Script is restricted to localhost` + `Current network: ${networkName}`)
    }

    const signers = await ethers.getSigners();
    if(signers.length < 4) {
        throw new Error("At least four unlocked development account are required");
    }

    const [deployer, oracle, importer, exporter] = signers;

    const deployerAddress = await deployer.getAddress();
    const oracleAddress = await oracle.getAddress();
    const importerAddress = await importer.getAddress();
    const exporterAddress = await exporter.getAddress();

    console.log("\n====================================");
    console.log("        TradeChain Deployment");
    console.log("====================================");
    console.log(`Network:  ${networkName}`);
    console.log(`Deployer: ${deployerAddress}`);
    console.log(`Oracle:   ${oracleAddress}`);
    console.log(`Importer: ${importerAddress}`);
    console.log(`Exporter: ${exporterAddress}\n`);

    // ---------------------------------------------------------
    // 1. Deploy TradeManager
    // ---------------------------------------------------------

    console.log("Deploying TradeManager...");

    const TradeManager = await ethers.getContractFactory("TradeManager", deployer);
    const tradeManager = await TradeManager.deploy(deployerAddress);
    await tradeManager.waitForDeployment();

    const tradeManagerAddress = await tradeManager.getAddress();

    console.log(`TradeManager: ${tradeManagerAddress}`);

    // ---------------------------------------------------------
    // 2. Deploy MockUSDC
    // ---------------------------------------------------------

    console.log("\nDeploying MockUSDC...");

    const MockUSDC = await ethers.getContractFactory("MockUSDC", deployer);
    const mockUSDC = await MockUSDC.deploy(deployerAddress);
    await mockUSDC.waitForDeployment();
    const mockUSDCAddress = await mockUSDC.getAddress();

    console.log(`MockUSDC: ${mockUSDCAddress}`);

    // ---------------------------------------------------------
    // 3. Deploy Escrow
    // ---------------------------------------------------------

    console.log("\nDeploying Escrow...");

    const Escrow = await ethers.getContractFactory("Escrow", deployer);

    const escrow = await Escrow.deploy(deployerAddress, tradeManagerAddress, mockUSDCAddress);
    await escrow.waitForDeployment();

    const escrowAddress = await escrow.getAddress();

    console.log(`Escrow: ${escrowAddress}`);

    // ---------------------------------------------------------
    // 4. Deploy DocumentRegistry
    // ---------------------------------------------------------

    console.log("\nDeploying DocumentRegistry...");

    const DocumentRegistry = await ethers.getContractFactory("DocumentRegistry", deployer);
    const documentRegistry = await DocumentRegistry.deploy(tradeManagerAddress);
    await documentRegistry.waitForDeployment();
    const documentRegistryAddress = await documentRegistry.getAddress();

    console.log(`DocumentRegistry: ${documentRegistryAddress}`);

    // ---------------------------------------------------------
    // 5. Configure TradeManager permissions
    // ---------------------------------------------------------

    console.log("\nConfiguring TradeManager...");

    const setEscrowTx = await tradeManager.setEscrowContract(escrowAddress);
    await setEscrowTx.wait();
    const setOracleTx = await tradeManager.setOracleContract(oracleAddress);
    await setOracleTx.wait();

    console.log("Escrow authorization configured.");
    console.log("Development oracle configured.");

    // ---------------------------------------------------------
    // 6. Fund the development importer with mock tokens
    // ---------------------------------------------------------

    console.log("\nMinting development settlement tokens...");

    const initialTokenBalance = ethers.parseUnits("10000", 6);
    const mintTx = await mockUSDC.mint(importerAddress, initialTokenBalance);
    await mintTx.wait();
    const importerTokenBalance = await mockUSDC.balanceOf(importerAddress);

    console.log(
        `Importer mock-token balance: ` +
        `${ethers.formatUnits(importerTokenBalance, 6)} TCUSDC`
    );

    // ---------------------------------------------------------
    // 7. Save deployment manifest
    // ---------------------------------------------------------

    const {chainId} = await ethers.provider.getNetwork();
    const manifest = {
        network: networkName,
        chainId: chainId.toString(),
        deployedAt: new Date().toISOString(),

        accounts: {
            deployer: deployerAddress,
            oracle: oracleAddress,
            importer: importerAddress,
            exporter: exporterAddress
        },

        contracts: {
            TradeManager: tradeManagerAddress,
            MockUSDC: mockUSDCAddress,
            Escrow: escrowAddress,
            DocumentRegistry: documentRegistryAddress
        },

        development: {
            settlementTokenSymbol: "TCUSDC",
            settlementTokenDecimal: 6,
            importerInitialBalance: ethers.formatUnits(initialTokenBalance, 6)
        }
    };

    const deploymentDirectory = path.join(process.cwd(), "deployments");
    await mkdir(deploymentDirectory, {recursive:true});
    const manifestPath = path.join(deploymentDirectory, `${networkName}.json`);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

    console.log("\n====================================");
    console.log("      Deployment Successful");
    console.log("====================================");
    console.log(`Manifest: ${manifestPath}`);
    console.log("\nAll four contracts have been deployed.");
}

main().catch((error: unknown) => {
    console.error("\nTradeChain deployment failed:");

    if (error instanceof Error) {
        console.error(error.message);
    } else {
        console.error(error);
    }

    process.exitCode = 1;
});