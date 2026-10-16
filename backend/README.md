# TradeChain Backend — Commit 8

FastAPI document-ingestion service for TradeChain. It checks PDF/JPEG/PNG file signatures, calculates Ethereum Keccak-256 over the original file bytes, encrypts the bytes with AES-256-GCM, and stores the encrypted payload locally or through Pinata.

## Local setup (Windows PowerShell)

```powershell
cd E:\TradeChain\backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Generate secrets and paste the resulting values into `.env`:

```powershell
.\.venv\Scripts\python.exe -c "import base64,secrets; print('DOCUMENT_ENCRYPTION_KEY='+base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()); print('API_KEY='+secrets.token_urlsafe(32))"
```

Leave `STORAGE_PROVIDER=local` for the first run. Start the API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs`, click Authorize for the `X-API-Key` header, and enter the `API_KEY` from `.env`. Upload a PDF, JPEG, or PNG to `POST /api/v1/documents/upload` with `trade_id` and a `document_type` from the API enum.

Run tests:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## Pinata

To use Pinata, create a scoped API key/JWT in Pinata, then set `STORAGE_PROVIDER=pinata`, `PINATA_JWT`, and `PINATA_NETWORK=private` (or `public` only when intentionally making encrypted blobs public). Restart the API after editing `.env`.

## Important limitations

- `local-*` identifiers are local development identifiers, **not real IPFS CIDs**. Do not register them on-chain.
- The API key is temporary development protection, not wallet authentication. Do not expose it in browser code.
- This endpoint does not verify trade participants against the blockchain or submit `DocumentRegistry.registerDocument()`. The user's wallet must do the on-chain registration; trade/wallet authorization integration is a later commit.
- Keep `.env` private. For production, use a managed key service and per-document/per-tenant key management rather than a shared environment encryption key.
