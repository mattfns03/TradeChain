// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITradeManager.sol";

contract TradeManager is Ownable, ReentrancyGuard, ITradeManager {

    // =============================================================
    //                              ERRORS
    // =============================================================

    error TradeNotFound();
    error InvalidExporter();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidAddress();
    error Unauthorized();
    error InvalidTradeState();


    // =============================================================
    //                         STATE VARIABLES
    // =============================================================

    uint256 private tradeCounter;

    address public escrowContract;
    address public oracleContract;

    mapping(uint256 => Trade) private trades;


    // =============================================================
    //                              EVENTS
    // =============================================================

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

    event TradeAccepted(
        uint256 indexed tradeId
    );

    event TradeCancelled(
        uint256 indexed tradeId
    );


    // =============================================================
    //                             MODIFIERS
    // =============================================================

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


    // =============================================================
    //                           CONSTRUCTOR
    // =============================================================

    constructor(
        address initialOwner
    )
        Ownable(initialOwner)
    {}


    // =============================================================
    //                       TRADE CREATION
    // =============================================================

    function createTrade(
        address exporter,
        uint256 amount,
        uint256 deadline,
        bytes32 documentHash
    )
        external
        nonReentrant
    {
        _validateTradeCreation(
            exporter,
            amount,
            deadline
        );

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


    // =============================================================
    //                       TRADE ACCEPTANCE
    // =============================================================

    function acceptTrade(
        uint256 tradeId
    )
        external
        tradeExists(tradeId)
    {
        Trade storage trade = trades[tradeId];

        if (msg.sender != trade.exporter) {
            revert Unauthorized();
        }

        _validateTradeState(
            trade,
            TradeStatus.Created
        );

        _updateTradeStatus(
            tradeId,
            TradeStatus.Accepted
        );

        emit TradeAccepted(tradeId);
    }


    // =============================================================
    //                      TRADE CANCELLATION
    // =============================================================

    function cancelTrade(
        uint256 tradeId
    )
        external
        tradeExists(tradeId)
    {
        Trade storage trade = trades[tradeId];

        if (msg.sender != trade.importer) {
            revert Unauthorized();
        }

        _validateTradeState(
            trade,
            TradeStatus.Created
        );

        _updateTradeStatus(
            tradeId,
            TradeStatus.Cancelled
        );

        emit TradeCancelled(tradeId);
    }


    // =============================================================
    //                  CONTRACT CONFIGURATION
    // =============================================================

    function setEscrowContract(
        address escrow
    )
        external
        onlyOwner
    {
        if (escrow == address(0)) {
            revert InvalidAddress();
        }

        escrowContract = escrow;
    }

    function setOracleContract(
        address oracle
    )
        external
        onlyOwner
    {
        if (oracle == address(0)) {
            revert InvalidAddress();
        }

        oracleContract = oracle;
    }


    // =============================================================
    //                    ESCROW STATE HOOKS
    // =============================================================

    function markTradeFunded(
        uint256 tradeId
    )
        external
        onlyEscrow
        tradeExists(tradeId)
    {
        _updateTradeStatus(
            tradeId,
            TradeStatus.Funded
        );
    }

    function markTradeCompleted(
        uint256 tradeId
    )
        external
        onlyEscrow
        tradeExists(tradeId)
    {
        _updateTradeStatus(
            tradeId,
            TradeStatus.Completed
        );
    }

    function markTradeRefunded(
        uint256 tradeId
    )
        external
        onlyEscrow
        tradeExists(tradeId)
    {
        _updateTradeStatus(
            tradeId,
            TradeStatus.Refunded
        );
    }


    // =============================================================
    //                    ORACLE STATE HOOKS
    // =============================================================

    function markTradeShipped(
        uint256 tradeId
    )
        external
        onlyOracle
        tradeExists(tradeId)
    {
        _updateTradeStatus(
            tradeId,
            TradeStatus.Shipped
        );
    }

    function markTradeDisputed(
        uint256 tradeId
    )
        external
        onlyOracle
        tradeExists(tradeId)
    {
        _updateTradeStatus(
            tradeId,
            TradeStatus.Disputed
        );
    }


    // =============================================================
    //                         VIEW FUNCTIONS
    // =============================================================

    function getTrade(
        uint256 tradeId
    )
        public
        view
        override
        tradeExists(tradeId)
        returns (Trade memory)
    {
        return trades[tradeId];
    }

    function getTradeCounter()
        external
        view
        returns (uint256)
    {
        return tradeCounter;
    }


    // =============================================================
    //                    INTERNAL VALIDATION
    // =============================================================

    function _validateTradeCreation(
        address exporter,
        uint256 amount,
        uint256 deadline
    )
        internal
        view
    {
        if (exporter == address(0)) {
            revert InvalidExporter();
        }

        if (exporter == msg.sender) {
            revert InvalidExporter();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        if (deadline <= block.timestamp) {
            revert InvalidDeadline();
        }
    }

    function _validateTradeState(
        Trade storage trade,
        TradeStatus expected
    )
        internal
        view
    {
        if (trade.status != expected) {
            revert InvalidTradeState();
        }
    }


    // =============================================================
    //                    STATE MACHINE
    // =============================================================

    function _updateTradeStatus(
        uint256 tradeId,
        TradeStatus newStatus
    )
        internal
    {
        TradeStatus currentStatus =
            trades[tradeId].status;

        if (
        currentStatus == TradeStatus.Completed ||
        currentStatus == TradeStatus.Cancelled ||
        currentStatus == TradeStatus.Refunded
        ) {
            revert InvalidTradeState();
        }
        
        bool validTransition;

        if (currentStatus == TradeStatus.Created) {

            validTransition =
                newStatus == TradeStatus.Accepted ||
                newStatus == TradeStatus.Cancelled;

        } else if (currentStatus == TradeStatus.Accepted) {

            validTransition =
                newStatus == TradeStatus.Funded;

        } else if (currentStatus == TradeStatus.Funded) {

            validTransition =
                newStatus == TradeStatus.Shipped ||
                newStatus == TradeStatus.Disputed;

        } else if (currentStatus == TradeStatus.Shipped) {

            validTransition =
                newStatus == TradeStatus.Completed;

        } else if (currentStatus == TradeStatus.Disputed) {

            validTransition =
                newStatus == TradeStatus.Completed ||
                newStatus == TradeStatus.Refunded;
        }

        if (!validTransition) {
            revert InvalidTradeState();
        }

        emit TradeStatusUpdated(
            tradeId,
            currentStatus,
            newStatus
        );

        trades[tradeId].status = newStatus;
    }
}