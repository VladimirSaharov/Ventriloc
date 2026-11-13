from pathlib import Path
from app.services.parser import parse_document_bytes

ROOT_DIR = Path(__file__).resolve().parents[2]


def test_parse_real_vacancies():
    for idx in (1, 2, 3):
        path = ROOT_DIR / f"Вакансия {idx}.docx"
        assert path.exists(), f"Missing {path}"
        parsed = parse_document_bytes(path.name, path.read_bytes())
        assert parsed.is_valid, f"Failed parsing {path.name}: {parsed.error}"
        assert parsed.char_count > 300


def test_parse_real_resumes():
    resumes_dir = ROOT_DIR / "4 резюме кондидатов"
    files = list(resumes_dir.glob("*.docx"))
    assert len(files) == 4
    for path in files:
        parsed = parse_document_bytes(path.name, path.read_bytes())
        assert parsed.is_valid, f"Failed parsing {path.name}: {parsed.error}"
        assert parsed.char_count > 300


def test_parse_empty_and_corrupted_files():
    empty = parse_document_bytes("empty.docx", b"")
    assert not empty.is_valid
    assert "пуст" in (empty.error or "").lower()

    corrupted_docx = parse_document_bytes("broken.docx", b"not a zip archive at all")
    assert not corrupted_docx.is_valid
    assert "docx" in (corrupted_docx.error or "").lower()

    bad_pdf = parse_document_bytes("broken.pdf", b"not a pdf")
    assert not bad_pdf.is_valid
    assert "pdf" in (bad_pdf.error or "").lower()

    binary_txt = parse_document_bytes("binary.txt", b"\x00\x01\x02\x03")
    assert not binary_txt.is_valid

    unsupported = parse_document_bytes("archive.exe", b"MZ...")
    assert not unsupported.is_valid
    assert "неподдерживаемый" in (unsupported.error or "").lower()
