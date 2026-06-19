TradeChain System Design

Objective

TradeChain is a blockchain-based trade finance platform that enables importers and exporters to conduct international trade using smart contract escrow, decentralized document storage, and shipment verification.

---

# Actors

# Importer

* Creates trade agreements
* Funds escrow
* Receives shipment

# Exporter

* Accepts trade agreements
* Ships goods
* Receives payment

# Oracle

* Verifies shipment status
* Updates trade status

# Arbitrator (Future)

* Resolves disputes
* Participates in DAO governance

---

# Trade Lifecycle

1. Importer creates trade
2. Exporter accepts trade
3. Importer funds escrow
4. Exporter uploads shipping documents
5. Oracle verifies shipment
6. Escrow releases funds
7. Trade completes

---

# On-Chain Data

* Trade ID
* Wallet addresses
* Escrow amount
* Trade status
* Document hashes

# Off-Chain Data

* Company information
* Contact information
* Shipment metadata
* Audit logs
* Uploaded documents

# Tech Stack 

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

# Trade Lifecycle :

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