import base64
from pathlib import Path

import pytest
from eth_hash.auto import keccak
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


PDF_BYTES = b"%PDF-1.7\nTradeChain test invoice\n%%EOF"
API_KEY = "test-api-key-for-unit-tests"


@pytest.fixture

def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(settings, "api_key", API_KEY)
    monkeypatch.setattr(settings, "storage_provider", "local")
    monkeypatch.setattr(settings, "local_storage_dir", tmp_path)
    monkeypatch.setattr(
        settings,
        "document_encryption_key",
        base64.urlsafe_b64encode(b"T" * 32).decode("ascii"),
    )
    monkeypatch.setattr(settings, "max_upload_bytes", 1024)
    with TestClient(app) as test_client:
        yield test_client


def post_upload(
    client: TestClient,
    *,
    content: bytes = PDF_BYTES,
    filename: str = "invoice.pdf",
    content_type: str = "application/pdf",
    document_type: str = "Invoice",
    trade_id: str = "7",
    headers: dict[str, str] | None = None,
):
    request_headers = {"X-API-Key": API_KEY}
    if headers:
        request_headers.update(headers)

    return client.post(
        "/api/v1/documents/upload",
        headers=request_headers,
        data={"trade_id": trade_id, "document_type": document_type},
        files={"file": (filename, content, content_type)},
    )


def test_upload_encrypts_document_and_returns_keccak_hash(
    client: TestClient,
    tmp_path: Path,
) -> None:
    response = post_upload(client)

    assert response.status_code == 201, response.text
    body = response.json()
    expected_hash = "0x" + keccak(PDF_BYTES).hex()

    assert body["trade_id"] == 7
    assert body["document_type"] == "Invoice"
    assert body["document_type_index"] == 0
    assert body["content_hash"] == expected_hash
    assert body["storage_provider"] == "local"
    assert body["encryption_format"] == "TCENC1/AES-256-GCM"
    assert body["original_size_bytes"] == len(PDF_BYTES)

    local_blob = tmp_path / f"{body['cid']}.bin"
    assert local_blob.exists()
    encrypted = local_blob.read_bytes()
    assert encrypted.startswith(b"TCENC1")
    assert PDF_BYTES not in encrypted
    assert body["encrypted_size_bytes"] == len(encrypted)


def test_upload_requires_api_key(client: TestClient) -> None:
    response = client.post(
        "/api/v1/documents/upload",
        data={"trade_id": "7", "document_type": "Invoice"},
        files={"file": ("invoice.pdf", PDF_BYTES, "application/pdf")},
    )
    assert response.status_code == 401


def test_upload_rejects_wrong_api_key(client: TestClient) -> None:
    response = post_upload(client, headers={"X-API-Key": "wrong-key"})
    assert response.status_code == 401


def test_upload_rejects_empty_file(client: TestClient) -> None:
    response = post_upload(client, content=b"")
    assert response.status_code == 400


def test_upload_rejects_unsupported_file_content(client: TestClient) -> None:
    response = post_upload(
        client,
        content=b"not a PDF, JPEG, or PNG",
        filename="invoice.pdf",
    )
    assert response.status_code == 415


def test_upload_rejects_mismatched_content_type(client: TestClient) -> None:
    response = post_upload(client, content_type="image/png")
    assert response.status_code == 415


def test_upload_rejects_file_over_size_limit(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "max_upload_bytes", 16)
    response = post_upload(client, content=PDF_BYTES)
    assert response.status_code == 413


def test_upload_rejects_unknown_document_type(client: TestClient) -> None:
    response = post_upload(client, document_type="CustomDocumentType")
    assert response.status_code == 422


def test_upload_returns_service_unavailable_without_encryption_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "document_encryption_key", "")
    response = post_upload(client)
    assert response.status_code == 503
    assert response.json()["detail"] == "Document encryption is not configured correctly."


def test_pinata_provider_requires_jwt(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "storage_provider", "pinata")
    monkeypatch.setattr(settings, "pinata_jwt", "")
    response = post_upload(client)
    assert response.status_code == 503
    assert response.json()["detail"] == "Document storage is not configured correctly."
