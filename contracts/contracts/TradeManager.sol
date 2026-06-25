//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITradeManager.sol";

contract TradeManager is Ownable, ReentrancyGuard, ITradeManager {

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
        require(tradeId < tradeCounter, "Trade does not exist");
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    function createTrade(
        address exporter,
        uint256 amount,
        uint256 deadline,
        bytes32 documentHash
    ) external nonReentrant {
        require(exporter != address(0), "Invalid exporter");
        require(exporter != msg.sender, "Importer and exporter cannot be match");
        require(amount > 0, "Amount must be greater than 0");
        require(deadline > block.timestamp, "Invalid Deadline");

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

        require(msg.sender == trade.exporter, "Only exporter allowed");
        require(trade.status == TradeStatus.Created, "Trade cannot be accepted");
        trade.status = TradeStatus.Accepted;
        emit TradeAccepted(tradeId);
    }

    function cancelTrade(uint256 tradeId) external tradeExists(tradeId) {
        Trade storage trade = trades[tradeId];

        require(msg.sender == trade.importer, "Only importer allowed");
        require(trade.status == TradeStatus.Created, "Trade cannot be cancelled");

        trade.status = TradeStatus.Cancelled;
        emit TradeCancelled(tradeId);
    }

    function getTrade(uint256 tradeId) public view override tradeExists(tradeId) returns (Trade memory) {
        return trades[tradeId];
    }

    function getTradeCounter() external view returns (uint256) {
        return tradeCounter;
    }

}