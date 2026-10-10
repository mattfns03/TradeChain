// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IEscrow.sol";
import "../interfaces/ITradeManager.sol";

contract Escrow is Ownable, ReentrancyGuard, IEscrow{
    using SafeERC20 for IERC20;

    // =============================================================
    //                              ERRORS
    // =============================================================

    error InvalidAddress();
    error Unauthorized();
    error InvalidTradeState();
    error InvalidAlreadyFunded();
    error TradeNotFound();
    error EscrowAlreadySettled();
    error TransferAmountMismatch();

    // =============================================================
    //                         STATE VARIABLES
    // =============================================================

    ITradeManager public immutable tradeManager;
    IERC20 public immutable settlementToken;

    mapping(uint256 => EscrowDeposit) private escrows;

    // =============================================================
    //                              EVENTS
    // =============================================================

    event EscrowDeposited(uint256 indexed tradeId, address indexed importer, uint256 amount);
    event FundsReleased(uint256 indexed tradeId, address indexed exporter, uint256 amount);
    event FundsRefunded(uint256 indexed tradeId, address indexed importer, uint256 amount);

    // =============================================================
    //                           CONSTRUCTOR
    // =============================================================

    constructor(address initialOwner, address tradeManagerAddress, address settlementTokenAddress) Ownable(initialOwner) {
        if(tradeManagerAddress == address(0)) {
            revert InvalidAddress();
        }

        if(settlementTokenAddress == address(0)) {
            revert InvalidAddress();
        }

        tradeManager = ITradeManager(tradeManagerAddress);
        settlementToken = IERC20(settlementTokenAddress);
    }

    // =============================================================
    //                         DEPOSIT FUNDS
    // =============================================================

    function deposit(uint256 tradeId) external override nonReentrant {
        ITradeManager.Trade memory trade = tradeManager.getTrade(tradeId);

        if(trade.status != ITradeManager.TradeStatus.Accepted) {
            revert InvalidTradeState();
        }

        if(msg.sender != trade.importer) {
            revert Unauthorized();
        }

        EscrowDeposit storage escrow = escrows[tradeId];

        if(escrow.funded) {
            revert InvalidAlreadyFunded();
        }

        escrow.tradeId = tradeId;
        escrow.importer = trade.importer;
        escrow.exporter = trade.exporter;
        escrow.amount = trade.amount;
        escrow.funded = true;
        escrow.released = false;
        escrow.refunded = false;

        uint256 balanceBefore = settlementToken.balanceOf(address(this));

        settlementToken.safeTransferFrom(msg.sender, address(this), trade.amount);

        uint256 balanceAfter = settlementToken.balanceOf(address(this));

        if(balanceAfter < balanceBefore || balanceAfter - balanceBefore != trade.amount) {
            revert TransferAmountMismatch();
        }

        tradeManager.markTradeFunded(tradeId);

        emit EscrowDeposited(tradeId, trade.importer, trade.amount);
    }

    // =============================================================
    //                         RELEASE FUNDS
    // =============================================================

    function releaseFunds(uint256 tradeId) external override nonReentrant {
        ITradeManager.Trade memory trade = tradeManager.getTrade(tradeId);

        if(trade.status != ITradeManager.TradeStatus.Shipped) {
            revert InvalidTradeState();
        }

        EscrowDeposit storage escrow = escrows[tradeId];

        if(!escrow.funded) {
            revert TradeNotFound();
        }

        if(escrow.released || escrow.refunded) {
            revert EscrowAlreadySettled();
        }

        escrow.released = true;

        settlementToken.safeTransfer(escrow.exporter, escrow.amount);
        tradeManager.markTradeCompleted(tradeId);
        emit FundsReleased(tradeId, escrow.exporter, escrow.amount);
    }

    // =============================================================
    //                           REFUND FUNDS
    // =============================================================

    function refund(uint256 tradeId) external override onlyOwner nonReentrant {
        ITradeManager.Trade memory trade = tradeManager.getTrade(tradeId);

        if(trade.status != ITradeManager.TradeStatus.Disputed) {
            revert InvalidTradeState();
        }

        EscrowDeposit storage escrow = escrows[tradeId];

        if(escrow.funded == false) {
            revert TradeNotFound();
        }

        if(escrow.released || escrow.refunded) {
            revert EscrowAlreadySettled();
        }

        escrow.refunded = true;

        settlementToken.safeTransfer(escrow.importer, escrow.amount);

        tradeManager.markTradeRefunded(tradeId);

        emit FundsRefunded(tradeId, escrow.importer, escrow.amount);
    }

    // =============================================================
    //                         VIEW FUNCTIONS
    // =============================================================

    function getEscrow(uint256 tradeId) external view override returns(EscrowDeposit memory) {
        return escrows[tradeId];
    }

    function getEscrowBalance() external view override returns(uint256) {
        return settlementToken.balanceOf(address(this));
    }

}