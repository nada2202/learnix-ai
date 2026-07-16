import json
import os

from werkzeug.security import generate_password_hash


ROLE_MATRIX = {
    "general_admin": [
        "approve_schools", "view_all_schools", "manage_users", "view_statistics",
        "manage_reports", "view_audit_logs",
    ],
    "school_director": [
        "request_school", "manage_own_school", "manage_classes", "manage_modules",
        "approve_teacher_requests", "approve_student_requests", "generate_schedules",
        "view_school_analytics",
    ],
    "teacher": [
        "view_assigned_classes", "create_courses", "create_quizzes", "create_exams",
        "generate_ai_exercises", "view_student_results", "set_availability",
        "message_students",
    ],
    "guest_teacher": [
        "create_free_courses", "create_free_quizzes", "accept_free_students",
        "set_availability", "track_own_students", "message_students",
    ],
    "student": [
        "view_assigned_class", "view_courses", "take_quizzes", "take_exams",
        "use_class_ai", "view_progress", "receive_recommendations", "message_teachers",
    ],
    "guest_student": [
        "choose_level", "choose_modules", "use_free_ai", "generate_exercises",
        "request_free_teacher_support", "track_personal_progress",
    ],
}

LEVELS = [
    "1\u00e8re ann\u00e9e coll\u00e8ge",
    "2\u00e8me ann\u00e9e coll\u00e8ge",
    "3\u00e8me ann\u00e9e coll\u00e8ge",
    "Tronc commun",
    "1\u00e8re ann\u00e9e bac",
    "2\u00e8me ann\u00e9e bac",
    "Licence 1",
    "Licence 2",
    "Licence 3",
    "Master 1",
    "Master 2",
    "Cycle ing\u00e9nieur",
    "Autres niveaux universitaires",
]

DEMO_USERS = [
    ("Learnix Admin", "admin@learnix.local", "General Admin", "general_admin"),
    ("School Director", "director@learnix.local", "Director", "school_director"),
    ("Demo Teacher", "teacher@learnix.local", "Teacher", "teacher"),
    ("Demo Student", "student@learnix.local", "Student", "student"),
    ("Guest Teacher", "guest.teacher@learnix.local", "Teacher", "guest_teacher"),
    ("Guest Student", "guest.student@learnix.local", "Student", "guest_student"),
]


def seed(connection):
    cursor = connection.cursor()

    for role, permissions in ROLE_MATRIX.items():
        cursor.execute(
            """
            INSERT INTO roles(name, permissions_json)
            VALUES(%s, %s)
            ON DUPLICATE KEY UPDATE permissions_json = VALUES(permissions_json)
            """,
            (role, json.dumps(permissions)),
        )

    for sort_order, level in enumerate(LEVELS, start=1):
        cursor.execute(
            """
            INSERT INTO levels(name, sort_order)
            VALUES(%s, %s)
            ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)
            """,
            (level, sort_order),
        )
        cursor.execute(
            """
            INSERT INTO education_levels(name, sort_order)
            VALUES(%s, %s)
            ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)
            """,
            (level, sort_order),
        )

    default_password = os.getenv("SEED_DEFAULT_PASSWORD", "Learnix123!")
    password_hash = generate_password_hash(default_password)
    for name, email, level, role in DEMO_USERS:
        cursor.execute(
            """
            INSERT INTO users(name, email, password, level, role, status)
            VALUES(%s, %s, %s, %s, %s, 'active')
            ON DUPLICATE KEY UPDATE
              name = VALUES(name),
              level = VALUES(level),
              role = VALUES(role),
              status = 'active'
            """,
            (name, email, password_hash, level, role),
        )

    cursor.execute("SELECT id FROM schools WHERE official_email = %s LIMIT 1", ("demo.school@learnix.local",))
    school = cursor.fetchone()
    if school:
        school_id = school[0]
    else:
        cursor.execute(
            """
            INSERT INTO schools(name, school_type, city, official_email, status)
            VALUES(%s, %s, %s, %s, 'approved')
            """,
            ("Learnix Demo School", "Secondary", "Casablanca", "demo.school@learnix.local"),
        )
        school_id = cursor.lastrowid

    cursor.execute("SELECT id, name, email FROM users WHERE email = %s LIMIT 1", ("director@learnix.local",))
    demo_director = cursor.fetchone()
    if demo_director:
        cursor.execute(
            "UPDATE schools SET director_user_id = %s, director_name = %s, director_email = %s WHERE id = %s",
            (demo_director[0], demo_director[1], demo_director[2], school_id),
        )

    cursor.execute("SELECT id FROM classes WHERE school_id = %s AND name = %s LIMIT 1", (school_id, "2BAC-SM-A"))
    classroom = cursor.fetchone()
    if classroom:
        class_id = classroom[0]
    else:
        cursor.execute(
            """
            INSERT INTO classes(school_id, name, level_name, academic_year, status)
            VALUES(%s, %s, %s, %s, 'approved')
            """,
            (school_id, "2BAC-SM-A", "2ème année bac", "2025-2026"),
        )
        class_id = cursor.lastrowid

    cursor.execute("SELECT id FROM modules WHERE name = %s AND level_name = %s LIMIT 1", ("Mathématiques", "2ème année bac"))
    module = cursor.fetchone()
    if module:
        module_id = module[0]
    else:
        cursor.execute(
            """
            INSERT INTO modules(name, description, level_name, weekly_hours, pedagogical_objectives)
            VALUES(%s, %s, %s, %s, %s)
            """,
            ("Mathématiques", "Analyse, algèbre et probabilités", "2ème année bac", 5, "Raisonner, modéliser et résoudre des problèmes"),
        )
        module_id = cursor.lastrowid

    cursor.execute("SELECT id FROM users WHERE email = %s", ("teacher@learnix.local",))
    teacher_user_id = cursor.fetchone()[0]
    cursor.execute("SELECT id FROM users WHERE email = %s", ("student@learnix.local",))
    student_user_id = cursor.fetchone()[0]
    cursor.execute(
        """
        INSERT INTO teachers(user_id, mode, school_id, specialties_json, status)
        VALUES(%s, 'assigned', %s, %s, 'active')
        ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), specialties_json = VALUES(specialties_json), status = 'active'
        """,
        (teacher_user_id, school_id, json.dumps(["Mathématiques"])),
    )
    cursor.execute(
        """
        INSERT INTO students(user_id, mode, school_id, main_class_id, education_level, status)
        VALUES(%s, 'assigned', %s, %s, %s, 'active')
        ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), main_class_id = VALUES(main_class_id), education_level = VALUES(education_level), status = 'active'
        """,
        (student_user_id, school_id, class_id, "2ème année bac"),
    )
    cursor.execute("INSERT IGNORE INTO class_modules(class_id, module_id) VALUES(%s, %s)", (class_id, module_id))
    cursor.execute(
        """
        INSERT INTO class_teachers(class_id, teacher_user_id, status)
        VALUES(%s, %s, 'approved')
        ON DUPLICATE KEY UPDATE status = 'approved'
        """,
        (class_id, teacher_user_id),
    )
    cursor.execute(
        """
        INSERT INTO class_students(class_id, student_user_id, status)
        VALUES(%s, %s, 'approved')
        ON DUPLICATE KEY UPDATE status = 'approved'
        """,
        (class_id, student_user_id),
    )
    cursor.execute("INSERT IGNORE INTO module_teachers(module_id, teacher_user_id) VALUES(%s, %s)", (module_id, teacher_user_id))
    cursor.execute(
        """
        INSERT INTO student_modules(student_user_id, module_id, teacher_user_id, status)
        VALUES(%s, %s, %s, 'active')
        ON DUPLICATE KEY UPDATE teacher_user_id = VALUES(teacher_user_id), status = 'active'
        """,
        (student_user_id, module_id, teacher_user_id),
    )

    connection.commit()
    cursor.close()

    return {
        "roles": len(ROLE_MATRIX),
        "levels": len(LEVELS),
        "users": len(DEMO_USERS),
        "default_password": default_password,
    }
