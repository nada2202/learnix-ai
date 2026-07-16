import os

import mysql.connector


def get_db():
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "127.0.0.1"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
        database=os.getenv("MYSQL_DATABASE", "ai_learning_platform"),
        charset="utf8mb4",
        collation="utf8mb4_unicode_ci",
    )


def ensure_column(cursor, table_name, column_name, definition):
    cursor.execute(f"SHOW COLUMNS FROM {table_name}")
    existing = {
        column.get("Field") if isinstance(column, dict) else column[0]
        for column in cursor.fetchall()
    }
    if column_name not in existing:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def ensure_users_security_columns(cursor):
    ensure_column(cursor, "users", "role", "VARCHAR(50) DEFAULT 'student'")
    ensure_column(cursor, "users", "status", "VARCHAR(30) DEFAULT 'active'")
    ensure_column(cursor, "users", "avatar_url", "VARCHAR(255) NULL")
    ensure_column(cursor, "users", "last_seen", "DATETIME NULL")
    ensure_column(cursor, "users", "reset_token_hash", "VARCHAR(255) NULL")
    ensure_column(cursor, "users", "reset_token_expires_at", "DATETIME NULL")
    ensure_column(cursor, "users", "created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
