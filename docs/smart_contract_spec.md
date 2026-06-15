Trade Structure

struct Trade {
    uint256 tradeId;
    address importer;
    address exporter;
    uint256 amount;
    uint256 createdAt;
    uint256 deadline;
    TradeStatus status;
}

Trade Status Enum

enum TradeStatus {
    Created,
    Accepted,
    Funded,
    Shipped,
    Completed,
    Cancelled
}

Contract : TradeManager
Functions -> createTrade()
             acceptTrade()
             getTrade()
For: 
Create Trade
Accept Trade
Update Status
View Trade

Contract : Escrow
Functions -> deposit()
             releaseFunds()
             refund()
For:
Deposit Funds
Release Funds
Refund