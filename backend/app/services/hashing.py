from eth_hash.auto import keccak


def keccak256_hex(data: bytes) -> str:
    """Return Ethereum Keccak-256 as a 0x-prefixed 32-byte hex string.

    This matches Solidity's keccak256(data). It is intentionally not Python's
    hashlib.sha3_256, which uses the standardized SHA-3 padding variant.
    """
    return "0x" + keccak(data).hex()
