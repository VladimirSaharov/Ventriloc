from __future__ import annotations

import re
from pathlib import Path
from app.schemas import MaskedEntity, PiiRedactionReport

# Regex patterns for sensitive PII
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(
    r"(?<!\d)(?:\+7|8|7)?[\s\-\(]*\d{3}[\s\-\)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}(?!\d)"
)
TG_HANDLE_RE = re.compile(r"(?<!\w)@[A-Za-z0-9_]{4,32}\b")
PERSONAL_URL_RE = re.compile(
    r"https?://(?:www\.)?(?:t\.me|telegram\.me|vk\.com|hh\.ru|linkedin\.com|facebook\.com|instagram\.com|ok\.ru)/[^\s,;|)]+",
    re.IGNORECASE,
)
BIRTH_DATE_RE = re.compile(
    r"(?:дата\s+рождения|родился|родилась|д\.р\.)\s*[:\-]?\s*(?:\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}|\d{1,2}\s+[а-яё]+\s+\d{4})",
    re.IGNORECASE,
)
GENDER_AGE_RE = re.compile(
    r"\b(?:мужчина|женщина)\s*,\s*\d{1,2}\s*(?:год|года|лет)\b",
    re.IGNORECASE,
)
PASSPORT_SNILS_INN_RE = re.compile(
    r"(?:паспорт\s*(?:серия|№|:)?\s*\d{2,4}[\s№]*\d{6}|снилс\s*[:№]?\s*\d{3}[\-\s]?\d{3}[\-\s]?\d{3}[\-\s]?\d{2}|инн\s*[:№]?\s*\d{10,12})",
    re.IGNORECASE,
)
STREET_ADDRESS_RE = re.compile(
    r"(?:ул\.|улица|пр-т|проспект|пер\.|переулок|б-р|бульвар|ш\.|шоссе)\s+[А-ЯЁА-ЯA-Za-z0-9.\-\s]{2,40}?,?\s*(?:д\.|дом)?\s*\d+[а-яА-Яa-zA-Z]?(?:[\s,]+кв\.?\s*\d+)?",
    re.IGNORECASE,
)
EXPLICIT_FIO_LABEL_RE = re.compile(
    r"(?im)^(?:фио|кандидат|имя|ф\.и\.о\.)\s*[:\-]\s*([А-ЯЁ][а-яё\-]+(?:\s+[А-ЯЁ][а-яё\-]+){1,2})\s*$"
)

# Common non-name words that frequently appear in top lines of resumes
NON_NAME_WORDS = {
    "резюме",
    "сопроводительное",
    "письмо",
    "контакты",
    "опыт",
    "работы",
    "образование",
    "навыки",
    "ключевые",
    "желаемая",
    "должность",
    "специалист",
    "разработчик",
    "куратор",
    "ассистент",
    "бухгалтер",
    "проживает",
    "гражданство",
    "мужчина",
    "женщина",
    "москва",
    "долгопрудный",
    "санкт-петербург",
    "россия",
    "frontend",
    "middle",
    "junior",
    "senior",
    "full",
    "stack",
    "html",
    "css",
    "vue",
}


def _extract_name_candidates_from_filename(filename: str) -> list[str]:
    stem = Path(filename).stem
    # Keep Cyrillic/Latin letter tokens >= 3 chars before words like "резюме"
    tokens = re.findall(r"[А-ЯЁA-Z][а-яёa-z\-]{2,}", stem)
    return [t for t in tokens if t.lower() not in NON_NAME_WORDS]


def _detect_header_name_tokens(text: str) -> list[str]:
    """Detect FIO in the first ~10 lines (including table rows like 'Иванов / Алексей | Мужчина, 25 лет')."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()][:10]
    found_phrases: list[str] = []

    for line in lines:
        # Split table segments by '|' or '/'
        segments = [seg.strip() for seg in re.split(r"[|]", line) if seg.strip()]
        for seg in segments:
            # Handle 'Иванов / Алексей'
            cleaned_seg = re.sub(r"\s*/\s*", " ", seg).strip()
            # Match 2 or 3 capitalized Russian words only
            m = re.fullmatch(r"([А-ЯЁ][а-яё\-]{1,25})(?:\s+([А-ЯЁ][а-яё\-]{1,25})){1,2}", cleaned_seg)
            if m:
                words = cleaned_seg.split()
                if all(w.lower() not in NON_NAME_WORDS for w in words):
                    found_phrases.append(cleaned_seg)
                    # Also handle original 'Иванов / Алексей' form if slash existed
                    if "/" in seg:
                        found_phrases.append(seg.strip())
                    found_phrases.extend(words)
    return found_phrases


def redact_pii(text: str, filename: str = "", enabled: bool = True) -> PiiRedactionReport:
    """Mask personal identifying information before sending resume text to any external API."""
    if not enabled:
        return PiiRedactionReport(
            enabled=False,
            original_char_count=len(text),
            redacted_char_count=len(text),
            total_masked=0,
            entities=[],
            redacted_text=text,
        )

    counts: dict[str, tuple[str, int]] = {}
    redacted = text

    def _sub(pattern: re.Pattern[str], entity_type: str, placeholder: str, current: str) -> str:
        current, n = pattern.subn(placeholder, current)
        if n > 0:
            prev_ph, prev_n = counts.get(entity_type, (placeholder, 0))
            counts[entity_type] = (prev_ph, prev_n + n)
        return current

    redacted = _sub(PERSONAL_URL_RE, "personal_url", "[PERSONAL_LINK]", redacted)
    redacted = _sub(EMAIL_RE, "email", "[EMAIL]", redacted)
    redacted = _sub(PHONE_RE, "phone", "[PHONE]", redacted)
    redacted = _sub(TG_HANDLE_RE, "messenger_handle", "[CONTACT_HANDLE]", redacted)
    redacted = _sub(PASSPORT_SNILS_INN_RE, "document_id", "[DOC_ID]", redacted)
    redacted = _sub(BIRTH_DATE_RE, "birth_date", "[BIRTH_DATE]", redacted)
    redacted = _sub(GENDER_AGE_RE, "demographics", "[DEMOGRAPHICS]", redacted)
    redacted = _sub(STREET_ADDRESS_RE, "street_address", "[ADDRESS]", redacted)

    # Explicit FIO labels
    explicit_names: list[str] = []
    for m in EXPLICIT_FIO_LABEL_RE.finditer(redacted):
        explicit_names.append(m.group(1))
    if explicit_names:
        redacted = EXPLICIT_FIO_LABEL_RE.sub("ФИО: [CANDIDATE_NAME]", redacted)
        counts["candidate_name"] = ("[CANDIDATE_NAME]", counts.get("candidate_name", ("[CANDIDATE_NAME]", 0))[1] + len(explicit_names))

    # Header/table & filename-derived FIO tokens
    header_candidates = _detect_header_name_tokens(redacted)
    file_candidates = _extract_name_candidates_from_filename(filename)

    # Replace longer phrases first (e.g., "Иванов / Алексей", "Иванов Алексей"), then standalone name tokens
    # Only replace filename tokens if they actually appear in the text
    all_name_phrases: list[str] = []
    seen_lower: set[str] = set()
    for phrase in sorted(set(header_candidates + explicit_names), key=len, reverse=True):
        if len(phrase) >= 3 and phrase.lower() not in seen_lower:
            seen_lower.add(phrase.lower())
            all_name_phrases.append(phrase)

    # Pairwise filename tokens (e.g. "Иванов Алексей" or "Петров Иван")
    if len(file_candidates) >= 2:
        full_from_file = " ".join(file_candidates[:2])
        if full_from_file.lower() not in seen_lower:
            all_name_phrases.append(full_from_file)
            seen_lower.add(full_from_file.lower())
    for tok in file_candidates:
        if tok.lower() not in seen_lower and len(tok) >= 4:
            all_name_phrases.append(tok)
            seen_lower.add(tok.lower())

    name_mask_count = 0
    for phrase in sorted(all_name_phrases, key=len, reverse=True):
        # Match whole words / phrases with flexible whitespace or slash between parts
        parts = [re.escape(p) for p in re.split(r"[\s/]+", phrase.strip()) if p]
        if not parts:
            continue
        pat = re.compile(r"(?<![А-ЯЁа-яёA-Za-z])" + r"[\s/]+".join(parts) + r"(?![А-ЯЁа-яёA-Za-z])")
        redacted, n = pat.subn("[CANDIDATE_NAME]", redacted)
        name_mask_count += n

    # Collapse repeated adjacent placeholders like "[CANDIDATE_NAME] [CANDIDATE_NAME]"
    redacted = re.sub(r"(\[CANDIDATE_NAME\](?:[\s/|]*\[CANDIDATE_NAME\])+)", "[CANDIDATE_NAME]", redacted)

    if name_mask_count > 0:
        prev_ph, prev_n = counts.get("candidate_name", ("[CANDIDATE_NAME]", 0))
        counts["candidate_name"] = (prev_ph, prev_n + name_mask_count)

    entities = [
        MaskedEntity(entity_type=etype, placeholder=ph, count=cnt)
        for etype, (ph, cnt) in sorted(counts.items())
    ]
    total_masked = sum(e.count for e in entities)

    return PiiRedactionReport(
        enabled=True,
        original_char_count=len(text),
        redacted_char_count=len(redacted),
        total_masked=total_masked,
        entities=entities,
        redacted_text=redacted,
    )
