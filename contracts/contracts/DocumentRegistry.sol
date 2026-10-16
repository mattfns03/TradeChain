// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/ITradeManager.sol";

contract DocumentRegistry {
    // =============================================================
    //                              ERRORS
    // =============================================================

    error InvalidAddress();
    error Unauthorized();
    error InvalidCID();
    error InvalidContentHash();
    error DocumentNotFound();
    error DocumentAlreadyRevoked();
    error TradeNotFound();

    // =============================================================
    //                         DOCUMENT TYPES
    // =============================================================

    enum DocumentType {
        Invoice,
        BillOfLading,
        CertificateOfOrigin,
        PackingList,
        InspectionCertificate,
        Other
    }

    // =============================================================
    //                         DATA STRUCTURES
    // =============================================================

    struct Document {
        uint256 documentId;
        uint256 tradeId;
        address uploader;
        DocumentType documentType;
        string cid;
        bytes32 contentHash;
        uint256 uploadedAt;
        bool revoked;
        uint256 revokedAt;
    }

    // =============================================================
    //                         STATE VARIABLES
    // =============================================================

    ITradeManager public immutable tradeManager;
    uint256 private documentCounter;
    mapping(uint256 => Document) private documents;
    mapping(uint256 => uint256[]) private tradeDocumentsIds;
    uint256 public constant MAX_CID_LENGTH = 128;

    // =============================================================
    //                              EVENTS
    // =============================================================

    event DocumentRegistered(
        uint256 indexed documentId,
        uint256 indexed tradeId,
        address indexed uploader,
        DocumentType documentType,
        string cid,
        bytes32 contentHash
    );

    event DocumentRevoked(
        uint256 indexed documentId,
        uint256 indexed tradeId,
        address indexed revoker
    );

    // =============================================================
    //                           CONSTRUCTOR
    // =============================================================

    constructor(address tradeManagerAddress) {
        if(tradeManagerAddress == address(0) || tradeManagerAddress.code.length == 0) {
            revert InvalidAddress();
        }
        tradeManager = ITradeManager(tradeManagerAddress);
    }

    // =============================================================
    //                       REGISTER DOCUMENT
    // =============================================================

    /// @notice Registers a document reference for an existing trade.
    /// @dev The document itself remains off-chain.
    /// @param tradeId ID of the associated trade.
    /// @param documentType Category of the document.
    /// @param cid IPFS content identifier.
    /// @param contentHash Keccak-256 hash of the document bytes.
    /// @return documentId Newly assigned document ID.

    function registerDocument(
        uint256 tradeId,
        DocumentType documentType,
        string calldata cid,
        bytes32 contentHash
    )
    external
    returns(uint256 documentId) {
        ITradeManager.Trade memory trade = tradeManager.getTrade(tradeId);
        // Only importer or exporter may register documents
        if(msg.sender != trade.importer && msg.sender != trade.exporter) {
            revert Unauthorized();
        }

        // Validate the IPFS reference
        uint256 cidLength = bytes(cid).length;

        if(cidLength == 0 || cidLength > MAX_CID_LENGTH) {
            revert InvalidCID();
        }

        //Reject an empty content Hash

        if(contentHash == bytes32(0)){
            revert InvalidContentHash();
        }

        documentId = documentCounter;

        documents[documentId] = Document({
            documentId: documentId,
            tradeId: tradeId,
            uploader: msg.sender,
            documentType: documentType,
            cid: cid,
            contentHash: contentHash,
            uploadedAt: block.timestamp,
            revoked: false,
            revokedAt: 0
        });

        tradeDocumentsIds[tradeId].push(documentId);

        documentCounter++;

        emit DocumentRegistered(
            documentId,
            tradeId,
            msg.sender,
            documentType,
            cid,
            contentHash
        );
    }

    // =============================================================
    //                        REVOKE DOCUMENT
    // =============================================================

    /// @notice Marks a document as revoked without deleting its record.
    /// @dev Only the original uploader may revoke the document.
    /// @param documentId ID of the document to revoke.

    function revokeDocument(
        uint256 documentId
    )
        external{
        if(documentId >= documentCounter) {
            revert DocumentNotFound();
        }

        Document storage document = documents[documentId];
        if(msg.sender != document.uploader) {
            revert Unauthorized();
        }
        if(document.revoked){
            revert DocumentAlreadyRevoked();
        }

        document.revoked = true;
        document.revokedAt = block.timestamp;

        emit DocumentRevoked(
            documentId,
            document.tradeId,
            msg.sender
        );
    }

    // =============================================================
    //                         READ DOCUMENT
    // =============================================================

    /// @notice Returns the complete record for a document.
    /// @param documentId ID of the document.

    function getDocument(
        uint256 documentId
    )
    external view returns(Document memory) {
        if(documentId >= documentCounter) {
            revert DocumentNotFound();
        }
        return documents[documentId];
    }

    // =============================================================
    //                    DOCUMENTS FOR A TRADE
    // =============================================================

    /// @notice Returns document IDs belonging to a trade.
    /// @param tradeId ID of the trade.

    function getDocumentForTrade(
        uint256 tradeId
    )
    external view returns(uint256[] memory) {
        ITradeManager.Trade memory trade = tradeManager.getTrade(tradeId);

        if(trade.tradeId != tradeId) {
            revert TradeNotFound();
        }

        return tradeDocumentsIds[tradeId];
    }

    // =============================================================
    //                         DOCUMENT COUNT
    // =============================================================

    /// @notice Returns the total number of documents ever registered.
    /// @dev Revoked records remain included in this count.

    function getDocumentCount() external view returns(uint256) {
        return documentCounter;
    }
}