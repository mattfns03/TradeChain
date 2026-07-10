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
    error Unauthorized();
    error InvalidTradeState();

    uint256 private tradeCounter;

    mapping(uint256 => Trade) private trades;

    event TradeCreated(
        uint256 indexed tradeId,
        address indexed importer,
        address indexed exporter,
        uint256 amount
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

    constructor(address initialOwner) Ownable(initialOwner) {}

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
        trade.status = TradeStatus.Accepted;
        emit TradeAccepted(tradeId);
    }

    function cancelTrade(uint256 tradeId) external tradeExists(tradeId) {
        Trade storage trade = trades[tradeId];

        if (msg.sender != trade.importer) { revert Unauthorized(); }
        _validateTradeState(trade, TradeStatus.Created);

        trade.status = TradeStatus.Cancelled;
        emit TradeCancelled(tradeId);
    }

    function getTrade(uint256 tradeId) public view override tradeExists(tradeId) returns (Trade memory) {
        return trades[tradeId];
    }

    function getTradeCounter() external view returns (uint256) {
        return tradeCounter;
    }

    function _validateTradeCreation(
        address exporter,
        uint256 amount,
        uint256 deadline
    ) internal view {
        if (exporter == address(0)) { revert InvalidExporter(); }
        if (exporter == msg.sender) { revert InvalidExporter(); }
        if (amount <= 0) { revert InvalidAmount(); }
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