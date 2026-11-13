from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_health_and_samples():
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    samples = client.get("/api/samples")
    assert samples.status_code == 200
    data = samples.json()
    assert len(data["vacancies"]) == 3
    assert len(data["resumes"]) == 4


def test_preview_pii_and_analyze_with_broken_vacancy(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "mock")
    client = TestClient(app)

    pii_res = client.post(
        "/api/preview-pii",
        data={"sample_resume": "Семенов Алексей _резюме 3.docx"},
    )
    assert pii_res.status_code == 200
    assert "Семенов" not in pii_res.json()["redacted_text"]

    # Send 1 valid sample resume + 2 sample vacancies + 1 corrupted uploaded vacancy
    analyze_res = client.post(
        "/api/analyze",
        data={
            "sample_resume": "Семенов Алексей _резюме 3.docx",
            "sample_vacancies": ["Вакансия 1.docx", "Вакансия 2.docx"],
        },
        files=[("vacancies", ("corrupted.docx", b"broken-bytes", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))],
    )
    assert analyze_res.status_code == 200
    payload = analyze_res.json()
    assert len(payload["vacancies"]) == 2
    assert len(payload["failed_vacancies"]) == 1
    assert payload["failed_vacancies"][0]["filename"] == "corrupted.docx"
    assert payload["vacancies"][0]["rank"] == 1
    assert payload["markdown_report"]
