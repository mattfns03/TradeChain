//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEscrow {
    struct EscrowDeposit {
        uint256 tradeId;
        address importer;
        address exporter;
        uint256 amount;
        bool funded;
        bool released;
        bool refunded;
    }

    function deposit(uint256 tradeId) external;

    function releaseFunds(uint256 tradeId) external;

    function refund(uint256 tradeId) external;

    function getEscrow(uint256 tradeId) external view returns(EscrowDeposit memory);

    function getEscrowBalance() external view returns(uint256);
}