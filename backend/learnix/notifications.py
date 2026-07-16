from flask import Blueprint, g, jsonify, request

from .database import ensure_column, get_db
from .security import require_auth


notifications_bp = Blueprint("notifications", __name__, url_prefix="/api")


def ensure_notifications(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            body TEXT NULL,
            read_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    ensure_column(cursor, "notifications", "notification_type", "VARCHAR(80) DEFAULT 'general'")
    ensure_column(cursor, "notifications", "action_path", "VARCHAR(255) NULL")


def notify(cursor, user_id, title, body="", notification_type="general", action_path=None):
    if not user_id:
        return
    ensure_notifications(cursor)
    cursor.execute(
        """
        INSERT INTO notifications(user_id, title, body, notification_type, action_path)
        VALUES(%s, %s, %s, %s, %s)
        """,
        (user_id, title, body, notification_type, action_path),
    )


@notifications_bp.get("/notifications")
@require_auth
def list_notifications():
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_notifications(cursor)
    cursor.execute(
        """
        SELECT id, title, body, notification_type AS type, action_path AS actionPath,
               read_at AS readAt, created_at AS createdAt
        FROM notifications WHERE user_id = %s
        ORDER BY created_at DESC, id DESC LIMIT 60
        """,
        (g.current_user.get("id"),),
    )
    rows = cursor.fetchall()
    unread = sum(1 for row in rows if not row.get("readAt"))
    cursor.close(); db.close()
    return jsonify({"success": True, "notifications": rows, "unreadCount": unread})


@notifications_bp.get("/me")
@require_auth
def current_profile():
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_column(cursor, "users", "phone", "VARCHAR(50) NULL")
    ensure_column(cursor, "users", "avatar_url", "VARCHAR(255) NULL")
    cursor.execute("SELECT id, name, email, phone, role, level, status, avatar_url FROM users WHERE id = %s", (g.current_user.get("id"),))
    profile = cursor.fetchone() or {}
    if profile.get("role") in {"student", "guest_student"}:
        cursor.execute("""
            SELECT s.school_id AS schoolId, s.main_class_id AS classId, s.education_level AS educationLevel,
                   sc.name AS schoolName, c.name AS className
            FROM students s LEFT JOIN schools sc ON sc.id = s.school_id LEFT JOIN classes c ON c.id = s.main_class_id
            WHERE s.user_id = %s
        """, (g.current_user.get("id"),))
        profile.update(cursor.fetchone() or {})
    elif profile.get("role") in {"teacher", "guest_teacher"}:
        cursor.execute("""
            SELECT t.school_id AS schoolId, sc.name AS schoolName
            FROM teachers t LEFT JOIN schools sc ON sc.id = t.school_id
            WHERE t.user_id = %s
        """, (g.current_user.get("id"),))
        profile.update(cursor.fetchone() or {})
    elif profile.get("role") == "school_director":
        cursor.execute("""
            SELECT id AS schoolId, name AS schoolName
            FROM schools
            WHERE director_user_id = %s AND status = 'approved'
            ORDER BY id DESC
            LIMIT 1
        """, (g.current_user.get("id"),))
        profile.update(cursor.fetchone() or {})
    role_labels = {
        "general_admin": "Administrateur",
        "school_director": "Directeur",
        "teacher": "Enseignant",
        "guest_teacher": "Enseignant invité",
        "student": "Élève",
        "guest_student": "Élève invité",
    }
    status_labels = {
        "active": "Actif",
        "approved": "Approuvé",
        "pending": "En attente",
        "disabled": "Inactif",
        "inactive": "Inactif",
        "rejected": "Refusé",
    }
    profile["roleLabel"] = role_labels.get(profile.get("role"), profile.get("role") or "")
    profile["statusLabel"] = status_labels.get(profile.get("status"), profile.get("status") or "")
    cursor.close(); db.close()
    return jsonify({"success": True, "user": profile})


@notifications_bp.patch("/me")
@require_auth
def update_current_profile():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name") or "").strip()
    phone = str(data.get("phone") or "").strip()
    if not name:
        return jsonify({"success": False, "message": "Name is required"}), 400
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_column(cursor, "users", "phone", "VARCHAR(50) NULL")
    cursor.execute("UPDATE users SET name = %s, phone = %s WHERE id = %s", (name[:255], phone[:50], g.current_user.get("id")))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "message": "Profile updated"})


@notifications_bp.patch("/notifications/<int:notification_id>/read")
@require_auth
def read_notification(notification_id):
    db = get_db(); cursor = db.cursor()
    ensure_notifications(cursor)
    cursor.execute(
        "UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = %s AND user_id = %s",
        (notification_id, g.current_user.get("id")),
    )
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True})


@notifications_bp.patch("/notifications/read-all")
@require_auth
def read_all_notifications():
    db = get_db(); cursor = db.cursor()
    ensure_notifications(cursor)
    cursor.execute("UPDATE notifications SET read_at = NOW() WHERE user_id = %s AND read_at IS NULL", (g.current_user.get("id"),))
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True})
