from __future__ import annotations

import argparse
import getpass
import sys

from app.db import init_db, upsert_admin


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Создать или обновить пароль HR-администратора в базе SQLite."
    )
    parser.add_argument("--username", required=True, help="Логин администратора")
    parser.add_argument(
        "--password",
        default=None,
        help="Пароль (если не указан, будет запрошен в терминале скрытым вводом)",
    )
    args = parser.parse_args()

    password = args.password
    if password is None:
        password = getpass.getpass("Пароль: ")
        confirm = getpass.getpass("Повторите пароль: ")
        if password != confirm:
            print("Ошибка: пароли не совпадают.", file=sys.stderr)
            return 1

    init_db()
    res = upsert_admin(args.username, password)
    print(f"Администратор '{res['username']}' успешно { 'создан' if res['action'] == 'created' else 'обновлён' } в БД.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
