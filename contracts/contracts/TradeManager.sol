//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITradeManager.sol";

contract TradeManager is Ownable, ReentrancyGuard, ITradeManager {

    // ------------------------------ Errors --------------------------------------

    error TradeNotFound();
    error InvalidExporter();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidAddress();
    error Unauthorized();
    error InvalidTradeState();

    uint256 private tradeCounter;
    address public escrowContract;
    address public oracleContract;

    mapping(uint256 => Trade) private trades;

    event TradeCreated(
        uint256 indexed tradeId,
        address indexed importer,
        address indexed exporter,
        uint256 amount
        );

    event TradeStatusUpdated(
        uint256 indexed tradeId,
        TradeStatus previousStatus,
        TradeStatus newStatus
    );

    event TradeAccepted (
        uint256 indexed tradeId
    );

    event TradeCancelled (
        uint256 indexed tradeId
    );

    modifier tradeExists(uint256 tradeId) {
        if (tradeId >= tradeCounter) {
            revert TradeNotFound();
        }
        _;
    }

    modifier onlyEscrow() {
        if (msg.sender != escrowContract) {
            revert Unauthorized();
        }
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != oracleContract) {
            revert Unauthorized();
        }
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    function _updateTradeState(
        uint256 tradeId,
        TradeStatus newStatus
    ) internal {
        TradeStatus currentStatus = trades[tradeId].status;

        if( currentStatus == TradeStatus.Created && 
            newStatus != TradeStatus.Accepted &&
            newStatus != TradeStatus.Cancelled) {
                revert InvalidTradeState();
            }
        
        if ( currentStatus == TradeStatus.Accepted &&
            newStatus != TradeStatus.Funded) {
                revert InvalidTradeState();
            }

        if ( currentStatus == TradeStatus.Funded &&
            newStatus != TradeStatus.Shipped &&
            newStatus != TradeStatus.Disputed) {
                revert InvalidTradeState();
            }

        if( currentStatus == TradeStatus.Shipped &&
            newStatus != TradeStatus.Completed) {
                revert InvalidTradeState();
            }

        if( currentStatus == TradeStatus.Completed || 
            currentStatus == TradeStatus.Cancelled) {
                revert InvalidTradeState();
            }

        emit TradeStatusUpdated(tradeId, currentStatus, newStatus);

        trades[tradeId].status = newStatus;
    }

    function markTradeFunded(
        uint256 tradeId
    ) external onlyEscrow tradeExists(tradeId) {
        _updateTradeState(tradeId, TradeStatus.Funded);
    }

    function markTradeCompleted(
        uint256 tradeId
    ) external onlyEscrow tradeExists(tradeId) {
        _updateTradeState(tradeId, TradeStatus.Completed);
    }

    function markTradeDisputed(
        uint256 tradeId
    ) external onlyOracle tradeExists(tradeId) {
        _updateTradeState(tradeId, TradeStatus.Disputed);
    }

    function markTradeShipped( uint256 tradeId) external onlyOracle tradeExists(tradeId) {
        _updateTradeState(tradeId, TradeStatus.Shipped);
    }

    function createTrade(
        address exporter,
        uint256 amount,
        uint256 deadline,
        bytes32 documentHash
    ) external nonReentrant {

        _validateTradeCreation(exporter, amount, deadline);

        trades[tradeCounter] = Trade({
            tradeId: tradeCounter,
            importer: msg.sender,
            exporter: exporter,
            amount: amount,
            createdAt: block.timestamp,
            deadlineAt: deadline,
            documentHash: documentHash,
            status: TradeStatus.Created
        });

        emit TradeCreated(
            tradeCounter,
            msg.sender,
            exporter,
            amount
        );

        tradeCounter++;
    }

    function acceptTrade(uint256 tradeId) external tradeExists(tradeId) {
        Trade storage trade = trades[tradeId];

        if (msg.sender != trade.exporter) { revert Unauthorized(); }
        _validateTradeState(trade, TradeStatus.Created);
        _updateTradeState(tradeId, TradeStatus.Accepted);
        emit TradeAccepted(tradeId);
    }

    function cancelTrade(uint256 tradeId) external tradeExists(tradeId) {
        Trade storage trade = trades[tradeId];

        if (msg.sender != trade.importer) { revert Unauthorized(); }
        _validateTradeState(trade, TradeStatus.Created);
        _updateTradeState(tradeId, TradeStatus.Cancelled);
        emit TradeCancelled(tradeId);
    }

    function getTrade(uint256 tradeId) public view override tradeExists(tradeId) returns (Trade memory) {
        return trades[tradeId];
    }

    function getTradeCounter() external view returns (uint256) {
        return tradeCounter;
    }

    function setEscrowContract(address escrow) external onlyOwner {
        if(escrow == address(0)) {
            revert InvalidAddress();
        }
        escrowContract = escrow;
    }

    function setOracleContract(address oracle) external onlyOwner {
        if(oracle == address(0)) {
            revert InvalidAddress();
        }
        oracleContract = oracle;
    }

    function _validateTradeCreation(
        address exporter,
        uint256 amount,
        uint256 deadline
    ) internal view {
        if (exporter == address(0)) { revert InvalidAddress(); }
        if (exporter == msg.sender) { revert InvalidAddress(); }
        if (amount == 0) { revert InvalidAmount(); }
        if (deadline <= block.timestamp) { revert InvalidDeadline(); }
    }

    function _validateTradeState(
        Trade storage trade,
        TradeStatus expected
    ) internal view {
        if (trade.status != expected) {
            revert InvalidTradeState();
        }
    }
}