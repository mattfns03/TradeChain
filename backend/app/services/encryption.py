import base64
import binascii
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


MAGIC = b"TCENC1"
TRADE_ID_LENGTH = 32
NONCE_LENGTH = 12
ENCRYPTION_FORMAT = "TCENC1/AES-256-GCM"


class EncryptionConfigurationError(ValueError):
    """Raised when the document encryption key is missing or malformed."""


def _decode_encryption_key(encoded_key: str) -> bytes:
    if not encoded_key:
        raise EncryptionConfigurationError(
            "Document encryption is not configured. Set DOCUMENT_ENCRYPTION_KEY."
        )

    try:
        key = base64.urlsafe_b64decode(encoded_key.encode("ascii"))
    except (UnicodeEncodeError, binascii.Error, ValueError) as exc:
        raise EncryptionConfigurationError(
            "DOCUMENT_ENCRYPTION_KEY must be URL-safe Base64 for a 32-byte key."
        ) from exc

    if len(key) != 32:
        raise EncryptionConfigurationError(
            "DOCUMENT_ENCRYPTION_KEY must decode to exactly 32 bytes."
        )

    return key


def encrypt_document(plaintext: bytes, trade_id: int, encoded_key: str) -> bytes:
    """Encrypt a document with AES-256-GCM and return a self-describing blob.

    Blob layout:
      MAGIC (6 bytes) || trade_id (32-byte big-endian) || nonce (12 bytes)
      || AES-GCM ciphertext and authentication tag

    The trade ID is authenticated as additional data. The key is never included
    in the returned payload. This format is versioned for later decryption.
    """
    if not 0 <= trade_id < (1 << 256):
        raise ValueError("trade_id must fit in uint256")

    key = _decode_encryption_key(encoded_key)
    trade_id_bytes = trade_id.to_bytes(TRADE_ID_LENGTH, byteorder="big")
    nonce = os.urandom(NONCE_LENGTH)
    associated_data = MAGIC + trade_id_bytes

    ciphertext = AESGCM(key).encrypt(nonce, plaintext, associated_data)
    return MAGIC + trade_id_bytes + nonce + ciphertext
