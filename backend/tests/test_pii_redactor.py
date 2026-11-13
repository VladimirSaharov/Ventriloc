from pathlib import Path
from app.services.parser import parse_document_bytes
from app.services.pii_redactor import redact_pii

ROOT_DIR = Path(__file__).resolve().parents[2]


def test_redact_synthetic_pii():
    sample = (
        "ФИО: Соколов Дмитрий Сергеевич\n"
        "Телефон: +7 (999) 123-45-67\n"
        "Email: dmitry.sokolov@example.com\n"
        "Telegram: @dsokolov_dev https://t.me/dsokolov_dev\n"
        "Дата рождения: 12.04.1995\n"
        "Адрес: ул. Академическая, д. 10, кв. 42\n"
        "Опыт работы: Frontend-разработчик (Vue 3, Tailwind CSS) — 3 года.\n"
    )
    report = redact_pii(sample, filename="resume.txt", enabled=True)
    assert "Соколов" not in report.redacted_text
    assert "+7 (999) 123-45-67" not in report.redacted_text
    assert "dmitry.sokolov@example.com" not in report.redacted_text
    assert "@dsokolov_dev" not in report.redacted_text
    assert "12.04.1995" not in report.redacted_text
    assert "ул. Академическая" not in report.redacted_text
    assert "Frontend-разработчик" in report.redacted_text
    assert report.total_masked >= 6


def test_redact_real_case_resumes_names():
    expected_hidden = {
        "Иванов Алексей_резюме 1.docx": ["Иванов", "Алексей", "25 лет"],
        "Петров Иван_резюме 2.docx": ["Петров", "Иван", "45 лет"],
        "Семенов Алексей _резюме 3.docx": ["Семенов", "Алексей"],
        "Петрова Лилия_резюме 4.docx": ["Петрова", "Лилия"],
    }
    resumes_dir = ROOT_DIR / "4 резюме кондидатов"
    for fname, tokens in expected_hidden.items():
        parsed = parse_document_bytes(fname, (resumes_dir / fname).read_bytes())
        assert parsed.is_valid
        report = redact_pii(parsed.text, filename=fname, enabled=True)
        for tok in tokens:
            assert tok not in report.redacted_text, f"PII token '{tok}' leaked in {fname}"
        assert "[CANDIDATE_NAME]" in report.redacted_text
