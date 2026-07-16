import os
import unicodedata
from datetime import timedelta


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-development")
    JWT_SECRET = os.getenv("JWT_SECRET", SECRET_KEY)
    JWT_EXPIRES_IN = timedelta(hours=int(os.getenv("JWT_EXPIRES_HOURS", "8")))
    RESET_TOKEN_EXPIRES_MINUTES = int(os.getenv("RESET_TOKEN_EXPIRES_MINUTES", "30"))
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(10 * 1024 * 1024)))

    MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
    MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
    MYSQL_USER = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
    MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "ai_learning_platform")


ALLOWED_ROLES = {
    "general_admin",
    "school_director",
    "teacher",
    "student",
    "guest_teacher",
    "guest_student",
}


ROLE_ALIASES = {
    "admin": "general_admin",
    "administrator": "general_admin",
    "general admin": "general_admin",
    "admin general": "general_admin",
    "director": "school_director",
    "school director": "school_director",
    "directeur": "school_director",
    "directeur d'ecole": "school_director",
    "directeur d'etablissement": "school_director",
    "teacher": "teacher",
    "enseignant": "teacher",
    "student": "student",
    "eleve": "student",
    "etudiant": "student",
    "guest teacher": "guest_teacher",
    "free teacher": "guest_teacher",
    "enseignant libre": "guest_teacher",
    "enseignant invite": "guest_teacher",
    "guest student": "guest_student",
    "free student": "guest_student",
    "eleve libre": "guest_student",
    "etudiant libre": "guest_student",
    "eleve invite": "guest_student",
    "etudiant invite": "guest_student",
}


def normalize_role(value, fallback="student"):
    raw = str(value or "").strip().lower().replace("’", "'")
    normalized = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    role = ROLE_ALIASES.get(raw) or ROLE_ALIASES.get(normalized, normalized)
    return role if role in ALLOWED_ROLES else fallback
