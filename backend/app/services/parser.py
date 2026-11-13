from __future__ import annotations

import io
import re
import zipfile
from pathlib import Path
from typing import Iterable

from docx import Document as DocxDocument
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph
from pypdf import PdfReader

from app.config import settings
from app.schemas import ParsedDocument

SUPPORTED_EXTENSIONS = {".docx", ".pdf", ".txt", ".md"}


def _normalize_text(raw: str) -> str:
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    # Replace non-breaking and zero-width spaces cleanly
    text = text.replace("\xa0", " ").replace("\u200b", "").replace("\ufeff", "")
    # Collapse excessive spaces inside lines while preserving newlines
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    # Collapse >2 consecutive blank lines
    cleaned: list[str] = []
    blank_run = 0
    for line in lines:
        if not line:
            blank_run += 1
            if blank_run <= 1:
                cleaned.append("")
        else:
            blank_run = 0
            cleaned.append(line)
    return "\n".join(cleaned).strip()


def _iter_docx_blocks(doc: DocxDocument) -> Iterable[str]:
    """Iterate paragraphs and tables in exact document body order."""
    body = doc.element.body
    for child in body.iterchildren():
        if isinstance(child, CT_P):
            para = Paragraph(child, doc)
            text = para.text.strip()
            if text:
                yield text
        elif isinstance(child, CT_Tbl):
            table = Table(child, doc)
            for row in table.rows:
                seen_cells: set[int] = set()
                cells_text: list[str] = []
                for cell in row.cells:
                    # python-docx repeats merged cell references; deduplicate by underlying XML element id
                    tc_id = id(cell._tc)
                    if tc_id in seen_cells:
                        continue
                    seen_cells.add(tc_id)
                    cell_lines = [p.text.strip() for p in cell.paragraphs if p.text.strip()]
                    if cell_lines:
                        cells_text.append(" / ".join(cell_lines))
                if cells_text:
                    yield " | ".join(cells_text)


def _extract_docx(content: bytes) -> tuple[str, list[str]]:
    if not zipfile.is_zipfile(io.BytesIO(content)):
        raise ValueError("Файл не является корректным DOCX-архивом (возможно, повреждён или имеет неверный формат).")
    doc = DocxDocument(io.BytesIO(content))
    blocks = list(_iter_docx_blocks(doc))
    return "\n".join(blocks), []


def _extract_pdf(content: bytes) -> tuple[str, list[str]]:
    if not content.lstrip().startswith(b"%PDF"):
        raise ValueError("Файл не является корректным PDF-документом.")
    reader = PdfReader(io.BytesIO(content))
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception as exc:
            raise ValueError("PDF-документ защищён паролем и не может быть прочитан.") from exc
    pages_text: list[str] = []
    for page in reader.pages:
        extracted = (page.extract_text() or "").strip()
        if extracted:
            pages_text.append(extracted)
    warnings: list[str] = []
    if len(reader.pages) > 0 and not pages_text:
        raise ValueError(
            "PDF не содержит текстового слоя (вероятно, это скан/изображение). "
            "Загрузите текстовый PDF, DOCX или TXT."
        )
    if len(pages_text) < len(reader.pages):
        warnings.append(
            f"На {len(reader.pages) - len(pages_text)} из {len(reader.pages)} страниц PDF не найден текстовый слой."
        )
    return "\n\n".join(pages_text), warnings


def _extract_text_file(content: bytes) -> tuple[str, list[str]]:
    # Reject obvious binary payloads (null bytes)
    if b"\x00" in content:
        raise ValueError("Файл содержит бинарные данные и не является текстовым документом.")
    for encoding in ("utf-8", "cp1251", "utf-16", "latin-1"):
        try:
            return content.decode(encoding), []
        except UnicodeDecodeError:
            continue
    raise ValueError("Не удалось определить кодировку текстового файла.")


def parse_document_bytes(filename: str, content: bytes) -> ParsedDocument:
    """Safely parse uploaded document bytes into normalized text without raising on bad documents."""
    safe_name = Path(filename or "unnamed").name
    ext = Path(safe_name).suffix.lower()

    if not content:
        return ParsedDocument(
            filename=safe_name,
            error="Файл пуст (0 байт).",
        )

    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        return ParsedDocument(
            filename=safe_name,
            error=f"Размер файла превышает допустимый лимит ({settings.max_file_size_mb} МБ).",
        )

    if ext not in SUPPORTED_EXTENSIONS:
        return ParsedDocument(
            filename=safe_name,
            error=(
                f"Неподдерживаемый формат файла '{ext or 'без расширения'}'. "
                f"Поддерживаются: {', '.join(sorted(SUPPORTED_EXTENSIONS))}."
            ),
        )

    try:
        if ext == ".docx":
            raw_text, warnings = _extract_docx(content)
        elif ext == ".pdf":
            raw_text, warnings = _extract_pdf(content)
        else:
            raw_text, warnings = _extract_text_file(content)
    except Exception as exc:
        return ParsedDocument(
            filename=safe_name,
            error=f"Ошибка чтения документа: {exc}",
        )

    normalized = _normalize_text(raw_text)
    if not normalized or len(normalized) < 15:
        return ParsedDocument(
            filename=safe_name,
            warnings=warnings,
            error="В документе недостаточно читаемого текста (пустой или почти пустой документ).",
        )

    if len(normalized) > settings.max_document_chars:
        warnings.append(
            f"Текст документа сокращён с {len(normalized)} до {settings.max_document_chars} символов."
        )
        normalized = normalized[: settings.max_document_chars]

    return ParsedDocument(
        filename=safe_name,
        text=normalized,
        char_count=len(normalized),
        warnings=warnings,
    )
