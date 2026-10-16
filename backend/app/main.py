from fastapi import FastAPI

from app.api.documents import router as documents_router
from app.config import settings


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "TradeChain document-ingestion API. Uploaded documents are hashed, "
        "encrypted, and stored off-chain; wallet-based on-chain registration "
        "is handled by the client in a later integration step."
    ),
)

app.include_router(documents_router)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "tradechain-backend"}
