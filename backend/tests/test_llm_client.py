import pytest

from app.config import settings
from app.services.llm_client import GigaChatClient, LLMClientError, extract_json_object


def test_extract_json_from_fences_and_noise():
    raw = 'Вот результат анализа:\n```json\n{"title": "Frontend", "items": [1, 2,],}\n```\nСпасибо.'
    parsed = extract_json_object(raw)
    assert parsed["title"] == "Frontend"
    assert parsed["items"] == [1, 2]


def test_gigachat_missing_key_error(monkeypatch):
    monkeypatch.setattr(settings, "gigachat_auth_key", "")
    client = GigaChatClient()
    with pytest.raises(LLMClientError):
        client._auth_header_value()


def test_gigachat_auth_header_normalization(monkeypatch):
    monkeypatch.setattr(settings, "gigachat_auth_key", "abc123base64==")
    client = GigaChatClient()
    assert client._auth_header_value() == "Basic abc123base64=="

    monkeypatch.setattr(settings, "gigachat_auth_key", "Basic xyz789==")
    assert client._auth_header_value() == "Basic xyz789=="
