from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Literal

from app.auth import hash_password, verify_password
from app.config import settings
from app.services.parser import SUPPORTED_EXTENSIONS, parse_document_bytes

SUITABLE_SCORE_THRESHOLD = 50.0
TOP_RESUME_THRESHOLD = 75.0

# Initial prepared HR administrator stored directly in SQLite (no credentials in .env).
DEFAULT_SEED_ADMIN_USERNAME = "admin"
DEFAULT_SEED_ADMIN_PASSWORD = "admin123"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_path() -> Path:
    path = settings.resolve_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(str(_db_path()), timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _extract_title_from_text(filename: str, text: str) -> str:
    for line in text.splitlines():
        clean = line.strip()
        if len(clean) >= 4:
            return clean[:120]
    return filename


def _discover_initial_vacancies() -> list[Path]:
    root = settings.resolve_samples_root()
    found: list[Path] = []
    for vac_dir in (root / "samples" / "vacancies", root / "vacancies"):
        if vac_dir.is_dir():
            for p in sorted(vac_dir.iterdir()):
                if p.is_file() and not p.name.startswith("~$") and p.suffix.lower() in SUPPORTED_EXTENSIONS:
                    found.append(p)
            if found:
                return found

    if root.is_dir():
        for p in sorted(root.iterdir()):
            if (
                p.is_file()
                and not p.name.startswith("~$")
                and p.suffix.lower() in SUPPORTED_EXTENSIONS
                and "ваканс" in p.name.lower()
            ):
                found.append(p)
    return found


def compute_screening_bucket(score: float | None) -> tuple[Literal["suitable", "rejected"], bool]:
    """Classify candidate solely by percentage score: < 50% rejected, >= 50% suitable, >= 75% top."""
    if score is not None and score >= SUITABLE_SCORE_THRESHOLD:
        return "suitable", score >= TOP_RESUME_THRESHOLD
    return "rejected", False


def _ensure_submission_columns(conn: sqlite3.Connection) -> None:
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(submissions)").fetchall()}
    migrations = [
        ("vacancy_id", "ALTER TABLE submissions ADD COLUMN vacancy_id TEXT"),
        ("vacancy_filename", "ALTER TABLE submissions ADD COLUMN vacancy_filename TEXT"),
        ("vacancy_title", "ALTER TABLE submissions ADD COLUMN vacancy_title TEXT"),
        ("match_score", "ALTER TABLE submissions ADD COLUMN match_score REAL"),
        ("fit_verdict", "ALTER TABLE submissions ADD COLUMN fit_verdict TEXT"),
        (
            "screening_bucket",
            "ALTER TABLE submissions ADD COLUMN screening_bucket TEXT NOT NULL DEFAULT 'suitable'",
        ),
        ("is_top_resume", "ALTER TABLE submissions ADD COLUMN is_top_resume INTEGER NOT NULL DEFAULT 0"),
        ("manual_override", "ALTER TABLE submissions ADD COLUMN manual_override INTEGER NOT NULL DEFAULT 0"),
    ]
    for col_name, ddl in migrations:
        if col_name not in cols:
            conn.execute(ddl)


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS vacancies (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                title TEXT NOT NULL,
                content_bytes BLOB NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS submissions (
                id TEXT PRIMARY KEY,
                vacancy_id TEXT,
                vacancy_filename TEXT,
                vacancy_title TEXT,
                candidate_label TEXT NOT NULL,
                contact_info TEXT NOT NULL DEFAULT '',
                comment TEXT NOT NULL DEFAULT '',
                resume_filename TEXT NOT NULL,
                resume_bytes BLOB NOT NULL,
                status TEXT NOT NULL DEFAULT 'processing',
                error_message TEXT NOT NULL DEFAULT '',
                analysis_json TEXT,
                match_score REAL,
                fit_verdict TEXT,
                screening_bucket TEXT NOT NULL DEFAULT 'suitable',
                is_top_resume INTEGER NOT NULL DEFAULT 0,
                manual_override INTEGER NOT NULL DEFAULT 0,
                best_vacancy_filename TEXT,
                best_vacancy_title TEXT,
                best_score REAL,
                created_at TEXT NOT NULL,
                processed_at TEXT
            );
            """
        )
        _ensure_submission_columns(conn)

        # Seed prepared HR admin in SQLite if admins table is empty
        row = conn.execute("SELECT COUNT(*) AS cnt FROM admins").fetchone()
        if row and row["cnt"] == 0:
            conn.execute(
                "INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)",
                (
                    DEFAULT_SEED_ADMIN_USERNAME,
                    hash_password(DEFAULT_SEED_ADMIN_PASSWORD),
                    _utc_now_iso(),
                ),
            )

        # Seed default vacancies from case samples if vacancies table is empty
        v_row = conn.execute("SELECT COUNT(*) AS cnt FROM vacancies").fetchone()
        if v_row and v_row["cnt"] == 0:
            for p in _discover_initial_vacancies():
                raw = p.read_bytes()
                parsed = parse_document_bytes(p.name, raw)
                title = _extract_title_from_text(p.name, parsed.text) if parsed.is_valid else p.name
                conn.execute(
                    "INSERT INTO vacancies (id, filename, title, content_bytes, is_active, created_at) "
                    "VALUES (?, ?, ?, ?, 1, ?)",
                    (str(uuid.uuid4()), p.name, title, raw, _utc_now_iso()),
                )


def upsert_admin(username: str, password: str) -> dict[str, Any]:
    """Create a new HR admin or update password hash for an existing username."""
    clean_user = username.strip()
    if not clean_user:
        raise ValueError("Имя пользователя не может быть пустым.")
    if len(password) < 4:
        raise ValueError("Пароль должен содержать минимум 4 символа.")

    pw_hash = hash_password(password)
    now = _utc_now_iso()
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM admins WHERE username = ?", (clean_user,)).fetchone()
        if existing:
            conn.execute(
                "UPDATE admins SET password_hash = ? WHERE id = ?",
                (pw_hash, existing["id"]),
            )
            action = "updated"
        else:
            conn.execute(
                "INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)",
                (clean_user, pw_hash, now),
            )
            action = "created"
    return {"username": clean_user, "action": action}


def authenticate_admin(username: str, password: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM admins WHERE username = ?",
            (username.strip(),),
        ).fetchone()
    if not row:
        return None
    if not verify_password(password, row["password_hash"]):
        return None
    return {"id": row["id"], "username": row["username"]}


def list_vacancies(active_only: bool = False) -> list[dict[str, Any]]:
    query = "SELECT id, filename, title, is_active, created_at FROM vacancies"
    if active_only:
        query += " WHERE is_active = 1"
    query += " ORDER BY created_at ASC, filename ASC"
    with get_conn() as conn:
        rows = conn.execute(query).fetchall()
    return [
        {
            "id": r["id"],
            "filename": r["filename"],
            "title": r["title"],
            "is_active": bool(r["is_active"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def list_vacancies_with_counts(active_only: bool = False) -> list[dict[str, Any]]:
    where_clause = "WHERE v.is_active = 1" if active_only else ""
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT
                v.id,
                v.filename,
                v.title,
                v.is_active,
                v.created_at,
                COUNT(s.id) AS total_count,
                SUM(CASE WHEN s.status = 'completed' AND s.screening_bucket = 'suitable' THEN 1 ELSE 0 END) AS suitable_count,
                SUM(CASE WHEN s.status = 'completed' AND s.screening_bucket = 'suitable' AND s.is_top_resume = 1 THEN 1 ELSE 0 END) AS top_count,
                SUM(CASE WHEN s.status = 'completed' AND s.screening_bucket = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
                SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END) AS failed_count
            FROM vacancies v
            LEFT JOIN submissions s ON s.vacancy_id = v.id
            {where_clause}
            GROUP BY v.id
            ORDER BY v.created_at ASC, v.filename ASC
            """
        ).fetchall()

    return [
        {
            "id": r["id"],
            "filename": r["filename"],
            "title": r["title"],
            "is_active": bool(r["is_active"]),
            "created_at": r["created_at"],
            "total_count": int(r["total_count"] or 0),
            "suitable_count": int(r["suitable_count"] or 0),
            "top_count": int(r["top_count"] or 0),
            "rejected_count": int(r["rejected_count"] or 0),
            "failed_count": int(r["failed_count"] or 0),
        }
        for r in rows
    ]


def get_vacancy_by_id(vacancy_id: str, include_bytes: bool = False) -> dict[str, Any] | None:
    cols = "id, filename, title, is_active, created_at" + (", content_bytes" if include_bytes else "")
    with get_conn() as conn:
        row = conn.execute(f"SELECT {cols} FROM vacancies WHERE id = ?", (vacancy_id,)).fetchone()
    if not row:
        return None
    item: dict[str, Any] = {
        "id": row["id"],
        "filename": row["filename"],
        "title": row["title"],
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
    }
    if include_bytes:
        item["content_bytes"] = bytes(row["content_bytes"])
    return item


def create_vacancy(filename: str, title: str, content_bytes: bytes) -> dict[str, Any]:
    vac_id = str(uuid.uuid4())
    now = _utc_now_iso()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO vacancies (id, filename, title, content_bytes, is_active, created_at) "
            "VALUES (?, ?, ?, ?, 1, ?)",
            (vac_id, filename, title, content_bytes, now),
        )
    return {
        "id": vac_id,
        "filename": filename,
        "title": title,
        "is_active": True,
        "created_at": now,
    }


def set_vacancy_active(vacancy_id: str, is_active: bool) -> dict[str, Any] | None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE vacancies SET is_active = ? WHERE id = ?",
            (1 if is_active else 0, vacancy_id),
        )
        row = conn.execute(
            "SELECT id, filename, title, is_active, created_at FROM vacancies WHERE id = ?",
            (vacancy_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "filename": row["filename"],
        "title": row["title"],
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
    }


def delete_vacancy(vacancy_id: str) -> bool:
    with get_conn() as conn:
        conn.execute("DELETE FROM submissions WHERE vacancy_id = ?", (vacancy_id,))
        cur = conn.execute("DELETE FROM vacancies WHERE id = ?", (vacancy_id,))
        return cur.rowcount > 0


def create_submission_record(
    vacancy_id: str,
    vacancy_filename: str,
    vacancy_title: str,
    resume_filename: str,
    resume_bytes: bytes,
    contact_info: str = "",
    comment: str = "",
) -> str:
    sub_id = str(uuid.uuid4())
    now = _utc_now_iso()
    clean_contact = contact_info.strip()
    label = clean_contact if clean_contact else Path(resume_filename).stem
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO submissions (
                id, vacancy_id, vacancy_filename, vacancy_title,
                candidate_label, contact_info, comment,
                resume_filename, resume_bytes, status, error_message, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', '', ?)
            """,
            (
                sub_id,
                vacancy_id,
                vacancy_filename,
                vacancy_title,
                label,
                clean_contact,
                comment.strip(),
                resume_filename,
                resume_bytes,
                now,
            ),
        )
    return sub_id


def complete_submission_analysis(submission_id: str, analysis_dict: dict[str, Any]) -> None:
    now = _utc_now_iso()
    analysis_json = json.dumps(analysis_dict, ensure_ascii=False)
    vacancies = analysis_dict.get("vacancies") or []
    match_score: float | None = None
    fit_verdict: str | None = None
    vac_title: str | None = None
    vac_filename: str | None = None

    if vacancies:
        first = vacancies[0]
        score_obj = first.get("score") or {}
        vac_obj = first.get("vacancy") or {}
        match_score = float(score_obj.get("overall_score", 0.0))
        fit_verdict = score_obj.get("fit_verdict")
        vac_title = vac_obj.get("title")
        vac_filename = vac_obj.get("filename")

    bucket, is_top = compute_screening_bucket(match_score)

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE submissions
            SET status = 'completed',
                error_message = '',
                analysis_json = ?,
                match_score = ?,
                fit_verdict = ?,
                screening_bucket = ?,
                is_top_resume = ?,
                manual_override = 0,
                vacancy_title = COALESCE(?, vacancy_title),
                vacancy_filename = COALESCE(?, vacancy_filename),
                best_vacancy_filename = COALESCE(?, best_vacancy_filename),
                best_vacancy_title = COALESCE(?, best_vacancy_title),
                best_score = COALESCE(?, best_score),
                processed_at = ?
            WHERE id = ?
            """,
            (
                analysis_json,
                match_score,
                fit_verdict,
                bucket,
                1 if is_top else 0,
                vac_title,
                vac_filename,
                vac_filename,
                vac_title,
                match_score,
                now,
                submission_id,
            ),
        )


def fail_submission_analysis(submission_id: str, error_message: str) -> None:
    now = _utc_now_iso()
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE submissions
            SET status = 'failed',
                error_message = ?,
                processed_at = ?
            WHERE id = ?
            """,
            (error_message, now, submission_id),
        )


def set_submission_bucket(
    submission_id: str,
    bucket: Literal["suitable", "rejected"],
) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, match_score FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        if not row:
            return None
        score = row["match_score"]
        is_top = bucket == "suitable" and score is not None and float(score) >= TOP_RESUME_THRESHOLD
        conn.execute(
            """
            UPDATE submissions
            SET screening_bucket = ?,
                is_top_resume = ?,
                manual_override = 1
            WHERE id = ?
            """,
            (bucket, 1 if is_top else 0, submission_id),
        )
    return {
        "submission_id": submission_id,
        "screening_bucket": bucket,
        "is_top_resume": is_top,
        "manual_override": True,
    }


def get_submission_raw(submission_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
    if not row:
        return None
    return dict(row)


def delete_submission(submission_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM submissions WHERE id = ?", (submission_id,))
        return cur.rowcount > 0


def list_vacancy_submissions(vacancy_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, vacancy_id, vacancy_filename, vacancy_title,
                   candidate_label, contact_info, comment, resume_filename,
                   status, error_message, analysis_json,
                   match_score, fit_verdict, screening_bucket, is_top_resume, manual_override,
                   created_at, processed_at
            FROM submissions
            WHERE vacancy_id = ?
            ORDER BY COALESCE(match_score, -1) DESC, created_at DESC
            """,
            (vacancy_id,),
        ).fetchall()

    items: list[dict[str, Any]] = []
    for r in rows:
        target_role = ""
        summary = ""
        total_experience_months: int | None = None
        skills_preview: list[str] = []
        mandatory_score = 0.0
        full_count = 0
        partial_count = 0
        not_specified_count = 0
        no_match_count = 0
        total_requirements = 0

        if r["analysis_json"]:
            try:
                parsed = json.loads(r["analysis_json"])
                prof = parsed.get("resume_profile") or {}
                target_role = prof.get("target_role") or ""
                summary = prof.get("summary") or ""
                total_experience_months = prof.get("total_experience_months")
                skills_preview = (prof.get("skills") or [])[:8]
                vacs = parsed.get("vacancies") or []
                if vacs:
                    sc = vacs[0].get("score") or {}
                    mandatory_score = float(sc.get("mandatory_score", 0.0))
                    full_count = int(sc.get("full_count", 0))
                    partial_count = int(sc.get("partial_count", 0))
                    not_specified_count = int(sc.get("not_specified_count", 0))
                    no_match_count = int(sc.get("no_match_count", 0))
                    total_requirements = int(sc.get("total_requirements", 0))
            except Exception:
                pass

        match_score = r["match_score"]
        system_recommended = match_score is not None and float(match_score) >= SUITABLE_SCORE_THRESHOLD

        items.append(
            {
                "id": r["id"],
                "vacancy_id": r["vacancy_id"],
                "vacancy_title": r["vacancy_title"] or "",
                "candidate_label": r["candidate_label"],
                "contact_info": r["contact_info"],
                "comment": r["comment"],
                "resume_filename": r["resume_filename"],
                "status": r["status"],
                "error_message": r["error_message"],
                "match_score": match_score,
                "mandatory_score": mandatory_score,
                "fit_verdict": r["fit_verdict"],
                "screening_bucket": r["screening_bucket"],
                "is_top_resume": bool(r["is_top_resume"]),
                "manual_override": bool(r["manual_override"]),
                "system_recommended": system_recommended,
                "target_role": target_role,
                "summary": summary,
                "total_experience_months": total_experience_months,
                "skills_preview": skills_preview,
                "full_count": full_count,
                "partial_count": partial_count,
                "not_specified_count": not_specified_count,
                "no_match_count": no_match_count,
                "total_requirements": total_requirements,
                "created_at": r["created_at"],
                "processed_at": r["processed_at"],
            }
        )
    return items
