//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITradeManager {

    enum TradeStatus {
        Created,
        Accepted,
        Funded,
        Shipped,
        Completed,
        Cancelled,
        Disputed
    }

    struct Trade {
        uint256 tradeId;
        address importer;
        address exporter;
        uint256 amount;
        uint256 createdAt;
        uint256 deadlineAt;
        bytes32 documentHash;
        TradeStatus status;
    }

    function getTrade(uint256 tradeId) external view returns(Trade memory);
}