from dataclasses import dataclass
import hashlib
import uuid

import httpx

from app.config import settings


PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files"


class StorageConfigurationError(RuntimeError):
    """Raised when the selected storage provider is not configured."""


class StorageUploadError(RuntimeError):
    """Raised when the external storage provider fails an upload."""


@dataclass(frozen=True)
class StorageReceipt:
    cid: str
    provider: str


async def store_encrypted_document(payload: bytes, trade_id: int) -> StorageReceipt:
    """Store encrypted document bytes locally or using Pinata.

    The local provider is for development only. Its local-* identifier is not
    an IPFS CID and must not be registered on-chain as if it were one.
    """
    if settings.storage_provider == "local":
        digest = hashlib.sha256(payload).hexdigest()
        local_id = f"local-sha256-{digest}"
        directory = settings.local_storage_dir
        directory.mkdir(parents=True, exist_ok=True)
        (directory / f"{local_id}.bin").write_bytes(payload)
        return StorageReceipt(cid=local_id, provider="local")

    if settings.storage_provider != "pinata":
        raise StorageConfigurationError("Unsupported storage provider.")

    if not settings.pinata_jwt.strip():
        raise StorageConfigurationError(
            "PINATA_JWT is required when STORAGE_PROVIDER=pinata."
        )

    generated_name = f"trade-{trade_id}-{uuid.uuid4().hex}.enc"
    headers = {"Authorization": f"Bearer {settings.pinata_jwt.strip()}"}
    form_data = {
        "network": settings.pinata_network,
        "name": generated_name,
    }
    files = {
        "file": (generated_name, payload, "application/octet-stream")
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                PINATA_UPLOAD_URL,
                headers=headers,
                data=form_data,
                files=files,
            )
            response.raise_for_status()
            response_json = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        # Don't return the provider's full error body; it may contain sensitive
        # details. The server logs can be enhanced separately if required.
        raise StorageUploadError(
            "The storage provider did not accept the upload."
        ) from exc

    data = response_json.get("data") if isinstance(response_json, dict) else None
    cid = data.get("cid") if isinstance(data, dict) else None

    if not isinstance(cid, str) or not cid:
        raise StorageUploadError(
            "The storage provider response did not contain a CID."
        )

    return StorageReceipt(cid=cid, provider="pinata")
