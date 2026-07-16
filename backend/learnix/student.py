import json

from flask import Blueprint, g, jsonify, request

from .config import normalize_role
from .database import get_db
from .platform import ensure_complete_platform_tables, ensure_course_pdf_is_branded
from .security import require_auth, require_roles
from .notifications import notify


student_bp = Blueprint("student", __name__, url_prefix="/api")


def _ai_module_context_from_context(context_text):
    if not context_text:
        return None
    try:
        parsed = json.loads(context_text)
    except (TypeError, ValueError):
        return None
    if not isinstance(parsed, dict) or parsed.get("__learnixModuleContext") is not True:
        return None
    module_context = parsed.get("moduleContext")
    return module_context if isinstance(module_context, dict) else None


def _ai_module_context_from_metadata(metadata):
    if not isinstance(metadata, dict):
        return None
    candidates = [
        metadata.get("moduleContext"),
        metadata.get("difficultyRequest", {}).get("moduleContext") if isinstance(metadata.get("difficultyRequest"), dict) else None,
        metadata.get("questionCountRequest", {}).get("moduleContext") if isinstance(metadata.get("questionCountRequest"), dict) else None,
        metadata.get("quiz", {}).get("moduleContext") if isinstance(metadata.get("quiz"), dict) else None,
    ]
    for candidate in candidates:
        if isinstance(candidate, dict) and (candidate.get("moduleId") or candidate.get("moduleName")):
            return candidate
    for key in ("quiz", "difficultyRequest", "questionCountRequest"):
        value = metadata.get(key)
        if isinstance(value, dict) and (value.get("moduleId") or value.get("moduleName")):
            return {
                "moduleId": value.get("moduleId"),
                "moduleName": value.get("moduleName"),
                "teacherId": value.get("teacherId"),
                "teacherName": value.get("teacherName"),
                "classId": value.get("classId"),
                "className": value.get("className"),
            }
    return None


def _apply_ai_module_context(cursor, rows):
    if not rows:
        return rows
    for row in rows:
        module_context = _ai_module_context_from_context(row.get("context"))
        if module_context:
            row.update({
                "moduleId": module_context.get("moduleId"),
                "moduleName": module_context.get("moduleName"),
                "teacherId": module_context.get("teacherId"),
                "teacherName": module_context.get("teacherName"),
                "classId": module_context.get("classId"),
                "className": module_context.get("className"),
                "schoolId": module_context.get("schoolId"),
            })
    missing_ids = [row.get("id") for row in rows if not row.get("moduleId") and not row.get("moduleName")]
    if not missing_ids:
        return rows
    placeholders = ",".join(["%s"] * len(missing_ids))
    cursor.execute(
        f"""
        SELECT conversation_id AS conversationId, metadata_json AS metadataJson
        FROM ai_conversation_messages
        WHERE conversation_id IN ({placeholders}) AND metadata_json IS NOT NULL
        ORDER BY created_at DESC, id DESC
        """,
        tuple(missing_ids),
    )
    contexts_by_conversation = {}
    for message in cursor.fetchall():
        if message["conversationId"] in contexts_by_conversation:
            continue
        try:
            metadata = json.loads(message.get("metadataJson") or "{}")
        except (TypeError, ValueError):
            continue
        module_context = _ai_module_context_from_metadata(metadata)
        if module_context:
            contexts_by_conversation[message["conversationId"]] = module_context
    for row in rows:
        module_context = contexts_by_conversation.get(row.get("id"))
        if module_context:
            row.update({
                "moduleId": module_context.get("moduleId"),
                "moduleName": module_context.get("moduleName"),
                "teacherId": module_context.get("teacherId"),
                "teacherName": module_context.get("teacherName"),
                "classId": module_context.get("classId"),
                "className": module_context.get("className"),
                "schoolId": module_context.get("schoolId"),
            })
    return rows


def ensure_student_row(cursor, user_id):
    cursor.execute(
        """
        INSERT INTO students(user_id, mode, status)
        VALUES(%s, 'assigned', 'active')
        ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)
        """,
        (user_id,),
    )


def teacher_contacts(cursor, student_user_id):
    cursor.execute(
        """
        SELECT s.school_id, s.main_class_id
        FROM students s
        WHERE s.user_id = %s
        """,
        (student_user_id,),
    )
    student = cursor.fetchone() or {}
    school_id = student.get("school_id")
    class_id = student.get("main_class_id")

    cursor.execute(
        """
        SELECT DISTINCT
          u.id,
          u.name,
          u.email,
          u.avatar_url,
          CASE WHEN u.last_seen >= (NOW() - INTERVAL 5 MINUTE) THEN 1 ELSE 0 END AS isOnline,
          COALESCE(GROUP_CONCAT(DISTINCT m.name ORDER BY m.name SEPARATOR ', '), '') AS subjects,
          t.school_id AS schoolId,
          CASE WHEN ct.class_id IS NOT NULL THEN 1 ELSE 0 END AS sameClass,
          CASE WHEN t.school_id = %s AND %s IS NOT NULL THEN 1 ELSE 0 END AS sameSchool,
          COUNT(DISTINCT sm.student_user_id) AS studentLoad,
          COUNT(DISTINCT si.id) AS weeklyScheduleItems
        FROM teachers t
        JOIN users u ON u.id = t.user_id AND u.status = 'active'
        LEFT JOIN class_teachers ct ON ct.teacher_user_id = u.id AND ct.class_id = %s AND ct.status = 'approved'
        LEFT JOIN module_teachers mt ON mt.teacher_user_id = u.id
        LEFT JOIN modules m ON m.id = mt.module_id
        LEFT JOIN student_modules sm ON sm.teacher_user_id = u.id AND sm.status IN ('approved', 'active')
        LEFT JOIN schedule_items si ON si.teacher_user_id = u.id
        WHERE t.status = 'active'
          AND (ct.class_id IS NOT NULL OR (%s IS NOT NULL AND t.school_id = %s))
        GROUP BY u.id, u.name, u.email, u.avatar_url, u.last_seen, t.school_id, ct.class_id
        ORDER BY sameClass DESC, sameSchool DESC, studentLoad ASC, weeklyScheduleItems ASC, u.name
        """,
        (school_id, school_id, class_id, school_id, school_id),
    )
    rows = _apply_ai_module_context(cursor, cursor.fetchall())
    for row in rows:
        load = int(row.get("studentLoad") or 0)
        schedule = int(row.get("weeklyScheduleItems") or 0)
        row["priorityScore"] = (
            (60 if row.get("sameClass") else 0)
            + (25 if row.get("sameSchool") else 0)
            - min(load * 2, 30)
            - min(schedule * 3, 30)
        )
        row["availability"] = "available" if load < 8 and schedule < 12 else "limited"
    return sorted(rows, key=lambda item: (-item["priorityScore"], item["name"]))


def _role_label(role):
    return {
        "school_director": "Directeur",
        "teacher": "Enseignant",
        "student": "Étudiant",
        "guest_student": "Étudiant",
        "general_admin": "Administrateur",
    }.get(normalize_role(role), "Contact")


def _contact_row(row, role):
    contact = dict(row or {})
    contact["role"] = role
    contact["roleLabel"] = _role_label(role)
    contact["availability"] = contact.get("availability") or "available"
    contact["status"] = contact.get("status") or "active"
    contact["avatar_url"] = contact.get("avatar_url")
    contact["isOnline"] = bool(contact.get("isOnline"))
    contact["subjects"] = contact.get("subjects") or ""
    contact["className"] = contact.get("className") or ""
    contact["schoolName"] = contact.get("schoolName") or ""
    contact["educationLevel"] = contact.get("educationLevel") or contact["roleLabel"]
    return contact


def _add_contacts(target, rows, role):
    for row in rows:
        contact = _contact_row(row, role)
        contact_id = contact.get("id")
        if contact_id and contact_id not in target:
            target[contact_id] = contact


def _director_school_ids(cursor, director_user_id):
    cursor.execute(
        "SELECT id FROM schools WHERE director_user_id = %s AND status = 'approved'",
        (director_user_id,),
    )
    return [row["id"] for row in cursor.fetchall()]


def _student_school(cursor, student_user_id):
    cursor.execute(
        """
        SELECT s.school_id, s.main_class_id, sc.name AS schoolName, c.name AS className
        FROM students s
        LEFT JOIN schools sc ON sc.id = s.school_id
        LEFT JOIN classes c ON c.id = s.main_class_id
        WHERE s.user_id = %s AND s.status = 'active'
        """,
        (student_user_id,),
    )
    return cursor.fetchone() or {}


def _teacher_school(cursor, teacher_user_id):
    cursor.execute(
        """
        SELECT t.school_id, sc.name AS schoolName
        FROM teachers t
        LEFT JOIN schools sc ON sc.id = t.school_id
        WHERE t.user_id = %s AND t.status = 'active'
        """,
        (teacher_user_id,),
    )
    return cursor.fetchone() or {}


def _school_director_contacts(cursor, school_id):
    if not school_id:
        return []
    cursor.execute(
        """
        SELECT u.id, u.name, u.email, u.status, u.avatar_url,
               CASE WHEN u.last_seen >= (NOW() - INTERVAL 5 MINUTE) THEN 1 ELSE 0 END AS isOnline,
               sc.name AS schoolName, '' AS className
        FROM schools sc
        JOIN users u ON u.id = sc.director_user_id
        WHERE sc.id = %s
          AND sc.status = 'approved'
          AND u.status = 'active'
        ORDER BY u.name
        """,
        (school_id,),
    )
    return cursor.fetchall()


def _student_teacher_contacts(cursor, student_user_id):
    student = _student_school(cursor, student_user_id)
    class_id = student.get("main_class_id")
    school_id = student.get("school_id")
    if not class_id and not school_id:
        return []
    cursor.execute(
        """
        SELECT DISTINCT u.id, u.name, u.email, u.status, u.avatar_url,
               CASE WHEN u.last_seen >= (NOW() - INTERVAL 5 MINUTE) THEN 1 ELSE 0 END AS isOnline,
               sc.name AS schoolName,
               c.name AS className,
               COALESCE(GROUP_CONCAT(DISTINCT m.name ORDER BY m.name SEPARATOR ', '), '') AS subjects
        FROM users u
        JOIN teachers t ON t.user_id = u.id AND t.status = 'active'
        LEFT JOIN teacher_assignments ta
          ON ta.teacher_user_id = u.id
         AND ta.status = 'active'
         AND (%s IS NOT NULL AND ta.class_id = %s)
        LEFT JOIN class_teachers ct
          ON ct.teacher_user_id = u.id
         AND ct.status = 'approved'
         AND (%s IS NOT NULL AND ct.class_id = %s)
        LEFT JOIN modules m ON m.id = ta.module_id
        LEFT JOIN classes c ON c.id = COALESCE(ta.class_id, ct.class_id, %s)
        LEFT JOIN schools sc ON sc.id = t.school_id
        WHERE u.status = 'active'
          AND t.school_id = %s
          AND (ta.id IS NOT NULL OR ct.teacher_user_id IS NOT NULL)
        GROUP BY u.id, u.name, u.email, u.status, u.avatar_url, u.last_seen, sc.name, c.name
        ORDER BY u.name
        """,
        (class_id, class_id, class_id, class_id, class_id, school_id),
    )
    return cursor.fetchall()


def _teacher_student_contacts(cursor, teacher_user_id):
    teacher = _teacher_school(cursor, teacher_user_id)
    school_id = teacher.get("school_id")
    if not school_id:
        return []
    cursor.execute(
        """
        SELECT DISTINCT u.id, u.name, u.email, u.status, u.avatar_url,
               CASE WHEN u.last_seen >= (NOW() - INTERVAL 5 MINUTE) THEN 1 ELSE 0 END AS isOnline,
               sc.name AS schoolName,
               c.name AS className,
               COALESCE(s.education_level, c.level_name, u.level, '') AS educationLevel
        FROM users u
        JOIN students s ON s.user_id = u.id AND s.status = 'active'
        LEFT JOIN classes c ON c.id = s.main_class_id
        LEFT JOIN schools sc ON sc.id = s.school_id
        LEFT JOIN teacher_assignments ta
          ON ta.teacher_user_id = %s
         AND ta.class_id = s.main_class_id
         AND ta.school_id = s.school_id
         AND ta.status = 'active'
        LEFT JOIN class_teachers ct
          ON ct.teacher_user_id = %s
         AND ct.class_id = s.main_class_id
         AND ct.status = 'approved'
        WHERE u.status = 'active'
          AND s.school_id = %s
          AND (ta.id IS NOT NULL OR ct.teacher_user_id IS NOT NULL)
        ORDER BY u.name
        """,
        (teacher_user_id, teacher_user_id, school_id),
    )
    return cursor.fetchall()


def _director_people_contacts(cursor, director_user_id):
    school_ids = _director_school_ids(cursor, director_user_id)
    contacts = {}
    if not school_ids:
        return []
    placeholders = ",".join(["%s"] * len(school_ids))
    cursor.execute(
        f"""
        SELECT DISTINCT u.id, u.name, u.email, u.status, u.avatar_url,
               CASE WHEN u.last_seen >= (NOW() - INTERVAL 5 MINUTE) THEN 1 ELSE 0 END AS isOnline,
               sc.name AS schoolName,
               '' AS className,
               COALESCE(GROUP_CONCAT(DISTINCT m.name ORDER BY m.name SEPARATOR ', '), '') AS subjects
        FROM teachers t
        JOIN users u ON u.id = t.user_id AND u.status = 'active'
        LEFT JOIN schools sc ON sc.id = t.school_id
        LEFT JOIN teacher_assignments ta ON ta.teacher_user_id = t.user_id AND ta.status = 'active'
        LEFT JOIN modules m ON m.id = ta.module_id
        WHERE t.status = 'active' AND t.school_id IN ({placeholders})
        GROUP BY u.id, u.name, u.email, u.status, u.avatar_url, u.last_seen, sc.name
        ORDER BY u.name
        """,
        tuple(school_ids),
    )
    _add_contacts(contacts, cursor.fetchall(), "teacher")
    cursor.execute(
        """
        SELECT DISTINCT u.id, u.name, u.email, u.status, u.avatar_url,
               CASE WHEN u.last_seen >= (NOW() - INTERVAL 5 MINUTE) THEN 1 ELSE 0 END AS isOnline,
               '' AS schoolName,
               '' AS className
        FROM users u
        WHERE u.role = 'general_admin' AND u.status = 'active'
        ORDER BY u.name
        """,
    )
    _add_contacts(contacts, cursor.fetchall(), "general_admin")
    return sorted(contacts.values(), key=lambda item: (item.get("roleLabel", ""), item.get("name", "")))


def messaging_contacts_for_user(cursor, user_id, role):
    normalized_role = normalize_role(role)
    contacts = {}
    if normalized_role in {"student", "guest_student"}:
        student = _student_school(cursor, user_id)
        _add_contacts(contacts, _student_teacher_contacts(cursor, user_id), "teacher")
        _add_contacts(contacts, _school_director_contacts(cursor, student.get("school_id")), "school_director")
    elif normalized_role == "teacher":
        teacher = _teacher_school(cursor, user_id)
        _add_contacts(contacts, _teacher_student_contacts(cursor, user_id), "student")
        _add_contacts(contacts, _school_director_contacts(cursor, teacher.get("school_id")), "school_director")
    elif normalized_role == "school_director":
        for contact in _director_people_contacts(cursor, user_id):
            contacts[contact["id"]] = contact
    elif normalized_role == "general_admin":
        cursor.execute(
            """
            SELECT u.id, u.name, u.email, u.status, u.avatar_url,
                   CASE WHEN u.last_seen >= (NOW() - INTERVAL 5 MINUTE) THEN 1 ELSE 0 END AS isOnline,
                   (
                     SELECT s.name
                     FROM schools s
                     WHERE s.director_user_id = u.id AND s.status = 'approved'
                     ORDER BY COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
                     LIMIT 1
                   ) AS schoolName,
                   '' AS className
            FROM users u
            WHERE u.role = 'school_director' AND u.status = 'active'
            ORDER BY u.name
            """
        )
        _add_contacts(contacts, cursor.fetchall(), "school_director")
    return [contact for contact in sorted(contacts.values(), key=lambda item: item.get("name", "")) if contact.get("id") != user_id]


def message_contact_allowed(cursor, user_id, role, contact_id):
    try:
        contact_id = int(contact_id)
    except (TypeError, ValueError):
        return False
    return any(contact.get("id") == contact_id for contact in messaging_contacts_for_user(cursor, user_id, role))


@student_bp.get("/student/profile")
@require_roles("student", "guest_student")
def get_student_profile():
    user_id = g.current_user.get("id")
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    ensure_student_row(cursor, user_id)
    db.commit()
    cursor.execute(
        """
        SELECT u.id, u.name, u.email, u.level, u.role, u.avatar_url,
               s.mode, s.school_id AS schoolId, s.main_class_id AS classId,
               s.education_level AS educationLevel, s.birth_date AS birthDate,
               s.phone, s.guardian_name AS guardianName,
               s.guardian_phone AS guardianPhone,
               s.preferred_language AS preferredLanguage,
               s.learning_style AS learningStyle,
               s.interests_json AS interestsJson, s.notes,
               sc.name AS schoolName, c.name AS className, c.level_name AS classLevel
        FROM users u
        JOIN students s ON s.user_id = u.id
        LEFT JOIN schools sc ON sc.id = s.school_id
        LEFT JOIN classes c ON c.id = s.main_class_id
        WHERE u.id = %s
        """,
        (user_id,),
    )
    profile = cursor.fetchone()
    cursor.execute(
        """
        SELECT DISTINCT m.id, m.name, m.description, m.level_name AS levelName,
               COALESCE(sa.class_id, st.main_class_id) AS classId,
               COALESCE(sa.school_id, st.school_id) AS schoolId,
               COALESCE(assigned_class.name, student_class.name) AS className,
               COALESCE(assigned_school.name, student_school.name) AS schoolName,
               teacher.id AS teacherId,
               teacher.name AS teacherName,
               COALESCE(quiz_results.completedAttempts, 0) AS quizCount,
               COALESCE(quiz_results.averageProgress, 0) AS progress,
               COALESCE(course_counts.total, 0) AS courseCount
        FROM student_modules sm
        JOIN modules m ON m.id = sm.module_id
        JOIN students st ON st.user_id = sm.student_user_id
        LEFT JOIN student_assignments sa
          ON sa.student_user_id = sm.student_user_id
         AND sa.module_id = sm.module_id
         AND sa.status = 'active'
        LEFT JOIN classes assigned_class ON assigned_class.id = sa.class_id
        LEFT JOIN schools assigned_school ON assigned_school.id = sa.school_id
        LEFT JOIN classes student_class ON student_class.id = st.main_class_id
        LEFT JOIN schools student_school ON student_school.id = st.school_id
        LEFT JOIN teacher_assignments ta
          ON ta.module_id = sm.module_id
         AND ta.status = 'active'
         AND ta.class_id = COALESCE(sa.class_id, st.main_class_id)
         AND ta.school_id = COALESCE(sa.school_id, st.school_id)
        LEFT JOIN users teacher ON teacher.id = ta.teacher_user_id
        LEFT JOIN (
          SELECT category, COUNT(*) AS completedAttempts, ROUND(AVG(percentage), 0) AS averageProgress
          FROM quiz_results
          WHERE user_id = %s AND total_questions > 0
          GROUP BY category
        ) quiz_results ON LOWER(quiz_results.category) = LOWER(m.name)
        LEFT JOIN (
          SELECT module_id, COUNT(*) AS total
          FROM courses
          GROUP BY module_id
        ) course_counts ON course_counts.module_id = m.id
        WHERE sm.student_user_id = %s AND sm.status IN ('approved', 'active')
        ORDER BY m.name
        """,
        (user_id, user_id),
    )
    modules = cursor.fetchall()
    cursor.close()
    db.close()
    if profile:
        profile["interests"] = json.loads(profile.pop("interestsJson") or "[]")
        profile["educationLevel"] = profile.get("educationLevel") or profile.get("classLevel") or profile.get("level")
    return jsonify({"success": True, "profile": profile, "modules": modules})


@student_bp.get("/student/courses")
@require_roles("student", "guest_student")
def get_student_courses():
    user_id = g.current_user.get("id")
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute(
        """
        SELECT DISTINCT co.id, co.title, co.content, co.files_json AS filesJson, co.created_at AS createdAt,
               m.id AS moduleId, m.name AS moduleName,
               u.id AS teacherId, u.name AS teacherName, u.avatar_url AS teacherAvatarUrl,
               c.id AS classId, c.name AS className,
               sc.id AS schoolId, sc.name AS schoolName
        FROM courses co
        JOIN modules m ON m.id = co.module_id
        JOIN users u ON u.id = co.teacher_user_id
        JOIN students st ON st.user_id = %s
        JOIN student_modules sm
          ON sm.student_user_id = st.user_id
         AND sm.module_id = co.module_id
         AND sm.status IN ('approved', 'active')
        LEFT JOIN student_assignments sa
          ON sa.student_user_id = st.user_id
         AND sa.module_id = co.module_id
         AND sa.status = 'active'
        LEFT JOIN classes c ON c.id = co.class_id
        LEFT JOIN schools sc ON sc.id = co.school_id
        WHERE co.class_id = COALESCE(sa.class_id, st.main_class_id)
          AND co.school_id = COALESCE(sa.school_id, st.school_id)
        ORDER BY co.created_at DESC, co.id DESC
        """,
        (user_id,),
    )
    courses = cursor.fetchall()
    upgraded = False
    for course in courses:
        files = json.loads(course.pop("filesJson") or "[]")
        course["pdfName"] = files[0] if files else ""
        try:
            upgraded = ensure_course_pdf_is_branded(cursor, course) or upgraded
        except Exception:
            pass
    if upgraded:
        db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "courses": courses})


@student_bp.patch("/student/profile")
@require_roles("student", "guest_student")
def update_student_profile():
    user_id = g.current_user.get("id")
    data = request.get_json(silent=True) or {}
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    ensure_student_row(cursor, user_id)
    cursor.execute(
        "UPDATE users SET name = %s WHERE id = %s",
        (str(data.get("name") or "").strip(), user_id),
    )
    cursor.execute(
        """
        UPDATE students
        SET education_level = %s, birth_date = %s, phone = %s,
            guardian_name = %s, guardian_phone = %s,
            preferred_language = %s, learning_style = %s,
            interests_json = %s, notes = %s
        WHERE user_id = %s
        """,
        (
            data.get("educationLevel") or None,
            data.get("birthDate") or None,
            data.get("phone") or None,
            data.get("guardianName") or None,
            data.get("guardianPhone") or None,
            data.get("preferredLanguage") or "fr",
            data.get("learningStyle") or None,
            json.dumps(data.get("interests") or []),
            data.get("notes") or None,
            user_id,
        ),
    )
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "message": "Student profile updated"})


@student_bp.get("/student/teachers")
@require_roles("student", "guest_student")
def list_student_teachers():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    teachers = teacher_contacts(cursor, g.current_user.get("id"))
    cursor.close()
    db.close()
    return jsonify({"success": True, "teachers": teachers})


@student_bp.get("/messages/contacts")
@require_auth
def message_contacts():
    user_id = g.current_user.get("id")
    role = normalize_role(g.current_user.get("role"))
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    contacts = messaging_contacts_for_user(cursor, user_id, role)
    for contact in contacts:
        cursor.execute(
            "SELECT COUNT(*) AS total FROM messages WHERE sender_user_id = %s AND recipient_user_id = %s AND read_at IS NULL",
            (contact["id"], user_id),
        )
        contact["unreadCount"] = cursor.fetchone()["total"]
    cursor.close()
    db.close()
    return jsonify({"success": True, "contacts": contacts})


@student_bp.get("/messages")
@require_auth
def list_messages():
    user_id = g.current_user.get("id")
    contact_id = request.args.get("contactId", type=int)
    if not contact_id:
        return jsonify({"success": False, "message": "contactId is required"}), 400
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    role = normalize_role(g.current_user.get("role"))
    if not message_contact_allowed(cursor, user_id, role, contact_id):
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Contact is outside your messaging scope"}), 403
    cursor.execute(
        """
        SELECT id, sender_user_id AS senderId, recipient_user_id AS recipientId,
               body, read_at AS readAt, created_at AS createdAt
        FROM messages
        WHERE (sender_user_id = %s AND recipient_user_id = %s)
           OR (sender_user_id = %s AND recipient_user_id = %s)
        ORDER BY created_at, id
        """,
        (user_id, contact_id, contact_id, user_id),
    )
    messages = cursor.fetchall()
    cursor.execute(
        "UPDATE messages SET read_at = NOW() WHERE sender_user_id = %s AND recipient_user_id = %s AND read_at IS NULL",
        (contact_id, user_id),
    )
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "messages": messages})


@student_bp.post("/messages")
@require_auth
def send_message():
    user_id = g.current_user.get("id")
    data = request.get_json(silent=True) or {}
    recipient_id = data.get("recipientId")
    body = str(data.get("body") or "").strip()
    if not recipient_id or not body:
        return jsonify({"success": False, "message": "Recipient and message are required"}), 400
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    role = normalize_role(g.current_user.get("role"))
    if not message_contact_allowed(cursor, user_id, role, recipient_id):
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Recipient is outside your messaging scope"}), 403
    cursor.execute(
        "INSERT INTO messages(sender_user_id, recipient_user_id, body) VALUES(%s, %s, %s)",
        (user_id, recipient_id, body[:4000]),
    )
    message_id = cursor.lastrowid
    notify(cursor, recipient_id, f"Nouveau message de {g.current_user.get('name')}", body[:180], "message", "/messages")
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "messageId": message_id}), 201


@student_bp.get("/ai/conversations")
@require_auth
def list_ai_conversations():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT id, title, context_text AS context, created_at AS createdAt, updated_at AS updatedAt
        FROM ai_conversations
        WHERE user_id = %s
        ORDER BY updated_at DESC, id DESC
        LIMIT 100
        """,
        (g.current_user.get("id"),),
    )
    rows = _apply_ai_module_context(cursor, cursor.fetchall())
    cursor.close()
    db.close()
    return jsonify({"success": True, "conversations": rows})


@student_bp.post("/ai/conversations")
@require_auth
def create_ai_conversation():
    data = request.get_json(silent=True) or {}
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO ai_conversations(user_id, title, context_text) VALUES(%s, %s, %s)",
        (g.current_user.get("id"), data.get("title") or "Nouvelle conversation", data.get("context") or ""),
    )
    conversation_id = cursor.lastrowid
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "conversationId": conversation_id}), 201


@student_bp.get("/ai/conversations/<int:conversation_id>")
@require_auth
def get_ai_conversation(conversation_id):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        "SELECT id, title, context_text AS context FROM ai_conversations WHERE id = %s AND user_id = %s",
        (conversation_id, g.current_user.get("id")),
    )
    conversation = cursor.fetchone()
    if not conversation:
        cursor.close()
        db.close()
        return jsonify({"success": False, "message": "Conversation not found"}), 404
    cursor.execute(
        """
        SELECT id, role, content AS text, metadata_json AS metadataJson, created_at AS createdAt
        FROM ai_conversation_messages
        WHERE conversation_id = %s
        ORDER BY created_at, id
        """,
        (conversation_id,),
    )
    messages = cursor.fetchall()
    _apply_ai_module_context(cursor, [conversation])
    for message in messages:
        metadata = json.loads(message.pop("metadataJson") or "{}")
        message.update(metadata)
    cursor.close()
    db.close()
    return jsonify({"success": True, "conversation": conversation, "messages": messages})


@student_bp.patch("/ai/conversations/<int:conversation_id>")
@require_auth
def update_ai_conversation(conversation_id):
    data = request.get_json(silent=True) or {}
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        """
        UPDATE ai_conversations
        SET title = COALESCE(%s, title), context_text = COALESCE(%s, context_text), updated_at = NOW()
        WHERE id = %s AND user_id = %s
        """,
        (data.get("title"), data.get("context"), conversation_id, g.current_user.get("id")),
    )
    db.commit()
    updated = cursor.rowcount
    cursor.close()
    db.close()
    return jsonify({"success": bool(updated)})


@student_bp.post("/ai/conversations/<int:conversation_id>/messages")
@require_auth
def add_ai_conversation_message(conversation_id):
    data = request.get_json(silent=True) or {}
    role = data.get("role")
    content = str(data.get("text") or "").strip()
    if role not in {"student", "ai"} or not content:
        return jsonify({"success": False, "message": "Valid role and text are required"}), 400
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "SELECT id FROM ai_conversations WHERE id = %s AND user_id = %s",
        (conversation_id, g.current_user.get("id")),
    )
    if not cursor.fetchone():
        cursor.close()
        db.close()
        return jsonify({"success": False, "message": "Conversation not found"}), 404
    metadata = {
        key: data.get(key)
        for key in ("quiz", "fileCard", "imageUrl", "difficultyRequest", "questionCountRequest", "summaryReport", "moduleContext")
        if data.get(key) is not None
    }
    cursor.execute(
        """
        INSERT INTO ai_conversation_messages(conversation_id, role, content, metadata_json)
        VALUES(%s, %s, %s, %s)
        """,
        (conversation_id, role, content, json.dumps(metadata)),
    )
    cursor.execute("UPDATE ai_conversations SET updated_at = NOW() WHERE id = %s", (conversation_id,))
    db.commit()
    message_id = cursor.lastrowid
    cursor.close()
    db.close()
    return jsonify({"success": True, "messageId": message_id}), 201


@student_bp.delete("/ai/conversations/<int:conversation_id>")
@require_auth
def delete_ai_conversation(conversation_id):
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "DELETE FROM ai_conversations WHERE id = %s AND user_id = %s",
        (conversation_id, g.current_user.get("id")),
    )
    db.commit()
    deleted = cursor.rowcount
    cursor.close()
    db.close()
    return jsonify({"success": bool(deleted)})
