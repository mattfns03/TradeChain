from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "TradeChain Backend"
    api_key: str = "dev-only-change-me"
    storage_provider: Literal["local", "pinata"] = "local"
    pinata_jwt: str = ""
    pinata_network: Literal["public", "private"] = "private"
    document_encryption_key: str = ""
    max_upload_bytes: int = 10 * 1024 * 1024
    local_storage_dir: Path = Path(".local_storage")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
