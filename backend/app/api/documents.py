import hmac
from enum import Enum
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Security,
    UploadFile,
    status,
)
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from app.config import settings
from app.services.encryption import (
    ENCRYPTION_FORMAT,
    EncryptionConfigurationError,
    encrypt_document,
)
from app.services.hashing import keccak256_hex
from app.services.storage import (
    StorageConfigurationError,
    StorageUploadError,
    store_encrypted_document,
)


router = APIRouter(prefix="/api/v1/documents", tags=["documents"])
api_key_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)


class DocumentTypeName(str, Enum):
    Invoice = "Invoice"
    BillOfLading = "BillOfLading"
    CertificateOfOrigin = "CertificateOfOrigin"
    PackingList = "PackingList"
    InspectionCertificate = "InspectionCertificate"
    Other = "Other"


DOCUMENT_TYPE_INDEX = {
    DocumentTypeName.Invoice: 0,
    DocumentTypeName.BillOfLading: 1,
    DocumentTypeName.CertificateOfOrigin: 2,
    DocumentTypeName.PackingList: 3,
    DocumentTypeName.InspectionCertificate: 4,
    DocumentTypeName.Other: 5,
}


class UploadDocumentResponse(BaseModel):
    trade_id: int
    document_type: DocumentTypeName
    document_type_index: int
    filename: str
    media_type: str
    cid: str
    content_hash: str
    original_size_bytes: int
    encrypted_size_bytes: int
    storage_provider: str
    encryption_format: str


def require_api_key(api_key: Annotated[str | None, Security(api_key_scheme)]) -> None:
    """Temporary development API-key protection; not wallet authentication."""
    expected = settings.api_key
    if not expected or not api_key or not hmac.compare_digest(api_key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key.",
        )


def _safe_display_filename(filename: str | None) -> str:
    # Treat both slash conventions as separators regardless of host OS.
    cleaned = (filename or "document").replace("\\", "/").split("/")[-1]
    cleaned = cleaned.replace("\x00", "")[:120]
    return cleaned or "document"


def _validate_document_bytes(
    filename: str,
    declared_content_type: str | None,
    content: bytes,
) -> str:
    """Allow PDF/JPEG/PNG only and check basic file signatures."""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if content.startswith(b"%PDF-"):
        media_type, valid_extensions = "application/pdf", {"pdf"}
    elif content.startswith(b"\xff\xd8\xff"):
        media_type, valid_extensions = "image/jpeg", {"jpg", "jpeg"}
    elif content.startswith(b"\x89PNG\r\n\x1a\n"):
        media_type, valid_extensions = "image/png", {"png"}
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file content. Upload a PDF, JPEG, or PNG document.",
        )

    if extension not in valid_extensions:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The filename extension does not match the file content.",
        )

    if declared_content_type and declared_content_type not in {
        media_type,
        "application/octet-stream",
    }:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The declared content type does not match the file content.",
        )

    return media_type


@router.post(
    "/upload",
    response_model=UploadDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
async def upload_document(
    file: Annotated[UploadFile, File(description="PDF, JPEG, or PNG document")],
    trade_id: Annotated[int, Form(ge=0, le=(1 << 256) - 1)],
    document_type: Annotated[DocumentTypeName, Form()],
) -> UploadDocumentResponse:
    """Encrypt a trade document, store it, and return hash/CID for wallet use.

    This endpoint does not register the CID on-chain. The participant's wallet
    submits DocumentRegistry.registerDocument() in a later integration step.
    """
    try:
        max_upload_bytes = settings.max_upload_bytes
        if max_upload_bytes <= 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="MAX_UPLOAD_BYTES must be positive.",
            )

        content = await file.read(max_upload_bytes + 1)
    finally:
        await file.close()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    if len(content) > max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"File exceeds the {max_upload_bytes}-byte upload limit.",
        )

    display_filename = _safe_display_filename(file.filename)
    media_type = _validate_document_bytes(
        display_filename,
        file.content_type,
        content,
    )

    # Match Solidity keccak256 over the original plaintext file bytes.
    content_hash = keccak256_hex(content)

    try:
        encrypted_payload = encrypt_document(
            plaintext=content,
            trade_id=trade_id,
            encoded_key=settings.document_encryption_key,
        )
    except EncryptionConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document encryption is not configured correctly.",
        ) from exc

    try:
        receipt = await store_encrypted_document(
            payload=encrypted_payload,
            trade_id=trade_id,
        )
    except StorageConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document storage is not configured correctly.",
        ) from exc
    except StorageUploadError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Document storage upload failed.",
        ) from exc

    return UploadDocumentResponse(
        trade_id=trade_id,
        document_type=document_type,
        document_type_index=DOCUMENT_TYPE_INDEX[document_type],
        filename=display_filename,
        media_type=media_type,
        cid=receipt.cid,
        content_hash=content_hash,
        original_size_bytes=len(content),
        encrypted_size_bytes=len(encrypted_payload),
        storage_provider=receipt.provider,
        encryption_format=ENCRYPTION_FORMAT,
    )
