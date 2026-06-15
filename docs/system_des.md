Tech Stack 

Smart Contracts :
Solidity
Hardhat
OpenZeppelin

Frontend :
Next.js
TypeScript
Tailwind
Wagmi
Viem
RainbowKit

Backend :
FastAPI
PostgreSQL
SQLAlchemy

Storage : 
IPFS
Pinata


Define the MVP Workflow
Actors :

Importer
Creates trade request.

Exporter
Accepts trade request.

Oracle
Confirms shipment.


Trade Lifecycle :

Trade Created
      │
      ▼
Trade Accepted
      │
      ▼
Escrow Funded
      │
      ▼
Shipment Confirmed
      │
      ▼
Funds Released
      │
      ▼
Trade Completed


On-Chain : 
Trade ID
Wallet Addresses
Escrow Amount
Trade Status
Document Hashes

Off-Chain :
Company Name
Email
Phone
Invoices
PDF Documents
Audit Logs