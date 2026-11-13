from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Resume & Vacancy Comparator"
    app_env: str = "development"

    # LLM Provider settings
    llm_provider: Literal["gigachat", "openai", "mock"] = "gigachat"
    llm_timeout_seconds: float = 90.0
    llm_max_retries: int = 4
    llm_concurrency: int = 1

    # GigaChat API settings
    gigachat_auth_key: str = ""
    gigachat_scope: str = "GIGACHAT_API_PERS"
    gigachat_model: str = "GigaChat-3-Ultra"
    gigachat_oauth_url: str = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    gigachat_api_url: str = "https://api.giga.chat/v1/chat/completions"
    gigachat_verify_ssl: bool = False
    gigachat_ca_bundle: str = ""

    # Generic OpenAI-compatible settings (optional fallback/alternative)
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"

    # Privacy & Reliability
    pii_redaction_enabled: bool = True
    max_file_size_mb: int = 10
    max_document_chars: int = 45000

    # Paths for built-in case samples
    case_samples_dir: str = ""

    def resolve_samples_root(self) -> Path:
        if self.case_samples_dir:
            return Path(self.case_samples_dir)
        docker_samples = Path("/app/samples")
        if docker_samples.exists():
            return docker_samples
        # Local repo root (two levels up from backend/app/config.py)
        return Path(__file__).resolve().parents[2]


settings = Settings()
