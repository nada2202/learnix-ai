import argparse
import hashlib
import importlib.util
import os
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
MIGRATIONS_DIR = BASE_DIR / "migrations"
SEEDERS_DIR = BASE_DIR / "seeders"
load_dotenv(BASE_DIR / ".env")


def connection_settings(include_database=True):
    settings = {
        "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
        "port": int(os.getenv("MYSQL_PORT", "3306")),
        "user": os.getenv("MYSQL_USER", "root"),
        "password": os.getenv("MYSQL_PASSWORD", ""),
    }
    if include_database:
        settings["database"] = os.getenv("MYSQL_DATABASE", "ai_learning_platform")
    return settings


def database_name():
    return os.getenv("MYSQL_DATABASE", "ai_learning_platform")


def create_database():
    name = database_name()
    if not name.replace("_", "").isalnum():
        raise ValueError("MYSQL_DATABASE may contain only letters, numbers, and underscores")

    connection = mysql.connector.connect(**connection_settings(include_database=False))
    cursor = connection.cursor()
    cursor.execute(
        f"CREATE DATABASE IF NOT EXISTS `{name}` "
        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    )
    cursor.close()
    connection.close()


def split_sql(script):
    statements = []
    current = []
    quote = None
    index = 0

    while index < len(script):
        char = script[index]
        next_char = script[index + 1] if index + 1 < len(script) else ""

        if quote:
            current.append(char)
            if char == quote:
                if next_char == quote:
                    current.append(next_char)
                    index += 1
                elif index == 0 or script[index - 1] != "\\":
                    quote = None
        elif char in ("'", '"', "`"):
            quote = char
            current.append(char)
        elif char == ";":
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
        else:
            current.append(char)
        index += 1

    statement = "".join(current).strip()
    if statement:
        statements.append(statement)
    return statements


def ensure_migrations_table(connection):
    cursor = connection.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          migration VARCHAR(255) NOT NULL UNIQUE,
          checksum CHAR(64) NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.commit()
    cursor.close()


def migrate():
    create_database()
    connection = mysql.connector.connect(**connection_settings())
    ensure_migrations_table(connection)
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT migration, checksum FROM schema_migrations")
    applied = {row["migration"]: row["checksum"] for row in cursor.fetchall()}
    cursor.close()

    applied_now = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        script = path.read_text(encoding="utf-8-sig")
        checksum = hashlib.sha256(script.encode("utf-8")).hexdigest()
        if path.name in applied:
            if applied[path.name] != checksum:
                raise RuntimeError(f"Applied migration was modified: {path.name}")
            continue

        cursor = connection.cursor()
        try:
            for statement in split_sql(script):
                cursor.execute(statement)
                if cursor.with_rows:
                    cursor.fetchall()
            cursor.execute(
                "INSERT INTO schema_migrations(migration, checksum) VALUES(%s, %s)",
                (path.name, checksum),
            )
            connection.commit()
            applied_now.append(path.name)
        except Exception:
            connection.rollback()
            raise
        finally:
            cursor.close()

    connection.close()
    return applied_now


def seed():
    connection = mysql.connector.connect(**connection_settings())
    results = []
    for path in sorted(SEEDERS_DIR.glob("*.py")):
        spec = importlib.util.spec_from_file_location(f"learnix_seeder_{path.stem}", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        results.append((path.name, module.seed(connection)))
    connection.close()
    return results


def status():
    create_database()
    connection = mysql.connector.connect(**connection_settings())
    ensure_migrations_table(connection)
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT migration, applied_at FROM schema_migrations ORDER BY migration")
    rows = cursor.fetchall()
    cursor.close()
    connection.close()
    return rows


def main():
    parser = argparse.ArgumentParser(description="Manage the Learnix MySQL schema and seed data")
    parser.add_argument("command", choices=("migrate", "seed", "setup", "status"))
    args = parser.parse_args()

    if args.command in ("migrate", "setup"):
        migrations = migrate()
        print("Applied migrations:", ", ".join(migrations) if migrations else "none (already current)")

    if args.command in ("seed", "setup"):
        for name, result in seed():
            print(
                f"Seeded {name}: {result['roles']} roles, {result['levels']} levels, "
                f"{result['users']} demo users"
            )
            print(f"Demo user password: {result['default_password']}")

    if args.command == "status":
        for row in status():
            print(f"{row['migration']}  {row['applied_at']}")


if __name__ == "__main__":
    main()
