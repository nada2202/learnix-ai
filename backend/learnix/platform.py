import base64
import json
from io import BytesIO
from pathlib import Path
from datetime import date, timedelta

from flask import Blueprint, g, jsonify, request
from mysql.connector import Error
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image as ReportImage, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from werkzeug.security import generate_password_hash

from .config import ALLOWED_ROLES, normalize_role
from .database import ensure_column, ensure_users_security_columns, get_db
from .schools import ensure_platform_tables
from .security import require_auth, require_roles
from .notifications import notify

platform_bp = Blueprint("platform", __name__, url_prefix="/api")


ROLE_MATRIX = {
    "general_admin": [
        "approve_schools", "view_all_schools", "manage_users", "view_statistics",
        "manage_reports", "view_audit_logs"
    ],
    "school_director": [
        "request_school", "manage_own_school", "manage_classes", "manage_modules",
        "approve_teacher_requests", "approve_student_requests", "generate_schedules",
        "view_school_analytics"
    ],
    "teacher": [
        "view_assigned_classes", "create_courses", "create_quizzes", "create_exams",
        "generate_ai_exercises", "view_student_results", "set_availability",
        "message_students"
    ],
    "guest_teacher": [
        "create_free_courses", "create_free_quizzes", "accept_free_students",
        "set_availability", "track_own_students", "message_students"
    ],
    "student": [
        "view_assigned_class", "view_courses", "take_quizzes", "take_exams",
        "use_class_ai", "view_progress", "receive_recommendations",
        "message_teachers"
    ],
    "guest_student": [
        "choose_level", "choose_modules", "use_free_ai", "generate_exercises",
        "request_free_teacher_support", "track_personal_progress"
    ],
}


def parse_legal_documents(value):
    if not value:
        return []
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except (TypeError, json.JSONDecodeError):
        return []


def format_school_row(row):
    row["legalDocuments"] = parse_legal_documents(row.pop("legalDocumentsJson", None))
    return row


def ensure_complete_platform_tables(cursor):
    ensure_platform_tables(cursor)
    ensure_users_security_columns(cursor)
    ensure_column(cursor, "users", "status", "VARCHAR(30) DEFAULT 'active'")
    ensure_column(cursor, "students", "birth_date", "DATE NULL")
    ensure_column(cursor, "students", "phone", "VARCHAR(60) NULL")
    ensure_column(cursor, "students", "guardian_name", "VARCHAR(255) NULL")
    ensure_column(cursor, "students", "guardian_phone", "VARCHAR(60) NULL")
    ensure_column(cursor, "students", "preferred_language", "VARCHAR(10) DEFAULT 'fr'")
    ensure_column(cursor, "students", "learning_style", "VARCHAR(80) NULL")
    ensure_column(cursor, "students", "interests_json", "LONGTEXT NULL")
    ensure_column(cursor, "students", "notes", "TEXT NULL")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS module_teachers (
            module_id INT NOT NULL,
            teacher_user_id INT NOT NULL,
            PRIMARY KEY (module_id, teacher_user_id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS teacher_assignments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            teacher_user_id INT NOT NULL,
            class_id INT NOT NULL,
            module_id INT NOT NULL,
            school_id INT NOT NULL,
            status ENUM('active','inactive','archived') DEFAULT 'active',
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_teacher_assignment (teacher_user_id, class_id, module_id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_modules (
            student_user_id INT NOT NULL,
            module_id INT NOT NULL,
            teacher_user_id INT NULL,
            status ENUM('pending','approved','active','archived') DEFAULT 'active',
            PRIMARY KEY (student_user_id, module_id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_assignments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_user_id INT NOT NULL,
            class_id INT NOT NULL,
            module_id INT NOT NULL,
            school_id INT NOT NULL,
            status ENUM('active','inactive','archived') DEFAULT 'active',
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_student_assignment (student_user_id, class_id, module_id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sender_user_id INT NOT NULL,
            recipient_user_id INT NOT NULL,
            body TEXT NOT NULL,
            read_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_messages_conversation (sender_user_id, recipient_user_id, created_at),
            INDEX idx_messages_recipient_read (recipient_user_id, read_at)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_conversations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL DEFAULT 'Nouvelle conversation',
            context_text LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_ai_conversations_user (user_id, updated_at)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_conversation_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            role ENUM('student','ai') NOT NULL,
            content LONGTEXT NOT NULL,
            metadata_json LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ai_messages_conversation (conversation_id, created_at)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(60) NOT NULL UNIQUE,
            permissions_json LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    for role, permissions in ROLE_MATRIX.items():
        cursor.execute(
            """
            INSERT INTO roles(name, permissions_json)
            VALUES(%s, %s)
            ON DUPLICATE KEY UPDATE permissions_json = VALUES(permissions_json)
            """,
            (role, json.dumps(permissions)),
        )

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS education_levels (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(120) NOT NULL UNIQUE,
            sort_order INT NOT NULL
        )
    """)
    cursor.execute("""
        INSERT IGNORE INTO education_levels(name, sort_order)
        SELECT name, sort_order FROM levels
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS teachers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            mode ENUM('assigned','free') DEFAULT 'assigned',
            school_id INT NULL,
            bio TEXT NULL,
            specialties_json LONGTEXT NULL,
            status ENUM('active','disabled') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            mode ENUM('assigned','free') DEFAULT 'assigned',
            school_id INT NULL,
            main_class_id INT NULL,
            education_level VARCHAR(120) NULL,
            goals_json LONGTEXT NULL,
            status ENUM('active','disabled') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS teacher_school_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            teacher_user_id INT NOT NULL,
            school_id INT NOT NULL,
            message TEXT NULL,
            status ENUM('pending','approved','rejected') DEFAULT 'pending',
            decided_by INT NULL,
            decision_reason TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            decided_at DATETIME NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_class_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_user_id INT NOT NULL,
            class_id INT NOT NULL,
            message TEXT NULL,
            status ENUM('pending','approved','rejected') DEFAULT 'pending',
            decided_by INT NULL,
            decision_reason TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            decided_at DATETIME NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_school_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_user_id INT NOT NULL,
            school_id INT NOT NULL,
            message TEXT NULL,
            status ENUM('pending','approved','rejected') DEFAULT 'pending',
            decided_by INT NULL,
            decision_reason TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            decided_at DATETIME NULL,
            INDEX idx_student_school_request (student_user_id, status),
            INDEX idx_school_student_request (school_id, status)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_context_documents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            school_id INT NULL,
            class_id INT NULL,
            module_id INT NULL,
            module_name VARCHAR(255) NULL,
            education_level VARCHAR(120) NULL,
            file_name VARCHAR(255) NOT NULL,
            content LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ai_document_user (user_id, created_at),
            INDEX idx_ai_document_scope (school_id, class_id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS courses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            school_id INT NULL,
            class_id INT NULL,
            module_id INT NULL,
            teacher_user_id INT NULL,
            title VARCHAR(255) NOT NULL,
            content LONGTEXT NULL,
            files_json LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS quizzes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            school_id INT NULL,
            class_id INT NULL,
            module_id INT NULL,
            teacher_user_id INT NULL,
            title VARCHAR(255) NOT NULL,
            access_scope ENUM('class','students','free_students') DEFAULT 'class',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    ensure_column(cursor, "quizzes", "difficulty", "VARCHAR(50) NULL")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS exams (
            id INT AUTO_INCREMENT PRIMARY KEY,
            school_id INT NULL,
            class_id INT NULL,
            module_id INT NULL,
            teacher_user_id INT NULL,
            title VARCHAR(255) NOT NULL,
            grading_scale LONGTEXT NULL,
            duration_minutes INT NULL,
            access_date DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            quiz_id INT NULL,
            exam_id INT NULL,
            prompt LONGTEXT NOT NULL,
            expected_answer LONGTEXT NULL,
            points DECIMAL(5,2) DEFAULT 1
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            quiz_id INT NULL,
            exam_id INT NULL,
            student_user_id INT NULL,
            score DECIMAL(6,2) NULL,
            feedback LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS answers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            question_id INT NOT NULL,
            student_user_id INT NULL,
            answer LONGTEXT NULL,
            is_correct BOOLEAN NULL,
            feedback LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS course_files (
            id INT AUTO_INCREMENT PRIMARY KEY,
            course_id INT NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_type VARCHAR(120) NULL,
            file_size INT NULL,
            storage_path TEXT NULL,
            uploaded_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS quiz_access (
            id INT AUTO_INCREMENT PRIMARY KEY,
            quiz_id INT NOT NULL,
            access_type ENUM('class','group','student','free_student') NOT NULL,
            target_id INT NULL,
            granted_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS exam_access (
            id INT AUTO_INCREMENT PRIMARY KEY,
            exam_id INT NOT NULL,
            access_type ENUM('class','group','student','free_student') NOT NULL,
            target_id INT NULL,
            granted_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_contexts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            context_level ENUM('global','school','class','module','teacher','student') NOT NULL,
            target_id INT NULL,
            title VARCHAR(255) NOT NULL,
            content LONGTEXT NOT NULL,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_generated_exercises (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_user_id INT NULL,
            module_id INT NULL,
            prompt_hash VARCHAR(128) NULL,
            difficulty VARCHAR(50) NULL,
            exercises_json LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_recommendations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_user_id INT NOT NULL,
            module_id INT NULL,
            recommendation_type VARCHAR(80) NOT NULL,
            title VARCHAR(255) NOT NULL,
            body TEXT NULL,
            status ENUM('new','seen','completed') DEFAULT 'new',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schedule_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            schedule_id INT NOT NULL,
            class_id INT NOT NULL,
            module_id INT NULL,
            teacher_user_id INT NULL,
            day_of_week TINYINT NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            room VARCHAR(80) NULL,
            conflict_status ENUM('clear','conflict') DEFAULT 'clear',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            actor_user_id INT NULL,
            action VARCHAR(120) NOT NULL,
            entity_type VARCHAR(80) NULL,
            entity_id INT NULL,
            metadata_json LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reporter_user_id INT NULL,
            target_type VARCHAR(80) NULL,
            target_id INT NULL,
            title VARCHAR(255) NOT NULL,
            body TEXT NULL,
            priority VARCHAR(30) DEFAULT 'medium',
            status ENUM('open','reviewing','resolved','rejected') DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    ensure_column(cursor, "reports", "priority", "VARCHAR(30) DEFAULT 'medium'")


def log_audit(cursor, action, entity_type=None, entity_id=None, metadata=None):
    cursor.execute(
        """
        INSERT INTO audit_logs(actor_user_id, action, entity_type, entity_id, metadata_json)
        VALUES(%s, %s, %s, %s, %s)
        """,
        (
            g.current_user.get("id") if getattr(g, "current_user", None) else None,
            action,
            entity_type,
            entity_id,
            json.dumps(metadata or {}),
        ),
    )


@platform_bp.get("/platform/architecture")
@require_auth
def platform_architecture():
    return jsonify({
        "success": True,
        "architecture": {
            "roles": ROLE_MATRIX,
            "aiEngine": "adaptive learning engine powered by AI and student performance history",
            "contexts": ["global", "school", "class", "module", "teacher", "student"],
            "coreEntities": [
                "schools", "classes", "modules", "courses", "quizzes", "exams",
                "attempts", "answers", "ai_contexts", "ai_learning_profiles",
                "schedules", "schedule_items", "audit_logs"
            ],
        },
    })


@platform_bp.get("/platform/dashboard")
@require_auth
def platform_dashboard():
    role = normalize_role(g.current_user.get("role"))
    user_id = g.current_user.get("id")
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)

    def count_table(table, where="", params=()):
        cursor.execute(f"SELECT COUNT(*) AS total FROM {table} {where}", params)
        return int((cursor.fetchone() or {}).get("total") or 0)

    def growth_percent(current_total, previous_total):
        if previous_total <= 0:
            return 100 if current_total > 0 else 0
        return round(((current_total - previous_total) / previous_total) * 100)

    stats = {"reports": count_table("reports", "WHERE status IN ('open','reviewing')")}
    assignment = None
    analytics = {}
    stat_growth = {}
    if role == "general_admin":
        stats.update({
            "schools": count_table("schools"),
            "pendingSchoolRequests": count_table(
                "school_requests r JOIN schools s ON s.id = r.school_id",
                "WHERE r.status = 'pending' AND s.status = 'pending'",
            ),
            "unassignedSchools": count_table("schools", "WHERE status = 'approved' AND director_user_id IS NULL"),
            "availableDirectors": count_table(
                "users u", "WHERE u.role = 'school_director' AND u.status = 'active' AND NOT EXISTS (SELECT 1 FROM schools s WHERE s.director_user_id = u.id)"
            ),
            "directors": count_table("users", "WHERE role = 'school_director'"),
        })
    elif role == "school_director":
        cursor.execute("SELECT id, name FROM schools WHERE director_user_id = %s AND status = 'approved' ORDER BY id", (user_id,))
        director_schools = cursor.fetchall()
        assignment = director_schools[0] if director_schools else None
        school_ids = [row["id"] for row in director_schools]
        stats["schools"] = len(school_ids)
        if school_ids:
            school_placeholders = ",".join(["%s"] * len(school_ids))

            def count_scoped(table, where="", params=()):
                cursor.execute(f"SELECT COUNT(*) AS total FROM {table} WHERE {where}", params)
                return int((cursor.fetchone() or {}).get("total") or 0)

            stats.update({
                "classes": count_scoped("classes", f"school_id IN ({school_placeholders})", tuple(school_ids)),
                "courses": count_scoped("courses", f"school_id IN ({school_placeholders})", tuple(school_ids)),
                "quizzes": count_scoped("quizzes", f"school_id IN ({school_placeholders})", tuple(school_ids)),
                "pendingTeacherRequests": count_scoped("teacher_school_requests", f"school_id IN ({school_placeholders}) AND status = 'pending'", tuple(school_ids)),
                "pendingStudentRequests": count_scoped("student_school_requests", f"school_id IN ({school_placeholders}) AND status = 'pending'", tuple(school_ids)),
                "assignments": count_scoped("teacher_assignments", f"school_id IN ({school_placeholders}) AND status = 'active'", tuple(school_ids)),
            })
            cursor.execute(
                f"""
                SELECT COUNT(DISTINCT m.id) AS total
                FROM modules m
                JOIN class_modules cm ON cm.module_id = m.id
                JOIN classes c ON c.id = cm.class_id
                WHERE c.school_id IN ({school_placeholders})
                """,
                tuple(school_ids),
            )
            stats["modules"] = int((cursor.fetchone() or {}).get("total") or 0)
            cursor.execute(
                f"""
                SELECT COUNT(DISTINCT s.user_id) AS total
                FROM students s
                JOIN users u ON u.id = s.user_id
                WHERE s.school_id IN ({school_placeholders})
                  AND s.status = 'active' AND u.status = 'active'
                """,
                tuple(school_ids),
            )
            stats["students"] = int((cursor.fetchone() or {}).get("total") or 0)
            cursor.execute(
                f"""
                SELECT COUNT(DISTINCT t.user_id) AS total
                FROM teachers t
                JOIN users u ON u.id = t.user_id
                WHERE t.school_id IN ({school_placeholders})
                  AND t.status = 'active' AND u.status = 'active'
                """,
                tuple(school_ids),
            )
            stats["teachers"] = int((cursor.fetchone() or {}).get("total") or 0)

            growth_sources = {
                "schools": ("schools", f"id IN ({school_placeholders})"),
                "classes": ("classes", f"school_id IN ({school_placeholders})"),
                "courses": ("courses", f"school_id IN ({school_placeholders})"),
                "quizzes": ("quizzes", f"school_id IN ({school_placeholders})"),
            }
            for key, (table, scope) in growth_sources.items():
                cursor.execute(
                    f"""
                    SELECT
                      SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS currentTotal,
                      SUM(created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
                          AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)) AS previousTotal
                    FROM {table}
                    WHERE {scope}
                    """,
                    tuple(school_ids),
                )
                growth_row = cursor.fetchone() or {}
                stat_growth[key] = growth_percent(int(growth_row.get("currentTotal") or 0), int(growth_row.get("previousTotal") or 0))

            cursor.execute(
                f"""
                SELECT
                  SUM(m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS currentTotal,
                  SUM(m.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
                      AND m.created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)) AS previousTotal
                FROM modules m
                JOIN class_modules cm ON cm.module_id = m.id
                JOIN classes c ON c.id = cm.class_id
                WHERE c.school_id IN ({school_placeholders})
                """,
                tuple(school_ids),
            )
            module_growth = cursor.fetchone() or {}
            stat_growth["modules"] = growth_percent(int(module_growth.get("currentTotal") or 0), int(module_growth.get("previousTotal") or 0))

            cursor.execute(
                f"""
                SELECT
                  SUM(u.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS currentTotal,
                  SUM(u.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
                      AND u.created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)) AS previousTotal
                FROM users u
                LEFT JOIN students s ON s.user_id = u.id
                LEFT JOIN teachers t ON t.user_id = u.id
                WHERE s.school_id IN ({school_placeholders})
                   OR t.school_id IN ({school_placeholders})
                   OR u.id = %s
                """,
                tuple(school_ids + school_ids + [user_id]),
            )
            user_growth = cursor.fetchone() or {}
            stat_growth["users"] = growth_percent(int(user_growth.get("currentTotal") or 0), int(user_growth.get("previousTotal") or 0))

            cursor.execute(
                f"""
                SELECT DATE(m.created_at) AS activityDay, u.role, COUNT(*) AS total
                FROM messages m
                JOIN users u ON u.id = m.sender_user_id
                LEFT JOIN students s ON s.user_id = u.id
                LEFT JOIN teachers t ON t.user_id = u.id
                WHERE m.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                  AND ((u.role IN ('student', 'guest_student') AND s.school_id IN ({school_placeholders}))
                    OR (u.role IN ('teacher', 'guest_teacher') AND t.school_id IN ({school_placeholders})))
                GROUP BY DATE(m.created_at), u.role
                ORDER BY activityDay
                """,
                tuple(school_ids + school_ids),
            )
            activity_rows = cursor.fetchall()
            activity_by_day = {}
            for row in activity_rows:
                key = row["activityDay"].isoformat()
                bucket = activity_by_day.setdefault(key, {"students": 0, "teachers": 0})
                role_key = "students" if normalize_role(row.get("role")) in {"student", "guest_student"} else "teachers"
                bucket[role_key] += int(row.get("total") or 0)
            analytics["activity"] = [
                {
                    "date": (date.today() - timedelta(days=offset)).isoformat(),
                    **activity_by_day.get((date.today() - timedelta(days=offset)).isoformat(), {"students": 0, "teachers": 0}),
                }
                for offset in range(29, -1, -1)
                if (date.today() - timedelta(days=offset)).isoformat() in activity_by_day
            ] or [{
                "date": date.today().isoformat(),
                "students": stats["students"],
                "teachers": stats["teachers"],
                "snapshot": True,
            }]
            cursor.execute(
                f"SELECT COUNT(DISTINCT director_user_id) AS total FROM schools WHERE id IN ({school_placeholders}) AND director_user_id IS NOT NULL",
                tuple(school_ids),
            )
            director_count = int((cursor.fetchone() or {}).get("total") or 0)
            analytics["distribution"] = {
                "students": stats["students"],
                "teachers": stats["teachers"],
                "directors": director_count,
            }
            analytics["content"] = {
                "classes": stats["classes"],
                "modules": stats["modules"],
                "courses": stats["courses"],
                "quizzes": stats["quizzes"],
            }
            cursor.execute(
                f"""
                SELECT title, detail, tone, createdAt FROM (
                  SELECT name AS title, 'Classe créée' AS detail, 'green' AS tone, created_at AS createdAt
                  FROM classes WHERE school_id IN ({school_placeholders})
                  UNION ALL
                  SELECT m.name AS title, 'Module créé' AS detail, 'purple' AS tone, m.created_at AS createdAt
                  FROM modules m
                  JOIN class_modules cm ON cm.module_id = m.id
                  JOIN classes c ON c.id = cm.class_id
                  WHERE c.school_id IN ({school_placeholders})
                  UNION ALL
                  SELECT title, 'Cours créé' AS detail, 'blue' AS tone, created_at AS createdAt
                  FROM courses WHERE school_id IN ({school_placeholders})
                  UNION ALL
                  SELECT title, 'Quiz créé' AS detail, 'yellow' AS tone, created_at AS createdAt
                  FROM quizzes WHERE school_id IN ({school_placeholders})
                  UNION ALL
                  SELECT CONCAT(u.name, ' → ', m.name) AS title, 'Affectation créée' AS detail, 'green' AS tone, ta.created_at AS createdAt
                  FROM teacher_assignments ta
                  JOIN users u ON u.id = ta.teacher_user_id
                  JOIN modules m ON m.id = ta.module_id
                  WHERE ta.school_id IN ({school_placeholders}) AND ta.status = 'active'
                ) recent
                ORDER BY createdAt DESC
                LIMIT 5
                """,
                tuple(school_ids * 5),
            )
            analytics["recentActivities"] = [
                {
                    "title": row.get("title"),
                    "detail": f"{row.get('detail')} · {row.get('createdAt').strftime('%d/%m/%Y') if row.get('createdAt') else ''}",
                    "tone": row.get("tone") or "blue",
                    "createdAt": row.get("createdAt").isoformat() if row.get("createdAt") else None,
                }
                for row in cursor.fetchall()
            ]
        else:
            stats.update({"classes": 0, "modules": 0, "courses": 0, "quizzes": 0, "students": 0, "teachers": 0, "assignments": 0, "pendingTeacherRequests": 0, "pendingStudentRequests": 0})
    elif role in {"student", "guest_student"}:
        cursor.execute(
            "SELECT school_id AS schoolId, main_class_id AS classId FROM students WHERE user_id = %s",
            (user_id,),
        )
        assignment = cursor.fetchone() or {}
        school_id = assignment.get("schoolId")
        class_id = assignment.get("classId")
        stats.update({
            "schools": 1 if school_id else 0,
            "classes": 1 if class_id else 0,
            "modules": count_table("class_modules", "WHERE class_id = %s", (class_id,)) if class_id else 0,
            "courses": count_table("courses", "WHERE class_id = %s", (class_id,)) if class_id else 0,
            "quizzes": count_table("quizzes", "WHERE class_id = %s", (class_id,)) if class_id else 0,
        })
        stats["recommendations"] = count_table(
            "ai_recommendations",
            "WHERE student_user_id = %s AND status != 'completed'",
            (user_id,),
        )
    cursor.close()
    db.close()
    return jsonify({
        "success": True,
        "role": role,
        "permissions": ROLE_MATRIX.get(role, []),
        "stats": stats,
        "statGrowth": stat_growth,
        "analytics": analytics,
        "assignment": assignment,
    })


@platform_bp.get("/admin/users")
@require_roles("general_admin")
def admin_users():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute(
        """
        SELECT u.id, u.name, u.email, u.level, u.role, u.status, u.avatar_url, u.created_at AS createdAt,
               COALESCE(ts.id, ss.id, ds.id) AS schoolId,
               COALESCE(ts.name, ss.name, ds.name) AS schoolName,
               c.id AS classId, c.name AS className
        FROM users u
        LEFT JOIN teachers t ON t.user_id = u.id
        LEFT JOIN schools ts ON ts.id = t.school_id
        LEFT JOIN students st ON st.user_id = u.id
        LEFT JOIN schools ss ON ss.id = st.school_id
        LEFT JOIN classes c ON c.id = st.main_class_id
        LEFT JOIN schools ds ON ds.director_user_id = u.id
        WHERE u.role IN ('school_director', 'teacher', 'student')
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT 200
        """
    )
    rows = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify({"success": True, "users": rows})


@platform_bp.get("/director/students")
@require_roles("school_director")
def director_students():
    director_id = g.current_user.get("id")
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute("SELECT id FROM schools WHERE director_user_id = %s AND status = 'approved'", (director_id,))
    school_ids = [row["id"] for row in cursor.fetchall()]
    if not school_ids:
        cursor.close(); db.close()
        return jsonify({"success": True, "students": []})
    placeholders = ",".join(["%s"] * len(school_ids))
    cursor.execute(
        f"""
        SELECT u.id, u.name, u.email, u.status, u.avatar_url, st.school_id AS schoolId, s.name AS schoolName,
               st.main_class_id AS classId, c.name AS className
        FROM students st
        JOIN users u ON u.id = st.user_id
        JOIN schools s ON s.id = st.school_id
        LEFT JOIN classes c ON c.id = st.main_class_id
        WHERE st.school_id IN ({placeholders}) AND u.role = 'student'
        ORDER BY u.name
        """,
        tuple(school_ids),
    )
    rows = cursor.fetchall()
    cursor.close(); db.close()
    return jsonify({"success": True, "students": rows})


@platform_bp.post("/admin/users")
@require_roles("general_admin")
def create_managed_user():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name") or data.get("fullName") or "").strip()
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    role = normalize_role(data.get("role"))
    status_input = str(data.get("status") or "active").strip().lower()
    status = "disabled" if status_input in {"inactive", "inactif", "disabled", "disable"} else "active"
    school_id = data.get("schoolId") or data.get("school_id")

    if role not in {"teacher", "student"}:
        return jsonify({"success": False, "message": "Role must be teacher or student"}), 400
    if not name or not email or not password:
        return jsonify({"success": False, "message": "Name, email and password are required"}), 400
    if len(password) < 8:
        return jsonify({"success": False, "message": "Password must contain at least 8 characters"}), 400
    try:
        school_id = int(school_id)
    except (TypeError, ValueError):
        return jsonify({"success": False, "message": "School is required"}), 400

    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute("SELECT id FROM users WHERE email = %s LIMIT 1", (email,))
    if cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Email already exists"}), 409
    cursor.execute("SELECT id, name FROM schools WHERE id = %s AND status = 'approved' LIMIT 1", (school_id,))
    school = cursor.fetchone()
    if not school:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "School must be approved"}), 400

    level = "Teacher" if role == "teacher" else "Student"
    cursor.execute(
        """
        INSERT INTO users(name, email, password, level, role, status)
        VALUES(%s, %s, %s, %s, %s, %s)
        """,
        (name[:255], email, generate_password_hash(password), level, role, status),
    )
    user_id = cursor.lastrowid
    if role == "teacher":
        cursor.execute(
            """
            INSERT INTO teachers(user_id, mode, school_id, status)
            VALUES(%s, 'assigned', %s, %s)
            ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), mode = 'assigned', status = VALUES(status)
            """,
            (user_id, school_id, status),
        )
    else:
        cursor.execute(
            """
            INSERT INTO students(user_id, mode, school_id, status)
            VALUES(%s, 'assigned', %s, %s)
            ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), mode = 'assigned', status = VALUES(status)
            """,
            (user_id, school_id, status),
        )
    log_audit(cursor, "managed_user_created", "user", user_id, {"role": role, "schoolId": school_id})
    db.commit()
    cursor.close()
    db.close()
    return jsonify({
        "success": True,
        "message": "User created",
        "user": {
            "id": user_id,
            "name": name,
            "email": email,
            "role": role,
            "level": level,
            "status": status,
            "schoolId": school_id,
            "schoolName": school["name"],
        },
    }), 201


@platform_bp.get("/users/<int:user_id>/profile")
@require_roles("general_admin", "school_director")
def managed_user_profile(user_id):
    viewer_role = normalize_role(g.current_user.get("role"))
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute("SELECT id, name, email, role, level, status, avatar_url, created_at AS createdAt FROM users WHERE id = %s", (user_id,))
    profile = cursor.fetchone()
    if not profile:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "User not found"}), 404
    role = normalize_role(profile.get("role"))
    if role in {"student", "guest_student"}:
        cursor.execute("""
            SELECT s.phone, s.birth_date AS birthDate, s.education_level AS educationLevel,
                   s.guardian_name AS guardianName, s.guardian_phone AS guardianPhone,
                   s.learning_style AS learningStyle, s.notes, sc.id AS schoolId, sc.name AS schoolName,
                   c.id AS classId, c.name AS className
            FROM students s LEFT JOIN schools sc ON sc.id = s.school_id LEFT JOIN classes c ON c.id = s.main_class_id
            WHERE s.user_id = %s
        """, (user_id,))
        details = cursor.fetchone() or {}
    elif role in {"teacher", "guest_teacher"}:
        cursor.execute("""
            SELECT t.bio, t.specialties_json AS specialtiesJson, sc.id AS schoolId, sc.name AS schoolName,
                   GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS classes,
                   GROUP_CONCAT(DISTINCT m.name ORDER BY m.name SEPARATOR ', ') AS modules
            FROM teachers t LEFT JOIN schools sc ON sc.id = t.school_id
            LEFT JOIN class_teachers ct ON ct.teacher_user_id = t.user_id AND ct.status = 'approved'
            LEFT JOIN classes c ON c.id = ct.class_id
            LEFT JOIN module_teachers mt ON mt.teacher_user_id = t.user_id
            LEFT JOIN modules m ON m.id = mt.module_id
            WHERE t.user_id = %s GROUP BY t.user_id, t.bio, t.specialties_json, sc.id, sc.name
        """, (user_id,))
        details = cursor.fetchone() or {}
    else:
        cursor.execute("SELECT id AS schoolId, name AS schoolName, city, official_email AS officialEmail FROM schools WHERE director_user_id = %s LIMIT 1", (user_id,))
        details = cursor.fetchone() or {}
    if viewer_role == "school_director":
        viewer_school_query = "SELECT id FROM schools WHERE director_user_id = %s"
        cursor.execute(viewer_school_query, (g.current_user.get("id"),)); viewer_school = cursor.fetchone() or {}
        allowed = bool(viewer_school and details.get("schoolId") == viewer_school.get("id"))
        if viewer_school and not allowed:
            cursor.execute("""
                SELECT 1 FROM teacher_school_requests WHERE teacher_user_id = %s AND school_id = %s AND status = 'pending'
                UNION ALL
                SELECT 1 FROM student_school_requests WHERE student_user_id = %s AND school_id = %s AND status = 'pending'
                UNION ALL
                SELECT 1 FROM student_class_requests r JOIN classes c ON c.id = r.class_id WHERE r.student_user_id = %s AND c.school_id = %s AND r.status = 'pending'
                LIMIT 1
            """, (user_id, viewer_school.get("id"), user_id, viewer_school.get("id"), user_id, viewer_school.get("id")))
            allowed = bool(cursor.fetchone())
        if not allowed:
            cursor.close(); db.close()
            return jsonify({"success": False, "message": "Profile is outside your school"}), 403
    profile.update(details)
    cursor.close(); db.close()
    return jsonify({"success": True, "profile": profile})


@platform_bp.patch("/admin/users/<int:user_id>/status")
@require_roles("general_admin")
def update_user_status(user_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in {"active", "disabled"}:
        return jsonify({"success": False, "message": "status must be active or disabled"}), 400
    db = get_db()
    cursor = db.cursor()
    ensure_complete_platform_tables(cursor)
    cursor.execute("UPDATE users SET status = %s WHERE id = %s AND role = 'school_director'", (status, user_id))
    if cursor.rowcount == 0:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Only director accounts can be managed here"}), 403
    log_audit(cursor, "user_status_updated", "user", user_id, {"status": status})
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "message": f"User {status}"})


@platform_bp.get("/admin/audit-logs")
@require_roles("general_admin")
def audit_logs():
    rows = []
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute(
        """
        SELECT id, actor_user_id AS actorUserId, action, entity_type AS entityType,
               entity_id AS entityId, metadata_json AS metadataJson, created_at AS createdAt
        FROM audit_logs
        ORDER BY created_at DESC, id DESC
        LIMIT 100
        """
    )
    rows = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify({"success": True, "auditLogs": rows})


@platform_bp.get("/reports")
@require_auth
def list_reports():
    role = normalize_role(g.current_user.get("role"))
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    select_sql = """
        SELECT r.*,
               CASE
                 WHEN r.target_type = 'school' THEN s.name
                 WHEN r.target_type = 'class' THEN c.name
                 WHEN r.target_type = 'module' THEN m.name
                 ELSE NULL
               END AS targetName
        FROM reports r
        LEFT JOIN schools s ON r.target_type = 'school' AND r.target_id = s.id
        LEFT JOIN classes c ON r.target_type = 'class' AND r.target_id = c.id
        LEFT JOIN modules m ON r.target_type = 'module' AND r.target_id = m.id
    """
    if role == "general_admin":
        cursor.execute(f"{select_sql} ORDER BY r.created_at DESC LIMIT 100")
    else:
        cursor.execute(
            f"{select_sql} WHERE r.reporter_user_id = %s ORDER BY r.created_at DESC LIMIT 100",
            (g.current_user.get("id"),),
        )
    rows = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify({"success": True, "reports": rows})


@platform_bp.post("/reports")
@require_auth
def create_report():
    data = request.get_json(silent=True) or {}
    if not data.get("title"):
        return jsonify({"success": False, "message": "Report title is required"}), 400
    priority = data.get("priority") or "medium"
    if priority not in {"low", "medium", "high"}:
        return jsonify({"success": False, "message": "Invalid report priority"}), 400
    target_type = data.get("targetType")
    if target_type not in {"school", "class", "module", "technical"}:
        return jsonify({"success": False, "message": "Invalid report type"}), 400
    target_id = data.get("targetId")
    if target_id in ("", None):
        target_id = None
    db = get_db()
    cursor = db.cursor()
    ensure_complete_platform_tables(cursor)
    cursor.execute(
        """
        INSERT INTO reports(reporter_user_id, target_type, target_id, title, body, priority)
        VALUES(%s, %s, %s, %s, %s, %s)
        """,
        (
            g.current_user.get("id"),
            target_type,
            target_id,
            data.get("title"),
            data.get("body"),
            priority,
        ),
    )
    report_id = cursor.lastrowid
    log_audit(cursor, "report_created", "report", report_id)
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "reportId": report_id, "message": "Report submitted"}), 201


@platform_bp.patch("/reports/<int:report_id>")
@require_auth
def update_report(report_id):
    data = request.get_json(silent=True) or {}
    role = normalize_role(g.current_user.get("role"))
    target_id = data.get("targetId") if "targetId" in data else data.get("target_id")
    if target_id == "":
        target_id = None
    allowed_fields = {
        "title": data.get("title"),
        "target_type": data.get("targetType") or data.get("target_type"),
        "target_id": target_id,
        "body": data.get("body"),
        "priority": data.get("priority"),
        "status": data.get("status"),
    }
    assignments = [(field, value) for field, value in allowed_fields.items() if value is not None]
    if not assignments:
        return jsonify({"success": False, "message": "No report fields provided"}), 400
    if any(field == "status" and value not in {"open", "reviewing", "resolved", "rejected"} for field, value in assignments):
        return jsonify({"success": False, "message": "Invalid report status"}), 400
    if any(field == "priority" and value not in {"low", "medium", "high"} for field, value in assignments):
        return jsonify({"success": False, "message": "Invalid report priority"}), 400
    if any(field == "target_type" and value not in {"school", "class", "module", "technical"} for field, value in assignments):
        return jsonify({"success": False, "message": "Invalid report type"}), 400

    db = get_db()
    cursor = db.cursor()
    ensure_complete_platform_tables(cursor)
    set_clause = ", ".join([f"{field} = %s" for field, _ in assignments])
    params = [value for _, value in assignments]
    if role == "general_admin":
        params.append(report_id)
        cursor.execute(f"UPDATE reports SET {set_clause} WHERE id = %s", tuple(params))
    else:
        params.extend([report_id, g.current_user.get("id")])
        cursor.execute(f"UPDATE reports SET {set_clause} WHERE id = %s AND reporter_user_id = %s", tuple(params))
    if cursor.rowcount == 0:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Report not found or outside your permissions"}), 404
    log_audit(cursor, "report_updated", "report", report_id)
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "message": "Report updated"})


@platform_bp.delete("/reports/<int:report_id>")
@require_auth
def delete_report(report_id):
    role = normalize_role(g.current_user.get("role"))
    db = get_db()
    cursor = db.cursor()
    ensure_complete_platform_tables(cursor)
    if role == "general_admin":
        cursor.execute("DELETE FROM reports WHERE id = %s", (report_id,))
    else:
        cursor.execute("DELETE FROM reports WHERE id = %s AND reporter_user_id = %s", (report_id, g.current_user.get("id")))
    if cursor.rowcount == 0:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Report not found or outside your permissions"}), 404
    log_audit(cursor, "report_deleted", "report", report_id)
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "message": "Report deleted"})


@platform_bp.post("/teacher-school-requests")
@require_roles("teacher", "guest_teacher")
def create_teacher_school_request():
    data = request.get_json(silent=True) or {}
    if not data.get("schoolId"):
        return jsonify({"success": False, "message": "schoolId is required"}), 400
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute("SELECT id FROM schools WHERE id = %s AND status = 'approved' AND director_user_id IS NOT NULL", (data.get("schoolId"),))
    if not cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "School is not available for requests"}), 404
    cursor.execute("SELECT id FROM teacher_school_requests WHERE teacher_user_id = %s AND status = 'pending'", (g.current_user.get("id"),))
    if cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "A school request is already pending"}), 409
    cursor.execute("INSERT INTO teachers(user_id, mode, status) VALUES(%s, 'free', 'active') ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)", (g.current_user.get("id"),))
    cursor.execute(
        """
        INSERT INTO teacher_school_requests(teacher_user_id, school_id, message)
        VALUES(%s, %s, %s)
        """,
        (g.current_user.get("id"), data.get("schoolId"), data.get("message")),
    )
    request_id = cursor.lastrowid
    cursor.execute("SELECT director_user_id, name FROM schools WHERE id = %s", (data.get("schoolId"),))
    school = cursor.fetchone() or {}
    notify(cursor, school.get("director_user_id"), "Demande d'un enseignant", f"{g.current_user.get('name')} souhaite rejoindre {school.get('name') or 'votre école'}.", "approval", "/platform#requests")
    log_audit(cursor, "teacher_school_request_created", "teacher_school_request", request_id)
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "requestId": request_id}), 201


@platform_bp.get("/validation-requests")
@require_roles("school_director", "general_admin")
def validation_requests():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    if normalize_role(g.current_user.get("role")) == "general_admin":
        cursor.execute(
            """
            SELECT 'school' AS type, r.id, r.requester_user_id AS userId, r.school_id AS targetId,
                   COALESCE(u.name, s.director_name) AS userName, u.email AS userEmail,
                   s.name AS targetName, s.name AS schoolName, s.id AS schoolId,
                   CONCAT('Demande de validation pour ', s.name) AS message,
                   r.status, r.created_at AS createdAt
            FROM school_requests r
            JOIN schools s ON s.id = r.school_id
            LEFT JOIN users u ON u.id = r.requester_user_id
            WHERE r.status = 'pending' AND s.status = 'pending'
            ORDER BY r.created_at DESC
            """
        )
        rows = cursor.fetchall()
        cursor.close()
        db.close()
        return jsonify({"success": True, "requests": rows})
    cursor.execute("SELECT id FROM schools WHERE director_user_id = %s", (g.current_user.get("id"),))
    school_ids = [row["id"] for row in cursor.fetchall()]
    if not school_ids:
        cursor.close()
        db.close()
        return jsonify({"success": True, "requests": []})
    placeholders = ",".join(["%s"] * len(school_ids))
    cursor.execute(
        f"""
        SELECT 'teacher_school' AS type, r.id, r.teacher_user_id AS userId, r.school_id AS targetId,
               u.name AS userName, s.name AS targetName, r.message, r.status, r.created_at AS createdAt
        FROM teacher_school_requests r
        JOIN users u ON u.id = r.teacher_user_id
        JOIN schools s ON s.id = r.school_id
        WHERE r.status = 'pending' AND r.school_id IN ({placeholders})
        UNION ALL
        SELECT 'student_school' AS type, r.id, r.student_user_id AS userId, r.school_id AS targetId,
               u.name AS userName, s.name AS targetName, r.message, r.status, r.created_at AS createdAt
        FROM student_school_requests r
        JOIN users u ON u.id = r.student_user_id
        JOIN schools s ON s.id = r.school_id
        WHERE r.status = 'pending' AND r.school_id IN ({placeholders})
        UNION ALL
        SELECT 'student_class' AS type, r.id, r.student_user_id AS userId, r.class_id AS targetId,
               u.name AS userName, c.name AS targetName, r.message, r.status, r.created_at AS createdAt
        FROM student_class_requests r
        JOIN users u ON u.id = r.student_user_id
        JOIN classes c ON c.id = r.class_id
        WHERE r.status = 'pending' AND c.school_id IN ({placeholders})
        ORDER BY createdAt DESC
        """,
        tuple(school_ids + school_ids + school_ids),
    )
    rows = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify({"success": True, "requests": rows})


@platform_bp.get("/admin/director-assignments")
@require_roles("general_admin")
def director_assignments():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute(
        """
        SELECT id, name, address, city, country, phone, school_type AS schoolType,
               official_email AS officialEmail, director_name AS directorName,
               director_email AS directorEmail, logo_url AS logoUrl,
               legal_documents_json AS legalDocumentsJson, status, created_at AS createdAt
        FROM schools
        WHERE (status = 'approved' AND director_user_id IS NULL)
           OR (
                status = 'pending'
                AND EXISTS (
                    SELECT 1 FROM school_requests r
                    WHERE r.school_id = schools.id AND r.status = 'pending'
                )
              )
        ORDER BY FIELD(status, 'pending', 'approved', 'rejected'), created_at DESC, name
        """
    )
    schools = [format_school_row(row) for row in cursor.fetchall()]
    cursor.execute(
        """
        SELECT u.id, u.name, u.email, u.avatar_url
        FROM users u
        WHERE u.role = 'school_director' AND u.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM schools s WHERE s.director_user_id = u.id)
        ORDER BY u.name
        """
    )
    directors = cursor.fetchall()
    cursor.close()
    db.close()
    return jsonify({"success": True, "schools": schools, "directors": directors})


@platform_bp.patch("/admin/schools/<int:school_id>/director")
@require_roles("general_admin")
def assign_school_director(school_id):
    data = request.get_json(silent=True) or {}
    director_id = data.get("directorId")
    if not director_id:
        return jsonify({"success": False, "message": "directorId is required"}), 400
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute("SELECT id FROM schools WHERE id = %s AND status = 'approved' AND director_user_id IS NULL", (school_id,))
    if not cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "School is unavailable or already assigned"}), 409
    cursor.execute(
        "SELECT id, name, email FROM users WHERE id = %s AND role = 'school_director' AND status = 'active'",
        (director_id,),
    )
    notify(cursor, director_id, "École affectée", "Vous êtes maintenant directeur de cet établissement.", "assignment", "/platform#overview")
    director = cursor.fetchone()
    cursor.execute("SELECT id FROM schools WHERE director_user_id = %s", (director_id,))
    if not director or cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Director is unavailable or already assigned"}), 409
    cursor.execute(
        "UPDATE schools SET director_user_id = %s, director_name = %s, director_email = %s WHERE id = %s",
        (director_id, director["name"], director["email"], school_id),
    )
    log_audit(cursor, "school_director_assigned", "school", school_id, {"directorId": director_id})
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Director assigned"})


@platform_bp.post("/student-school-requests")
@require_roles("student", "guest_student")
def create_student_school_request():
    data = request.get_json(silent=True) or {}
    school_id = data.get("schoolId")
    if not school_id:
        return jsonify({"success": False, "message": "schoolId is required"}), 400
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute("SELECT id FROM schools WHERE id = %s AND status = 'approved' AND director_user_id IS NOT NULL", (school_id,))
    if not cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "School is not available for requests"}), 404
    cursor.execute("SELECT school_id FROM students WHERE user_id = %s", (g.current_user.get("id"),))
    student = cursor.fetchone() or {}
    if student.get("school_id"):
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Student already belongs to a school"}), 409
    cursor.execute(
        "SELECT id FROM student_school_requests WHERE student_user_id = %s AND status = 'pending'",
        (g.current_user.get("id"),),
    )
    if cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "A school request is already pending"}), 409
    cursor.execute(
        "INSERT INTO student_school_requests(student_user_id, school_id, message) VALUES(%s, %s, %s)",
        (g.current_user.get("id"), school_id, data.get("message")),
    )
    request_id = cursor.lastrowid
    cursor.execute("SELECT director_user_id, name FROM schools WHERE id = %s", (school_id,))
    school = cursor.fetchone() or {}
    notify(cursor, school.get("director_user_id"), "Nouvelle demande d'école", f"{g.current_user.get('name')} souhaite rejoindre {school.get('name') or 'votre école'}.", "approval", "/platform#requests")
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "requestId": request_id}), 201


@platform_bp.post("/student-class-requests")
@require_roles("student", "guest_student")
def create_student_class_request():
    data = request.get_json(silent=True) or {}
    class_id = data.get("classId")
    if not class_id:
        return jsonify({"success": False, "message": "classId is required"}), 400
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute(
        """
        SELECT s.school_id AS studentSchoolId, s.main_class_id AS classId, c.school_id AS classSchoolId
        FROM students s JOIN classes c ON c.id = %s WHERE s.user_id = %s
        """,
        (class_id, g.current_user.get("id")),
    )
    scope = cursor.fetchone()
    if not scope or not scope.get("studentSchoolId") or scope.get("studentSchoolId") != scope.get("classSchoolId"):
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Class must belong to the student's school"}), 403
    if scope.get("classId"):
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Student already belongs to a class"}), 409
    cursor.execute(
        "SELECT id FROM student_class_requests WHERE student_user_id = %s AND status = 'pending'",
        (g.current_user.get("id"),),
    )
    if cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "A class request is already pending"}), 409
    cursor.execute(
        "INSERT INTO student_class_requests(student_user_id, class_id, message) VALUES(%s, %s, %s)",
        (g.current_user.get("id"), class_id, data.get("message")),
    )
    request_id = cursor.lastrowid
    cursor.execute("SELECT s.director_user_id, c.name FROM classes c JOIN schools s ON s.id = c.school_id WHERE c.id = %s", (class_id,))
    class_scope = cursor.fetchone() or {}
    notify(cursor, class_scope.get("director_user_id"), "Nouvelle demande de classe", f"{g.current_user.get('name')} souhaite rejoindre {class_scope.get('name') or 'une classe'}.", "approval", "/platform#requests")
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "requestId": request_id}), 201


@platform_bp.patch("/validation-requests/<request_type>/<int:request_id>")
@require_roles("school_director", "general_admin")
def decide_validation_request(request_type, request_id):
    data = request.get_json(silent=True) or {}
    decision = data.get("status")
    if decision not in {"approved", "rejected"}:
        return jsonify({"success": False, "message": "status must be approved or rejected"}), 400
    role = normalize_role(g.current_user.get("role"))
    if request_type == "school":
        if role != "general_admin":
            return jsonify({"success": False, "message": "Only admins can decide school requests"}), 403
        db = get_db(); cursor = db.cursor(dictionary=True)
        ensure_complete_platform_tables(cursor)
        cursor.execute(
            """
            SELECT r.id, r.school_id AS schoolId, r.requester_user_id AS requesterUserId,
                   s.name AS schoolName
            FROM school_requests r
            JOIN schools s ON s.id = r.school_id
            WHERE r.id = %s AND r.status = 'pending' AND s.status = 'pending'
            LIMIT 1
            """,
            (request_id,),
        )
        row = cursor.fetchone()
        if not row:
            cursor.close(); db.close()
            return jsonify({"success": False, "message": "Pending school request not found"}), 404
        reason = data.get("reason", "")
        cursor.execute(
            "UPDATE schools SET status = %s, rejection_reason = %s WHERE id = %s",
            (decision, reason if decision == "rejected" else None, row["schoolId"]),
        )
        cursor.execute("DELETE FROM school_requests WHERE id = %s", (request_id,))
        notify(
            cursor,
            row.get("requesterUserId"),
            "Demande d'école approuvée" if decision == "approved" else "Demande d'école refusée",
            reason or (f"{row.get('schoolName') or 'Votre établissement'} est maintenant validé." if decision == "approved" else "Votre demande d'établissement n'a pas été acceptée."),
            "approval",
            "/platform#schools",
        )
        db.commit(); cursor.close(); db.close()
        return jsonify({"success": True, "message": f"School request {decision}", "schoolId": row["schoolId"]})
    if role != "school_director":
        return jsonify({"success": False, "message": "Only school directors can decide attachment requests"}), 403
    mapping = {
        "teacher_school": ("teacher_school_requests", "teacher_user_id", "school_id"),
        "student_school": ("student_school_requests", "student_user_id", "school_id"),
        "student_class": ("student_class_requests", "student_user_id", "class_id"),
    }
    if request_type not in mapping:
        return jsonify({"success": False, "message": "Unknown request type"}), 404
    table, user_column, target_column = mapping[request_type]
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    if request_type == "student_class":
        cursor.execute(
            f"SELECT r.*, c.school_id AS schoolId FROM {table} r JOIN classes c ON c.id = r.{target_column} WHERE r.id = %s AND r.status = 'pending'",
            (request_id,),
        )
    else:
        cursor.execute(f"SELECT *, {target_column} AS schoolId FROM {table} WHERE id = %s AND status = 'pending'", (request_id,))
    row = cursor.fetchone()
    cursor.execute("SELECT id FROM schools WHERE id = %s AND director_user_id = %s", ((row or {}).get("schoolId"), g.current_user.get("id")))
    if not row or not cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Request is outside your school"}), 403
    cursor.execute(
        f"UPDATE {table} SET status = %s, decided_by = %s, decision_reason = %s, decided_at = NOW() WHERE id = %s",
        (decision, g.current_user.get("id"), data.get("reason"), request_id),
    )
    if decision == "approved" and request_type == "teacher_school":
        cursor.execute("UPDATE teachers SET school_id = %s, mode = 'assigned' WHERE user_id = %s", (row["school_id"], row[user_column]))
    elif decision == "approved" and request_type == "student_school":
        cursor.execute("UPDATE students SET school_id = %s, mode = 'assigned', main_class_id = NULL WHERE user_id = %s", (row["school_id"], row[user_column]))
    elif decision == "approved":
        cursor.execute("UPDATE students SET main_class_id = %s WHERE user_id = %s", (row["class_id"], row[user_column]))
        cursor.execute("INSERT INTO class_students(class_id, student_user_id, status) VALUES(%s, %s, 'approved') ON DUPLICATE KEY UPDATE status = 'approved'", (row["class_id"], row[user_column]))
    notify(
        cursor,
        row[user_column],
        "Demande approuvée" if decision == "approved" else "Demande refusée",
        data.get("reason") or ("Votre affectation est maintenant active." if decision == "approved" else "Votre demande n'a pas été acceptée."),
        "approval",
        "/settings" if request_type.startswith("student") else "/platform#overview",
    )
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": f"Request {decision}"})


@platform_bp.get("/director/teachers")
@require_roles("school_director")
def director_teachers():
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute("SELECT id FROM schools WHERE director_user_id = %s", (g.current_user.get("id"),))
    school_ids = [row["id"] for row in cursor.fetchall()]
    if not school_ids:
        cursor.close(); db.close()
        return jsonify({"success": True, "teachers": []})
    placeholders = ",".join(["%s"] * len(school_ids))
    cursor.execute(
        f"""
        SELECT u.id, u.name, u.email, u.avatar_url
        FROM teachers t
        JOIN users u ON u.id = t.user_id
        WHERE t.school_id IN ({placeholders})
          AND t.status = 'active'
          AND u.status = 'active'
        ORDER BY u.name
        """,
        tuple(school_ids),
    )
    teachers = cursor.fetchall(); cursor.close(); db.close()
    return jsonify({"success": True, "teachers": teachers})


@platform_bp.get("/director/teacher-assignments")
@require_roles("school_director", "general_admin")
def list_teacher_assignments():
    role = normalize_role(g.current_user.get("role"))
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    where = "WHERE ta.status != 'archived'"
    params = []
    if role == "school_director":
        where += " AND ta.school_id IN (SELECT id FROM schools WHERE director_user_id = %s)"
        params.append(g.current_user.get("id"))
    cursor.execute(
        f"""
        SELECT ta.id, ta.teacher_user_id AS teacherId, u.name AS teacherName,
               u.email AS teacherEmail, u.avatar_url AS teacherAvatarUrl,
               ta.class_id AS classId, c.name AS className,
               ta.module_id AS moduleId, m.name AS moduleName, ta.school_id AS schoolId,
               s.name AS schoolName, ta.status, ta.created_at AS createdAt
        FROM teacher_assignments ta
        JOIN users u ON u.id = ta.teacher_user_id
        JOIN classes c ON c.id = ta.class_id
        JOIN modules m ON m.id = ta.module_id
        JOIN schools s ON s.id = ta.school_id
        {where}
        ORDER BY ta.created_at DESC, ta.id DESC
        """,
        tuple(params),
    )
    rows = cursor.fetchall()
    cursor.close(); db.close()
    return jsonify({"success": True, "assignments": rows})


@platform_bp.post("/director/teacher-assignments")
@require_roles("school_director")
def create_teacher_assignment():
    data = request.get_json(silent=True) or {}
    teacher_id = data.get("teacherId")
    class_ids = [int(value) for value in data.get("classIds", [])]
    module_ids = [int(value) for value in data.get("moduleIds", [])]
    if not teacher_id or not class_ids or not module_ids:
        return jsonify({"success": False, "message": "Teacher, class and module are required"}), 400
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute("SELECT id FROM schools WHERE director_user_id = %s", (g.current_user.get("id"),))
    school_ids = [row["id"] for row in cursor.fetchall()]
    if not school_ids:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Teacher is outside your school"}), 403
    placeholders = ",".join(["%s"] * len(school_ids))
    cursor.execute(
        f"SELECT user_id FROM teachers WHERE user_id = %s AND school_id IN ({placeholders}) AND status = 'active'",
        tuple([teacher_id] + school_ids),
    )
    if not cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Teacher is outside your school"}), 403
    assignments = []
    for class_id in class_ids:
        cursor.execute(
            f"SELECT id, school_id AS schoolId FROM classes WHERE id = %s AND school_id IN ({placeholders})",
            tuple([class_id] + school_ids),
        )
        class_row = cursor.fetchone()
        if not class_row:
            cursor.close(); db.close()
            return jsonify({"success": False, "message": "One or more classes are outside your school"}), 403
        for module_id in module_ids:
            cursor.execute(
                """
                SELECT m.id
                FROM modules m
                JOIN class_modules cm ON cm.module_id = m.id
                WHERE m.id = %s AND cm.class_id = %s
                LIMIT 1
                """,
                (module_id, class_id),
            )
            if not cursor.fetchone():
                cursor.close(); db.close()
                return jsonify({"success": False, "message": "One or more modules are not linked to the selected class"}), 400
            assignments.append((int(teacher_id), class_id, module_id, class_row["schoolId"]))
    for assignment in assignments:
        cursor.execute(
            """
            SELECT id FROM teacher_assignments
            WHERE teacher_user_id = %s AND class_id = %s AND module_id = %s AND status != 'archived'
            LIMIT 1
            """,
            assignment[:3],
        )
        if cursor.fetchone():
            cursor.close(); db.close()
            return jsonify({"success": False, "message": "This assignment already exists"}), 409
    for teacher_user_id, class_id, module_id, school_id in assignments:
        cursor.execute(
            """
            SELECT id FROM teacher_assignments
            WHERE teacher_user_id = %s AND class_id = %s AND module_id = %s AND status = 'archived'
            LIMIT 1
            """,
            (teacher_user_id, class_id, module_id),
        )
        archived_assignment = cursor.fetchone()
        if archived_assignment:
            cursor.execute(
                """
                UPDATE teacher_assignments
                SET school_id = %s, status = 'active', created_by = %s
                WHERE id = %s
                """,
                (school_id, g.current_user.get("id"), archived_assignment["id"]),
            )
        else:
            cursor.execute(
                """
                INSERT INTO teacher_assignments(teacher_user_id, class_id, module_id, school_id, status, created_by)
                VALUES(%s, %s, %s, %s, 'active', %s)
                """,
                (teacher_user_id, class_id, module_id, school_id, g.current_user.get("id")),
            )
        cursor.execute("INSERT INTO class_teachers(class_id, teacher_user_id, status) VALUES(%s, %s, 'approved') ON DUPLICATE KEY UPDATE status = 'approved'", (class_id, teacher_user_id))
        cursor.execute("INSERT IGNORE INTO module_teachers(module_id, teacher_user_id) VALUES(%s, %s)", (module_id, teacher_user_id))
    notify(cursor, teacher_id, "Nouvelles affectations pédagogiques", "Vos classes et modules ont été mis à jour.", "assignment", "/teacher-dashboard")
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Teacher assignments saved", "created": len(assignments)}), 201


@platform_bp.patch("/director/teacher-assignments/<int:assignment_id>")
@require_roles("school_director")
def update_teacher_assignment(assignment_id):
    data = request.get_json(silent=True) or {}
    teacher_id = data.get("teacherId")
    class_ids = [int(value) for value in data.get("classIds", [])]
    module_ids = [int(value) for value in data.get("moduleIds", [])]
    if not teacher_id or len(class_ids) != 1 or len(module_ids) != 1:
        return jsonify({"success": False, "message": "Select one teacher, one class and one module"}), 400
    class_id = class_ids[0]
    module_id = module_ids[0]
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute("SELECT id FROM schools WHERE director_user_id = %s", (g.current_user.get("id"),))
    school_ids = [row["id"] for row in cursor.fetchall()]
    if not school_ids:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Assignment not found"}), 404
    placeholders = ",".join(["%s"] * len(school_ids))
    cursor.execute(
        f"SELECT * FROM teacher_assignments WHERE id = %s AND school_id IN ({placeholders}) AND status != 'archived' LIMIT 1",
        tuple([assignment_id] + school_ids),
    )
    current_assignment = cursor.fetchone()
    if not current_assignment:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Assignment not found"}), 404
    cursor.execute(
        f"SELECT user_id FROM teachers WHERE user_id = %s AND school_id IN ({placeholders}) AND status = 'active'",
        tuple([teacher_id] + school_ids),
    )
    if not cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Teacher is outside your school"}), 403
    cursor.execute(
        f"SELECT id, school_id AS schoolId FROM classes WHERE id = %s AND school_id IN ({placeholders})",
        tuple([class_id] + school_ids),
    )
    class_row = cursor.fetchone()
    if not class_row:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Class is outside your school"}), 403
    cursor.execute(
        """
        SELECT m.id
        FROM modules m
        JOIN class_modules cm ON cm.module_id = m.id
        WHERE m.id = %s AND cm.class_id = %s
        LIMIT 1
        """,
        (module_id, class_id),
    )
    if not cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Module is not linked to the selected class"}), 400
    cursor.execute(
        """
        SELECT id FROM teacher_assignments
        WHERE teacher_user_id = %s AND class_id = %s AND module_id = %s
          AND status != 'archived' AND id != %s
        LIMIT 1
        """,
        (teacher_id, class_id, module_id, assignment_id),
    )
    if cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "This assignment already exists"}), 409
    cursor.execute(
        """
        UPDATE teacher_assignments
        SET teacher_user_id = %s, class_id = %s, module_id = %s, school_id = %s,
            status = 'active', created_by = %s
        WHERE id = %s
        """,
        (teacher_id, class_id, module_id, class_row["schoolId"], g.current_user.get("id"), assignment_id),
    )
    cursor.execute(
        "SELECT 1 FROM teacher_assignments WHERE teacher_user_id = %s AND class_id = %s AND status = 'active' AND id != %s LIMIT 1",
        (current_assignment["teacher_user_id"], current_assignment["class_id"], assignment_id),
    )
    if not cursor.fetchone():
        cursor.execute("DELETE FROM class_teachers WHERE teacher_user_id = %s AND class_id = %s", (current_assignment["teacher_user_id"], current_assignment["class_id"]))
    cursor.execute(
        "SELECT 1 FROM teacher_assignments WHERE teacher_user_id = %s AND module_id = %s AND status = 'active' AND id != %s LIMIT 1",
        (current_assignment["teacher_user_id"], current_assignment["module_id"], assignment_id),
    )
    if not cursor.fetchone():
        cursor.execute("DELETE FROM module_teachers WHERE teacher_user_id = %s AND module_id = %s", (current_assignment["teacher_user_id"], current_assignment["module_id"]))
    cursor.execute("INSERT INTO class_teachers(class_id, teacher_user_id, status) VALUES(%s, %s, 'approved') ON DUPLICATE KEY UPDATE status = 'approved'", (class_id, teacher_id))
    cursor.execute("INSERT IGNORE INTO module_teachers(module_id, teacher_user_id) VALUES(%s, %s)", (module_id, teacher_id))
    notify(cursor, teacher_id, "Nouvelles affectations pédagogiques", "Vos classes et modules ont été mis à jour.", "assignment", "/teacher-dashboard")
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Assignment updated"})


@platform_bp.delete("/director/teacher-assignments/<int:assignment_id>")
@require_roles("school_director", "general_admin")
def delete_teacher_assignment(assignment_id):
    role = normalize_role(g.current_user.get("role"))
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    scope_sql = ""
    params = [assignment_id]
    if role == "school_director":
        scope_sql = "AND ta.school_id IN (SELECT id FROM schools WHERE director_user_id = %s)"
        params.append(g.current_user.get("id"))
    cursor.execute(
        f"SELECT ta.* FROM teacher_assignments ta WHERE ta.id = %s {scope_sql} AND ta.status != 'archived' LIMIT 1",
        tuple(params),
    )
    assignment = cursor.fetchone()
    if not assignment:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Assignment not found"}), 404
    cursor.execute("UPDATE teacher_assignments SET status = 'archived' WHERE id = %s", (assignment_id,))
    cursor.execute(
        "SELECT 1 FROM teacher_assignments WHERE teacher_user_id = %s AND class_id = %s AND status = 'active' AND id != %s LIMIT 1",
        (assignment["teacher_user_id"], assignment["class_id"], assignment_id),
    )
    if not cursor.fetchone():
        cursor.execute("DELETE FROM class_teachers WHERE teacher_user_id = %s AND class_id = %s", (assignment["teacher_user_id"], assignment["class_id"]))
    cursor.execute(
        "SELECT 1 FROM teacher_assignments WHERE teacher_user_id = %s AND module_id = %s AND status = 'active' AND id != %s LIMIT 1",
        (assignment["teacher_user_id"], assignment["module_id"], assignment_id),
    )
    if not cursor.fetchone():
        cursor.execute("DELETE FROM module_teachers WHERE teacher_user_id = %s AND module_id = %s", (assignment["teacher_user_id"], assignment["module_id"]))
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Assignment deleted"})


@platform_bp.get("/director/student-assignments")
@require_roles("school_director")
def list_student_assignments():
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute(
        """
        SELECT MIN(sa.id) AS id, sa.student_user_id AS studentId, u.name AS studentName,
               u.email AS studentEmail, u.avatar_url AS studentAvatarUrl,
               sa.class_id AS classId, c.name AS className,
               sa.school_id AS schoolId, s.name AS schoolName, sa.status,
               GROUP_CONCAT(sa.module_id ORDER BY m.name SEPARATOR ',') AS moduleIdsCsv,
               GROUP_CONCAT(m.name ORDER BY m.name SEPARATOR ', ') AS moduleNames,
               MAX(sa.created_at) AS createdAt
        FROM student_assignments sa
        JOIN users u ON u.id = sa.student_user_id
        JOIN classes c ON c.id = sa.class_id
        JOIN modules m ON m.id = sa.module_id
        JOIN schools s ON s.id = sa.school_id
        WHERE sa.status != 'archived'
          AND sa.school_id IN (SELECT id FROM schools WHERE director_user_id = %s)
        GROUP BY sa.student_user_id, u.name, u.email, u.avatar_url, sa.class_id, c.name, sa.school_id, s.name, sa.status
        ORDER BY createdAt DESC, id DESC
        """,
        (g.current_user.get("id"),),
    )
    rows = cursor.fetchall()
    for row in rows:
        row["moduleIds"] = [int(value) for value in str(row.pop("moduleIdsCsv") or "").split(",") if value]
    cursor.close(); db.close()
    return jsonify({"success": True, "assignments": rows})


def _director_school_ids(cursor):
    cursor.execute("SELECT id FROM schools WHERE director_user_id = %s AND status = 'approved'", (g.current_user.get("id"),))
    return [row["id"] for row in cursor.fetchall()]


def _validate_student_assignment_scope(cursor, school_ids, student_id, class_id, module_ids):
    if not school_ids:
        return None, ("Student is outside your school", 403)
    placeholders = ",".join(["%s"] * len(school_ids))
    cursor.execute(
        f"""
        SELECT st.user_id, st.school_id AS schoolId
        FROM students st JOIN users u ON u.id = st.user_id
        WHERE st.user_id = %s AND st.school_id IN ({placeholders})
          AND u.role = 'student' AND u.status = 'active'
        LIMIT 1
        """,
        tuple([student_id] + school_ids),
    )
    student_row = cursor.fetchone()
    if not student_row:
        return None, ("Student is outside your school", 403)
    cursor.execute(
        f"SELECT id, school_id AS schoolId FROM classes WHERE id = %s AND school_id IN ({placeholders}) LIMIT 1",
        tuple([class_id] + school_ids),
    )
    class_row = cursor.fetchone()
    if not class_row:
        return None, ("Class is outside your school", 403)
    if int(student_row["schoolId"]) != int(class_row["schoolId"]):
        return None, ("Student and class must belong to the same school", 400)
    for module_id in module_ids:
        cursor.execute(
            """
            SELECT m.id
            FROM modules m
            JOIN class_modules cm ON cm.module_id = m.id
            WHERE m.id = %s AND cm.class_id = %s
            LIMIT 1
            """,
            (module_id, class_id),
        )
        if not cursor.fetchone():
            return None, ("One or more modules are not linked to the selected class", 400)
    return {"schoolId": class_row["schoolId"]}, None


@platform_bp.post("/director/student-assignments")
@require_roles("school_director")
def create_student_assignment():
    data = request.get_json(silent=True) or {}
    student_id = data.get("studentId")
    class_id = data.get("classId")
    module_ids = [int(value) for value in data.get("moduleIds", [])]
    if not student_id or not class_id or not module_ids:
        return jsonify({"success": False, "message": "Student, class and module are required"}), 400
    student_id = int(student_id); class_id = int(class_id)
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    school_ids = _director_school_ids(cursor)
    scope, error = _validate_student_assignment_scope(cursor, school_ids, student_id, class_id, module_ids)
    if error:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": error[0]}), error[1]
    for module_id in module_ids:
        cursor.execute(
            """
            SELECT id FROM student_assignments
            WHERE student_user_id = %s AND class_id = %s AND module_id = %s AND status != 'archived'
            LIMIT 1
            """,
            (student_id, class_id, module_id),
        )
        if cursor.fetchone():
            cursor.close(); db.close()
            return jsonify({"success": False, "message": "This assignment already exists"}), 409
    cursor.execute(
        "UPDATE students SET school_id = %s, main_class_id = %s, mode = 'assigned', status = 'active' WHERE user_id = %s",
        (scope["schoolId"], class_id, student_id),
    )
    cursor.execute(
        "INSERT INTO class_students(class_id, student_user_id, status) VALUES(%s, %s, 'approved') ON DUPLICATE KEY UPDATE status = 'approved'",
        (class_id, student_id),
    )
    for module_id in module_ids:
        cursor.execute(
            """
            INSERT INTO student_assignments(student_user_id, class_id, module_id, school_id, status, created_by)
            VALUES(%s, %s, %s, %s, 'active', %s)
            """,
            (student_id, class_id, module_id, scope["schoolId"], g.current_user.get("id")),
        )
        cursor.execute(
            """
            INSERT INTO student_modules(student_user_id, module_id, status)
            VALUES(%s, %s, 'active')
            ON DUPLICATE KEY UPDATE status = 'active'
            """,
            (student_id, module_id),
        )
    notify(cursor, student_id, "Nouvelles affectations pédagogiques", "Vos modules ont été mis à jour.", "assignment", "/student-modules")
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Student assignment saved", "created": len(module_ids)}), 201


@platform_bp.patch("/director/student-assignments/<int:assignment_id>")
@require_roles("school_director")
def update_student_assignment(assignment_id):
    data = request.get_json(silent=True) or {}
    student_id = data.get("studentId")
    class_id = data.get("classId")
    module_ids = [int(value) for value in data.get("moduleIds", [])]
    if not student_id or not class_id or not module_ids:
        return jsonify({"success": False, "message": "Student, class and module are required"}), 400
    student_id = int(student_id); class_id = int(class_id)
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    school_ids = _director_school_ids(cursor)
    placeholders = ",".join(["%s"] * len(school_ids)) if school_ids else "NULL"
    cursor.execute(
        f"""
        SELECT student_user_id AS studentId, class_id AS classId
        FROM student_assignments
        WHERE id = %s AND school_id IN ({placeholders}) AND status != 'archived'
        LIMIT 1
        """,
        tuple([assignment_id] + school_ids),
    )
    current = cursor.fetchone()
    if not current:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Assignment not found"}), 404
    scope, error = _validate_student_assignment_scope(cursor, school_ids, student_id, class_id, module_ids)
    if error:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": error[0]}), error[1]
    for module_id in module_ids:
        cursor.execute(
            """
            SELECT id FROM student_assignments
            WHERE student_user_id = %s AND class_id = %s AND module_id = %s
              AND status != 'archived'
              AND NOT (student_user_id = %s AND class_id = %s)
            LIMIT 1
            """,
            (student_id, class_id, module_id, current["studentId"], current["classId"]),
        )
        if cursor.fetchone():
            cursor.close(); db.close()
            return jsonify({"success": False, "message": "This assignment already exists"}), 409
    cursor.execute(
        """
        UPDATE student_assignments SET status = 'archived'
        WHERE student_user_id = %s AND class_id = %s AND status != 'archived'
        """,
        (current["studentId"], current["classId"]),
    )
    cursor.execute(
        "UPDATE students SET school_id = %s, main_class_id = %s, mode = 'assigned', status = 'active' WHERE user_id = %s",
        (scope["schoolId"], class_id, student_id),
    )
    cursor.execute(
        "INSERT INTO class_students(class_id, student_user_id, status) VALUES(%s, %s, 'approved') ON DUPLICATE KEY UPDATE status = 'approved'",
        (class_id, student_id),
    )
    for module_id in module_ids:
        cursor.execute(
            """
            INSERT INTO student_assignments(student_user_id, class_id, module_id, school_id, status, created_by)
            VALUES(%s, %s, %s, %s, 'active', %s)
            """,
            (student_id, class_id, module_id, scope["schoolId"], g.current_user.get("id")),
        )
    cursor.execute("UPDATE student_modules SET status = 'archived' WHERE student_user_id = %s", (current["studentId"],))
    cursor.execute("UPDATE student_modules SET status = 'archived' WHERE student_user_id = %s", (student_id,))
    for module_id in module_ids:
        cursor.execute(
            """
            INSERT INTO student_modules(student_user_id, module_id, status)
            VALUES(%s, %s, 'active')
            ON DUPLICATE KEY UPDATE status = 'active'
            """,
            (student_id, module_id),
        )
    notify(cursor, student_id, "Nouvelles affectations pédagogiques", "Vos modules ont été mis à jour.", "assignment", "/student-modules")
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Student assignment updated"})


@platform_bp.delete("/director/student-assignments/<int:assignment_id>")
@require_roles("school_director")
def delete_student_assignment(assignment_id):
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute(
        """
        SELECT student_user_id AS studentId, class_id AS classId
        FROM student_assignments
        WHERE id = %s
          AND school_id IN (SELECT id FROM schools WHERE director_user_id = %s)
          AND status != 'archived'
        LIMIT 1
        """,
        (assignment_id, g.current_user.get("id")),
    )
    assignment = cursor.fetchone()
    if not assignment:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Assignment not found"}), 404
    cursor.execute(
        """
        UPDATE student_assignments SET status = 'archived'
        WHERE student_user_id = %s AND class_id = %s AND status != 'archived'
        """,
        (assignment["studentId"], assignment["classId"]),
    )
    cursor.execute("UPDATE student_modules SET status = 'archived' WHERE student_user_id = %s", (assignment["studentId"],))
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Student assignment deleted"})


@platform_bp.post("/director/teacher-assignments-legacy")
@require_roles("school_director")
def assign_teacher_scope():
    data = request.get_json(silent=True) or {}
    teacher_id = data.get("teacherId")
    class_ids = [int(value) for value in data.get("classIds", [])]
    module_ids = [int(value) for value in data.get("moduleIds", [])]
    if not teacher_id:
        return jsonify({"success": False, "message": "teacherId is required"}), 400
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute("SELECT id FROM schools WHERE director_user_id = %s", (g.current_user.get("id"),))
    school_ids = [row["id"] for row in cursor.fetchall()]
    if not school_ids:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Teacher is outside your school"}), 403
    placeholders = ",".join(["%s"] * len(school_ids))
    cursor.execute(
        f"SELECT user_id FROM teachers WHERE user_id = %s AND school_id IN ({placeholders})",
        tuple([teacher_id] + school_ids),
    )
    if not cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Teacher is outside your school"}), 403
    for class_id in class_ids:
        cursor.execute(
            f"SELECT id FROM classes WHERE id = %s AND school_id IN ({placeholders})",
            tuple([class_id] + school_ids),
        )
        if not cursor.fetchone():
            cursor.close(); db.close()
            return jsonify({"success": False, "message": "One or more classes are outside your school"}), 403
        cursor.execute("INSERT INTO class_teachers(class_id, teacher_user_id, status) VALUES(%s, %s, 'approved') ON DUPLICATE KEY UPDATE status = 'approved'", (class_id, teacher_id))
    for module_id in module_ids:
        cursor.execute(
            f"""
            SELECT m.id
            FROM modules m
            JOIN class_modules cm ON cm.module_id = m.id
            JOIN classes c ON c.id = cm.class_id
            WHERE m.id = %s AND c.school_id IN ({placeholders})
            LIMIT 1
            """,
            tuple([module_id] + school_ids),
        )
        if not cursor.fetchone():
            cursor.close(); db.close()
            return jsonify({"success": False, "message": "One or more modules are outside your school"}), 403
        cursor.execute("INSERT IGNORE INTO module_teachers(module_id, teacher_user_id) VALUES(%s, %s)", (module_id, teacher_id))
    notify(cursor, teacher_id, "Nouvelles affectations pédagogiques", "Vos classes et modules ont été mis à jour.", "assignment", "/teacher-dashboard")
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Teacher assignments saved"})


def teacher_scope(cursor, teacher_id):
    cursor.execute(
        """
        SELECT DISTINCT c.id, c.name, c.level_name AS levelName, c.school_id AS schoolId,
               s.name AS schoolName
        FROM teacher_assignments ta
        JOIN classes c ON c.id = ta.class_id
        JOIN schools s ON s.id = c.school_id
        WHERE ta.teacher_user_id = %s AND ta.status = 'active'
        ORDER BY c.name
        """,
        (teacher_id,),
    )
    assigned_classes = cursor.fetchall()
    cursor.execute(
        """
        SELECT DISTINCT m.id, m.name, m.description, m.level_name AS levelName
        FROM teacher_assignments ta
        JOIN modules m ON m.id = ta.module_id
        WHERE ta.teacher_user_id = %s AND ta.status = 'active'
        ORDER BY m.name
        """,
        (teacher_id,),
    )
    assigned_modules = cursor.fetchall()
    if assigned_classes or assigned_modules:
        return assigned_classes, assigned_modules
    cursor.execute(
        """
        SELECT DISTINCT c.id, c.name, c.level_name AS levelName, c.school_id AS schoolId,
               s.name AS schoolName
        FROM classes c JOIN class_teachers ct ON ct.class_id = c.id
        JOIN schools s ON s.id = c.school_id
        WHERE ct.teacher_user_id = %s AND ct.status = 'approved'
        ORDER BY c.name
        """,
        (teacher_id,),
    )
    classes = cursor.fetchall()
    cursor.execute(
        """
        SELECT DISTINCT m.id, m.name, m.description, m.level_name AS levelName
        FROM modules m
        JOIN module_teachers mt ON mt.module_id = m.id
        WHERE mt.teacher_user_id = %s ORDER BY m.name
        """,
        (teacher_id,),
    )
    modules = cursor.fetchall()
    if classes and not modules:
        class_ids = [row["id"] for row in classes]
        placeholders = ",".join(["%s"] * len(class_ids))
        cursor.execute(
            f"""
            SELECT DISTINCT m.id, m.name, m.description, m.level_name AS levelName
            FROM modules m
            JOIN class_modules cm ON cm.module_id = m.id
            WHERE cm.class_id IN ({placeholders})
            ORDER BY m.name
            """,
            tuple(class_ids),
        )
        modules = cursor.fetchall()
    if modules and not classes:
        module_ids = [row["id"] for row in modules]
        placeholders = ",".join(["%s"] * len(module_ids))
        cursor.execute(
            f"""
            SELECT DISTINCT c.id, c.name, c.level_name AS levelName, c.school_id AS schoolId,
                   s.name AS schoolName
            FROM classes c
            JOIN class_modules cm ON cm.class_id = c.id
            JOIN teachers t ON t.school_id = c.school_id
            JOIN schools s ON s.id = c.school_id
            WHERE cm.module_id IN ({placeholders}) AND t.user_id = %s
            ORDER BY c.name
            """,
            tuple(module_ids + [teacher_id]),
        )
        classes = cursor.fetchall()
    return classes, modules


def teacher_effective_scope(cursor, teacher_id, class_id, module_id):
    cursor.execute(
        """
        SELECT school_id
        FROM teacher_assignments
        WHERE teacher_user_id = %s AND class_id = %s AND module_id = %s AND status = 'active'
        LIMIT 1
        """,
        (teacher_id, class_id, module_id),
    )
    assignment_scope = cursor.fetchone()
    if assignment_scope:
        return assignment_scope
    cursor.execute(
        """
        SELECT c.school_id
        FROM class_teachers ct
        JOIN classes c ON c.id = ct.class_id
        WHERE ct.teacher_user_id = %s AND ct.class_id = %s AND ct.status = 'approved'
        LIMIT 1
        """,
        (teacher_id, class_id),
    )
    class_scope = cursor.fetchone()
    cursor.execute(
        "SELECT module_id FROM module_teachers WHERE teacher_user_id = %s AND module_id = %s LIMIT 1",
        (teacher_id, module_id),
    )
    module_scope = cursor.fetchone()
    if class_scope and module_scope:
        return class_scope
    if module_scope and not class_scope:
        cursor.execute(
            """
            SELECT c.school_id
            FROM classes c
            JOIN class_modules cm ON cm.class_id = c.id
            JOIN teachers t ON t.school_id = c.school_id
            WHERE c.id = %s AND cm.module_id = %s AND t.user_id = %s
            LIMIT 1
            """,
            (class_id, module_id, teacher_id),
        )
        return cursor.fetchone()
    if class_scope and not module_scope:
        cursor.execute(
            """
            SELECT c.school_id
            FROM classes c
            JOIN class_modules cm ON cm.class_id = c.id
            WHERE c.id = %s AND cm.module_id = %s
            LIMIT 1
            """,
            (class_id, module_id),
        )
        return cursor.fetchone()
    return None


def pdf_escape(value):
    return str(value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def learnix_logo_path():
    return Path(__file__).resolve().parents[2] / "frontend" / "src" / "assets" / "learnix-logo-reference.png"


def pdf_data_url_to_bytes(content):
    value = str(content or "")
    if not value.startswith("data:application/pdf"):
        return None
    try:
        encoded = value.split(",", 1)[1]
        return base64.b64decode(encoded)
    except (IndexError, ValueError, TypeError):
        return None


COURSE_BRAND_MARKER = "Plateforme éducative intelligente et adaptative"


def create_course_cover(title, module_name, teacher_name, class_name, publication_date):
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="LearnixTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=30,
        textColor=colors.HexColor("#0B1F4D"),
        spaceAfter=16,
    ))
    styles.add(ParagraphStyle(
        name="LearnixSubtitle",
        parent=styles["BodyText"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#64748B"),
    ))
    styles.add(ParagraphStyle(
        name="LearnixLabel",
        parent=styles["BodyText"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#64748B"),
    ))
    styles.add(ParagraphStyle(
        name="LearnixValue",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#0F172A"),
    ))
    document = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.72 * inch,
        rightMargin=0.72 * inch,
        topMargin=0.62 * inch,
        bottomMargin=0.72 * inch,
    )
    logo = learnix_logo_path()
    if not logo.exists():
        raise FileNotFoundError(f"Learnix AI logo asset not found: {logo}")
    brand_logo = ReportImage(str(logo), width=0.58 * inch, height=0.65 * inch, mask="auto")
    brand = Table([[
        brand_logo,
        Paragraph(
            "<font size='20' color='#0B1F4D'><b>Learnix</b></font> "
            "<font size='20' color='#19BFD0'><b>AI</b></font><br/>"
            "<font color='#64748B'>Plateforme éducative intelligente et adaptative</font>",
            styles["LearnixSubtitle"],
        ),
    ]], colWidths=[0.72 * inch, 5.3 * inch])
    brand.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    info_rows = [
        ["Titre du cours", title],
        ["Module", module_name],
        ["Nom de l'enseignant", teacher_name],
        ["Classe / section", class_name],
        ["Date de publication", publication_date],
    ]
    info_table = Table([
        [Paragraph(f"<b>{pdf_escape(label)}</b>", styles["LearnixLabel"]), Paragraph(pdf_escape(value), styles["LearnixValue"])]
        for label, value in info_rows
    ], colWidths=[1.7 * inch, 4.45 * inch])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#D8E3F0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5EDF6")),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story = [
        brand,
        Spacer(1, 0.5 * inch),
        Paragraph(pdf_escape(title), styles["LearnixTitle"]),
        Paragraph("Document de cours publié par l'enseignant dans Learnix AI.", styles["LearnixSubtitle"]),
        Spacer(1, 0.34 * inch),
        info_table,
        Spacer(1, 0.4 * inch),
        Paragraph("Le contenu original du cours est conservé dans les pages suivantes.", styles["LearnixSubtitle"]),
    ]
    document.build(story)
    buffer.seek(0)
    return buffer


def create_course_footer_overlay(width, height, teacher_name, module_name, class_name, page_number, total_pages):
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=(width, height), leftMargin=0, rightMargin=0, topMargin=0, bottomMargin=0)

    def draw(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#D8E3F0"))
        canvas.line(0.55 * inch, 0.43 * inch, width - 0.55 * inch, 0.43 * inch)
        canvas.setFillColor(colors.HexColor("#64748B"))
        canvas.setFont("Helvetica", 8)
        footer = f"Learnix AI | {teacher_name or 'Enseignant'} | {module_name or 'Module'} | {class_name or 'Classe'}"
        canvas.drawString(0.58 * inch, 0.25 * inch, footer[:105])
        canvas.drawRightString(width - 0.58 * inch, 0.25 * inch, f"Page {page_number}/{total_pages}")
        canvas.restoreState()

    doc.build([Spacer(1, 1)], onFirstPage=draw)
    buffer.seek(0)
    return PdfReader(buffer).pages[0]


def is_professional_course_pdf(content):
    original = pdf_data_url_to_bytes(content)
    if not original:
        return False
    try:
        reader = PdfReader(BytesIO(original))
        first_page_text = reader.pages[0].extract_text() if reader.pages else ""
        return "Learnix AI" in (first_page_text or "") and "Plateforme" in (first_page_text or "")
    except Exception:
        return False


def format_course_publication_date(value):
    if not value:
        return date.today().strftime("%d/%m/%Y")
    if hasattr(value, "strftime"):
        return value.strftime("%d/%m/%Y")
    return str(value)[:10]


def build_professional_course_pdf(content, title, module_name, teacher_name, class_name, publication_date=None):
    original = pdf_data_url_to_bytes(content)
    if not original:
        return content
    if is_professional_course_pdf(content):
        return content
    original_reader = PdfReader(BytesIO(original))
    writer = PdfWriter()
    display_date = publication_date or date.today().strftime("%d/%m/%Y")
    cover_reader = PdfReader(create_course_cover(title, module_name, teacher_name, class_name, display_date))
    for page in cover_reader.pages:
        writer.add_page(page)
    total_pages = len(original_reader.pages) + len(cover_reader.pages)
    for index, page in enumerate(original_reader.pages, start=len(cover_reader.pages) + 1):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        overlay = create_course_footer_overlay(width, height, teacher_name, module_name, class_name, index, total_pages)
        page.merge_page(overlay)
        writer.add_page(page)
    output = BytesIO()
    writer.write(output)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:application/pdf;base64,{encoded}"


def ensure_course_pdf_is_branded(cursor, course):
    content = course.get("content")
    if not pdf_data_url_to_bytes(content) or is_professional_course_pdf(content):
        return False
    branded = build_professional_course_pdf(
        content,
        course.get("title") or "Cours",
        course.get("moduleName") or course.get("subject") or "",
        course.get("teacherName") or "",
        course.get("className") or course.get("section") or "",
        format_course_publication_date(course.get("createdAt")),
    )
    if branded != content:
        course["content"] = branded
        cursor.execute("UPDATE courses SET content = %s WHERE id = %s", (branded, course.get("id")))
        return True
    return False


@platform_bp.get("/teacher/workspace")
@require_roles("teacher", "guest_teacher")
def teacher_workspace():
    teacher_id = g.current_user.get("id")
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    classes, modules = teacher_scope(cursor, teacher_id)
    cursor.execute(
        """
        SELECT co.id, co.title, co.files_json AS filesJson, co.created_at AS createdAt,
               c.name AS section, m.name AS subject
        FROM courses co LEFT JOIN classes c ON c.id = co.class_id LEFT JOIN modules m ON m.id = co.module_id
        WHERE co.teacher_user_id = %s ORDER BY co.created_at DESC
        """,
        (teacher_id,),
    )
    courses = cursor.fetchall()
    for course in courses:
        files = json.loads(course.pop("filesJson") or "[]")
        course["pdfName"] = files[0] if files else ""
    cursor.execute(
        """
        SELECT q.id, q.title, q.difficulty, q.created_at AS createdAt,
               c.name AS section, m.name AS subject
        FROM quizzes q LEFT JOIN classes c ON c.id = q.class_id LEFT JOIN modules m ON m.id = q.module_id
        WHERE q.teacher_user_id = %s ORDER BY q.created_at DESC
        """,
        (teacher_id,),
    )
    quizzes = cursor.fetchall()
    cursor.execute("""
        SELECT DISTINCT u.id, u.name, u.email, c.name AS className, s.education_level AS educationLevel
        FROM class_teachers ct JOIN students s ON s.main_class_id = ct.class_id
        JOIN users u ON u.id = s.user_id JOIN classes c ON c.id = s.main_class_id
        WHERE ct.teacher_user_id = %s AND ct.status = 'approved' AND u.status = 'active'
        ORDER BY c.name, u.name
    """, (teacher_id,))
    students = cursor.fetchall()
    cursor.close(); db.close()
    return jsonify({"success": True, "classes": classes, "modules": modules, "courses": courses, "quizzes": quizzes, "students": students})


@platform_bp.post("/teacher/courses")
@require_roles("teacher", "guest_teacher")
def create_teacher_course():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title") or "").strip()
    if not title or not data.get("classId") or not data.get("moduleId"):
        return jsonify({"success": False, "message": "title, classId and moduleId are required"}), 400
    teacher_id = g.current_user.get("id")
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    scope = teacher_effective_scope(cursor, teacher_id, data.get("classId"), data.get("moduleId"))
    if not scope:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Course is outside your assigned scope"}), 403
    cursor.execute("SELECT name FROM users WHERE id = %s", (teacher_id,))
    teacher = cursor.fetchone() or {}
    cursor.execute("SELECT name FROM classes WHERE id = %s", (data.get("classId"),))
    class_row = cursor.fetchone() or {}
    cursor.execute("SELECT name FROM modules WHERE id = %s", (data.get("moduleId"),))
    module_row = cursor.fetchone() or {}
    try:
        content = build_professional_course_pdf(
            data.get("content"),
            title,
            module_row.get("name") or "",
            teacher.get("name") or g.current_user.get("name") or "",
            class_row.get("name") or "",
        )
    except FileNotFoundError as exc:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": str(exc)}), 500
    except Exception as exc:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": f"Unable to prepare branded PDF: {exc}"}), 400
    cursor.execute(
        "INSERT INTO courses(school_id, class_id, module_id, teacher_user_id, title, content, files_json) VALUES(%s, %s, %s, %s, %s, %s, %s)",
        (scope["school_id"], data.get("classId"), data.get("moduleId"), teacher_id, title[:255], content, json.dumps([data.get("pdfName")] if data.get("pdfName") else [])),
    )
    course_id = cursor.lastrowid; db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "courseId": course_id}), 201


@platform_bp.post("/teacher/quizzes")
@require_roles("teacher", "guest_teacher")
def create_teacher_quiz():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title") or "").strip()
    if not title or not data.get("classId") or not data.get("moduleId"):
        return jsonify({"success": False, "message": "title, classId and moduleId are required"}), 400
    teacher_id = g.current_user.get("id")
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    scope = teacher_effective_scope(cursor, teacher_id, data.get("classId"), data.get("moduleId"))
    if not scope:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Quiz is outside your assigned scope"}), 403
    cursor.execute(
        "INSERT INTO quizzes(school_id, class_id, module_id, teacher_user_id, title, access_scope, difficulty) VALUES(%s, %s, %s, %s, %s, 'class', %s)",
        (scope["school_id"], data.get("classId"), data.get("moduleId"), teacher_id, title[:255], data.get("difficulty") or "Medium"),
    )
    quiz_id = cursor.lastrowid; db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "quizId": quiz_id}), 201


@platform_bp.patch("/teacher/courses/<int:course_id>")
@require_roles("teacher", "guest_teacher")
def update_teacher_course(course_id):
    data = request.get_json(silent=True) or {}
    if "title" in data and not str(data.get("title") or "").strip():
        return jsonify({"success": False, "message": "Course title is required"}), 400
    db = get_db(); cursor = db.cursor()
    ensure_complete_platform_tables(cursor)
    cursor.execute("UPDATE courses SET title = COALESCE(%s, title), content = COALESCE(%s, content), files_json = COALESCE(%s, files_json) WHERE id = %s AND teacher_user_id = %s", (str(data.get("title")).strip()[:255] if data.get("title") is not None else None, data.get("content"), json.dumps([data.get("pdfName")]) if data.get("pdfName") is not None else None, course_id, g.current_user.get("id")))
    if cursor.rowcount == 0:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Course not found or outside your scope"}), 404
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Course updated"})


@platform_bp.delete("/teacher/courses/<int:course_id>")
@require_roles("teacher", "guest_teacher")
def delete_teacher_course(course_id):
    db = get_db(); cursor = db.cursor()
    ensure_complete_platform_tables(cursor)
    cursor.execute("DELETE FROM courses WHERE id = %s AND teacher_user_id = %s", (course_id, g.current_user.get("id")))
    if cursor.rowcount == 0:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Course not found or outside your scope"}), 404
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Course deleted"})


@platform_bp.patch("/teacher/quizzes/<int:quiz_id>")
@require_roles("teacher", "guest_teacher")
def update_teacher_quiz(quiz_id):
    data = request.get_json(silent=True) or {}
    if "title" in data and not str(data.get("title") or "").strip():
        return jsonify({"success": False, "message": "Quiz title is required"}), 400
    db = get_db(); cursor = db.cursor()
    ensure_complete_platform_tables(cursor)
    cursor.execute("UPDATE quizzes SET title = COALESCE(%s, title), difficulty = COALESCE(%s, difficulty) WHERE id = %s AND teacher_user_id = %s", (str(data.get("title")).strip()[:255] if data.get("title") is not None else None, data.get("difficulty"), quiz_id, g.current_user.get("id")))
    if cursor.rowcount == 0:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Quiz not found or outside your scope"}), 404
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Quiz updated"})


@platform_bp.delete("/teacher/quizzes/<int:quiz_id>")
@require_roles("teacher", "guest_teacher")
def delete_teacher_quiz(quiz_id):
    db = get_db(); cursor = db.cursor()
    ensure_complete_platform_tables(cursor)
    cursor.execute("SELECT id FROM quizzes WHERE id = %s AND teacher_user_id = %s", (quiz_id, g.current_user.get("id")))
    if not cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Quiz not found or outside your scope"}), 404
    cursor.execute("DELETE FROM questions WHERE quiz_id = %s", (quiz_id,))
    cursor.execute("DELETE FROM quizzes WHERE id = %s AND teacher_user_id = %s", (quiz_id, g.current_user.get("id")))
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Quiz deleted"})
