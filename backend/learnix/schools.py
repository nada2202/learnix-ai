import json
import secrets
from pathlib import Path

from flask import Blueprint, g, jsonify, request, send_from_directory
from mysql.connector import Error
from werkzeug.utils import secure_filename

from .database import get_db
from .notifications import notify
from .security import require_auth, require_roles

schools_bp = Blueprint("schools", __name__, url_prefix="/api")
SCHOOL_DOCUMENTS_DIR = Path(__file__).resolve().parents[1] / "uploads" / "school-documents"
SCHOOL_LOGOS_DIR = Path(__file__).resolve().parents[1] / "uploads" / "school-logos"
ALLOWED_SCHOOL_DOCUMENTS = {"pdf", "png", "jpg", "jpeg"}
ALLOWED_SCHOOL_LOGOS = {"png", "jpg", "jpeg", "webp"}


def ensure_platform_tables(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schools (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            school_type VARCHAR(100) NULL,
            address TEXT NULL,
            city VARCHAR(120) NULL,
            country VARCHAR(120) DEFAULT 'Morocco',
            phone VARCHAR(60) NULL,
            official_email VARCHAR(255) NULL,
            logo_url TEXT NULL,
            legal_documents_json LONGTEXT NULL,
            director_user_id INT NULL,
            director_name VARCHAR(255) NULL,
            director_email VARCHAR(255) NULL,
            status ENUM('pending','approved','rejected') DEFAULT 'pending',
            rejection_reason TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS school_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            school_id INT NOT NULL,
            requester_user_id INT NULL,
            status ENUM('pending','approved','rejected') DEFAULT 'pending',
            admin_user_id INT NULL,
            decision_reason TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            decided_at DATETIME NULL,
            FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS levels (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(120) NOT NULL UNIQUE,
            sort_order INT NOT NULL
        )
    """)
    for order, name in enumerate([
        "1ère année collège", "2ème année collège", "3ème année collège",
        "Tronc commun", "1ère année bac", "2ème année bac",
        "Licence 1", "Licence 2", "Licence 3", "Master 1", "Master 2",
        "Cycle ingénieur", "Autres niveaux universitaires",
    ], start=1):
        cursor.execute(
            "INSERT IGNORE INTO levels(name, sort_order) VALUES(%s, %s)",
            (name, order),
        )
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS classes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            school_id INT NULL,
            name VARCHAR(255) NOT NULL,
            level_name VARCHAR(120) NOT NULL,
            study_system VARCHAR(120) DEFAULT 'Système marocain',
            academic_year VARCHAR(20) NOT NULL,
            pedagogical_structure LONGTEXT NULL,
            status ENUM('draft','pending','approved','archived') DEFAULT 'draft',
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS modules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            level_name VARCHAR(120) NULL,
            weekly_hours DECIMAL(4,2) DEFAULT 1,
            pedagogical_objectives TEXT NULL,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS class_modules (
            class_id INT NOT NULL,
            module_id INT NOT NULL,
            PRIMARY KEY (class_id, module_id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS class_students (
            class_id INT NOT NULL,
            student_user_id INT NOT NULL,
            status ENUM('pending','approved','rejected') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (class_id, student_user_id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS class_teachers (
            class_id INT NOT NULL,
            teacher_user_id INT NOT NULL,
            status ENUM('pending','approved','rejected') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (class_id, teacher_user_id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS module_teachers (
            module_id INT NOT NULL,
            teacher_user_id INT NOT NULL,
            PRIMARY KEY (module_id, teacher_user_id)
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
        CREATE TABLE IF NOT EXISTS teacher_availability (
            id INT AUTO_INCREMENT PRIMARY KEY,
            teacher_user_id INT NOT NULL,
            day_of_week TINYINT NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schedules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            school_id INT NULL,
            class_id INT NOT NULL,
            generated_by INT NULL,
            status ENUM('draft','published') DEFAULT 'draft',
            entries_json LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_learning_profiles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            estimated_level VARCHAR(120) NULL,
            strengths LONGTEXT NULL,
            weaknesses LONGTEXT NULL,
            recommendations LONGTEXT NULL,
            history_summary LONGTEXT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """)


def db_fetchall(query, params=()):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_platform_tables(cursor)
    cursor.execute(query, params)
    rows = cursor.fetchall()
    cursor.close()
    db.close()
    return rows


def format_module_rows(rows):
    for row in rows:
        class_ids = [
            int(value)
            for value in str(row.pop("classIdsCsv", "") or "").split(",")
            if str(value).strip().isdigit()
        ]
        class_names = [
            value.strip()
            for value in str(row.pop("classNamesCsv", "") or "").split("||")
            if value.strip()
        ]
        row["classIds"] = class_ids
        row["classNames"] = class_names
        row["classes"] = [
            {"id": class_id, "name": class_names[index] if index < len(class_names) else ""}
            for index, class_id in enumerate(class_ids)
        ]
    return rows


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


def normalize_legal_documents(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value] if value else []


@schools_bp.post("/school-documents")
@require_roles("school_director")
def upload_school_documents():
    files = request.files.getlist("files")
    if not files:
        return jsonify({"success": False, "message": "No files were provided"}), 400

    target_dir = SCHOOL_DOCUMENTS_DIR / str(g.current_user.get("id"))
    target_dir.mkdir(parents=True, exist_ok=True)
    documents = []
    for file in files[:10]:
        original_name = secure_filename(file.filename or "")
        extension = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
        if not original_name or extension not in ALLOWED_SCHOOL_DOCUMENTS:
            return jsonify({"success": False, "message": f"Unsupported file: {file.filename}"}), 400
        file.seek(0, 2)
        size = file.tell()
        file.seek(0)
        if size > 10 * 1024 * 1024:
            return jsonify({"success": False, "message": f"File exceeds 10 MB: {file.filename}"}), 400
        stored_name = f"{secrets.token_hex(8)}-{original_name}"
        file.save(target_dir / stored_name)
        documents.append({
            "name": original_name,
            "url": f"/api/school-documents/{g.current_user.get('id')}/{stored_name}",
            "size": size,
        })
    return jsonify({"success": True, "documents": documents}), 201


@schools_bp.post("/school-logo")
@require_roles("school_director")
def upload_school_logo():
    try:
        file = request.files.get("file")
        if not file:
            return jsonify({"success": False, "message": "No logo was provided"}), 400

        original_name = secure_filename(file.filename or "")
        extension = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
        if not original_name or extension not in ALLOWED_SCHOOL_LOGOS:
            return jsonify({"success": False, "message": "Unsupported logo file"}), 400

        file.seek(0, 2)
        size = file.tell()
        file.seek(0)
        if size > 5 * 1024 * 1024:
            return jsonify({"success": False, "message": "Logo exceeds 5 MB"}), 400

        target_dir = SCHOOL_LOGOS_DIR / str(g.current_user.get("id"))
        target_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"{secrets.token_hex(8)}-{original_name}"
        file.save(target_dir / stored_name)
        return jsonify({
            "success": True,
            "logo": {
                "name": original_name,
                "url": f"/api/school-logos/{g.current_user.get('id')}/{stored_name}",
                "size": size,
            },
        }), 201
    except OSError as exc:
        return jsonify({"success": False, "message": f"Logo upload failed: {exc}"}), 500


@schools_bp.get("/school-documents/<int:user_id>/<path:filename>")
@require_auth
def download_school_document(user_id, filename):
    if g.current_user.get("role") != "general_admin" and int(g.current_user.get("id")) != user_id:
        return jsonify({"success": False, "message": "Document is outside your scope"}), 403
    return send_from_directory(SCHOOL_DOCUMENTS_DIR / str(user_id), secure_filename(filename), as_attachment=True)


@schools_bp.get("/school-logos/<int:user_id>/<path:filename>")
def view_school_logo(user_id, filename):
    return send_from_directory(SCHOOL_LOGOS_DIR / str(user_id), secure_filename(filename), as_attachment=False)


@schools_bp.get("/levels")
def levels():
    rows = db_fetchall("SELECT name, sort_order FROM levels ORDER BY sort_order")
    return jsonify({"success": True, "levels": rows})


@schools_bp.post("/schools")
@require_roles("school_director")
def create_school():
    data = request.get_json(silent=True) or {}
    required = ["name", "schoolType", "city", "officialEmail", "directorName", "directorEmail"]
    missing = [field for field in required if not data.get(field)]
    if missing:
        return jsonify({"success": False, "message": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        ensure_platform_tables(cursor)
        cursor.execute(
            """
            SELECT r.id, r.school_id AS schoolId
            FROM school_requests r
            JOIN schools s ON s.id = r.school_id
            WHERE r.requester_user_id = %s AND r.status = 'pending' AND s.status = 'pending'
            LIMIT 1
            """,
            (g.current_user.get("id"),),
        )
        existing_request = cursor.fetchone()
        if existing_request:
            cursor.execute(
                "SELECT legal_documents_json AS legalDocumentsJson FROM schools WHERE id = %s",
                (existing_request["schoolId"],),
            )
            existing_school = cursor.fetchone() or {}
            existing_documents = parse_legal_documents(existing_school.get("legalDocumentsJson"))
            incoming_documents = data.get("legalDocuments", [])
            if not isinstance(incoming_documents, list):
                incoming_documents = [incoming_documents] if incoming_documents else []
            merged_documents = [*existing_documents]
            seen_documents = {
                json.dumps(document, sort_keys=True) if isinstance(document, dict) else str(document)
                for document in merged_documents
            }
            for document in incoming_documents:
                document_key = json.dumps(document, sort_keys=True) if isinstance(document, dict) else str(document)
                if document_key and document_key not in seen_documents:
                    merged_documents.append(document)
                    seen_documents.add(document_key)
            cursor.execute(
                """
                UPDATE schools
                SET name = %s, school_type = %s, address = %s, city = %s, country = %s,
                    phone = %s, official_email = %s, logo_url = %s,
                    legal_documents_json = %s, director_name = %s, director_email = %s
                WHERE id = %s AND status = 'pending'
                """,
                (
                    data.get("name"),
                    data.get("schoolType"),
                    data.get("address"),
                    data.get("city"),
                    data.get("country") or "Morocco",
                    data.get("phone"),
                    data.get("officialEmail"),
                    data.get("logoUrl"),
                    json.dumps(merged_documents),
                    data.get("directorName"),
                    data.get("directorEmail"),
                    existing_request["schoolId"],
                ),
            )
            db.commit()
            cursor.close()
            db.close()
            return jsonify({
                "success": True,
                "message": "School request updated",
                "schoolId": existing_request["schoolId"],
                "requestId": existing_request["id"],
            }), 200
        cursor.execute(
            """
            INSERT INTO schools (
                name, school_type, address, city, country, phone, official_email,
                logo_url, legal_documents_json, director_user_id, director_name,
                director_email, status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
            """,
            (
                data.get("name"),
                data.get("schoolType"),
                data.get("address"),
                data.get("city"),
                data.get("country") or "Morocco",
                data.get("phone"),
                data.get("officialEmail"),
                data.get("logoUrl"),
                json.dumps(data.get("legalDocuments", [])),
                g.current_user.get("id"),
                data.get("directorName"),
                data.get("directorEmail"),
            ),
        )
        school_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO school_requests(school_id, requester_user_id) VALUES(%s, %s)",
            (school_id, g.current_user.get("id")),
        )
        request_id = cursor.lastrowid
        cursor.execute("SELECT id FROM users WHERE role = 'general_admin' AND status = 'active'")
        for admin in cursor.fetchall():
            notify(
                cursor,
                admin.get("id"),
                "Nouvelle demande d'école",
                f"{data.get('directorName')} a soumis {data.get('name')} pour validation.",
                "approval",
                "/platform#attachmentRequests",
            )
        db.commit()
        cursor.close()
        db.close()
    except Error as exc:
        return jsonify({"success": False, "message": f"School creation failed: {exc}"}), 500

    return jsonify({"success": True, "message": "School request submitted", "schoolId": school_id, "requestId": request_id}), 201


@schools_bp.get("/schools")
@require_auth
def list_schools():
    status = request.args.get("status")
    params = []
    where = []
    if status:
        where.append("status = %s")
        params.append(status)
    role = g.current_user.get("role")
    if role == "school_director":
        where.append("director_user_id = %s")
        params.append(g.current_user.get("id"))
    elif role in {"student", "guest_student", "teacher", "guest_teacher"}:
        where.append("status = 'approved'")
        where.append("director_user_id IS NOT NULL")
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    rows = db_fetchall(
        f"""
        SELECT id, name, school_type AS schoolType, address, city, country, phone,
               official_email AS officialEmail, director_name AS directorName,
               director_email AS directorEmail, status, rejection_reason AS rejectionReason,
               logo_url AS logoUrl, legal_documents_json AS legalDocumentsJson,
               created_at AS createdAt
        FROM schools
        {where_sql}
        ORDER BY created_at DESC
        """,
        tuple(params),
    )
    rows = [format_school_row(row) for row in rows]
    return jsonify({"success": True, "schools": rows})


@schools_bp.patch("/schools/<int:school_id>")
@require_roles("school_director")
def update_school(school_id):
    data = request.get_json(silent=True) or {}
    required = ["name", "schoolType", "city", "officialEmail", "directorName", "directorEmail"]
    missing = [field for field in required if field in data and not data.get(field)]
    if missing:
        return jsonify({"success": False, "message": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        ensure_platform_tables(cursor)
        cursor.execute(
            """
            SELECT id, name, school_type AS schoolType, address, city, country, phone,
                   official_email AS officialEmail, director_name AS directorName,
                   director_email AS directorEmail, status, logo_url AS logoUrl,
                   legal_documents_json AS legalDocumentsJson
            FROM schools
            WHERE id = %s AND director_user_id = %s AND status IN ('approved', 'pending')
            LIMIT 1
            """,
            (school_id, g.current_user.get("id")),
        )
        existing_school = cursor.fetchone()
        if not existing_school:
            cursor.close()
            db.close()
            return jsonify({"success": False, "message": "School is outside your management scope"}), 403

        existing_documents = parse_legal_documents(existing_school.get("LegalDocumentsJson") or existing_school.get("legalDocumentsJson"))
        legal_documents = normalize_legal_documents(data.get("legalDocuments")) if "legalDocuments" in data else existing_documents

        values = {
            "name": data.get("name", existing_school.get("name")),
            "schoolType": data.get("schoolType", existing_school.get("schoolType")),
            "address": data.get("address", existing_school.get("address")),
            "city": data.get("city", existing_school.get("city")),
            "country": data.get("country", existing_school.get("country") or "Morocco"),
            "phone": data.get("phone", existing_school.get("phone")),
            "officialEmail": data.get("officialEmail", existing_school.get("officialEmail")),
            "logoUrl": data.get("logoUrl", existing_school.get("logoUrl")),
            "directorName": data.get("directorName", existing_school.get("directorName")),
            "directorEmail": data.get("directorEmail", existing_school.get("directorEmail")),
        }

        cursor.execute(
            """
            UPDATE schools
            SET name = %s, school_type = %s, address = %s, city = %s, country = %s,
                phone = %s, official_email = %s, logo_url = %s,
                legal_documents_json = %s, director_name = %s, director_email = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND director_user_id = %s AND status IN ('approved', 'pending')
            """,
            (
                values["name"],
                values["schoolType"],
                values["address"],
                values["city"],
                values["country"],
                values["phone"],
                values["officialEmail"],
                values["logoUrl"],
                json.dumps(legal_documents),
                values["directorName"],
                values["directorEmail"],
                school_id,
                g.current_user.get("id"),
            ),
        )
        db.commit()
        cursor.close()
        db.close()
        return jsonify({"success": True, "message": "School updated", "schoolId": school_id})
    except Error as exc:
        return jsonify({"success": False, "message": f"School update failed: {exc}"}), 500


@schools_bp.patch("/schools/<int:school_id>/decision")
@require_roles("general_admin")
def decide_school(school_id):
    data = request.get_json(silent=True) or {}
    decision = data.get("status")
    reason = data.get("reason", "")
    if decision not in {"approved", "rejected"}:
        return jsonify({"success": False, "message": "status must be approved or rejected"}), 400

    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_platform_tables(cursor)
    cursor.execute(
        """
        SELECT r.id AS requestId, r.requester_user_id AS requesterUserId,
               s.id AS schoolId, s.status
        FROM school_requests r
        JOIN schools s ON s.id = r.school_id
        WHERE s.id = %s AND r.status = 'pending'
        LIMIT 1
        """,
        (school_id,),
    )
    pending_request = cursor.fetchone()
    if not pending_request:
        cursor.close()
        db.close()
        return jsonify({"success": False, "message": "Pending school request not found"}), 404
    cursor.execute(
        "UPDATE schools SET status = %s, rejection_reason = %s WHERE id = %s",
        (decision, reason if decision == "rejected" else None, school_id),
    )
    if cursor.rowcount == 0:
        cursor.close()
        db.close()
        return jsonify({"success": False, "message": "School not found"}), 404
    cursor.execute(
        "DELETE FROM school_requests WHERE id = %s",
        (pending_request["requestId"],),
    )
    notify(
        cursor,
        pending_request.get("requesterUserId"),
        "Demande d'école approuvée" if decision == "approved" else "Demande d'école refusée",
        reason or ("Votre établissement est maintenant validé." if decision == "approved" else "Votre demande d'établissement n'a pas été acceptée."),
        "approval",
        "/platform#schools",
    )
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "message": f"School {decision}"})


@schools_bp.post("/classes")
@require_roles("school_director")
def create_class():
    data = request.get_json(silent=True) or {}
    if not data.get("name") or not data.get("levelName") or not data.get("academicYear"):
        return jsonify({"success": False, "message": "name, levelName and academicYear are required"}), 400
    status = "approved"
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_platform_tables(cursor)
    cursor.execute("SELECT id FROM schools WHERE id = %s AND director_user_id = %s", (data.get("schoolId"), g.current_user.get("id")))
    if not cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "School is outside your management scope"}), 403
    cursor.execute(
        """
        INSERT INTO classes (
            school_id, name, level_name, study_system, academic_year,
            pedagogical_structure, status, created_by
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            data.get("schoolId"),
            data.get("name"),
            data.get("levelName"),
            data.get("studySystem") or "Système marocain",
            data.get("academicYear"),
            data.get("pedagogicalStructure"),
            status,
            g.current_user.get("id"),
        ),
    )
    class_id = cursor.lastrowid
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "classId": class_id, "status": status}), 201


@schools_bp.get("/classes")
@require_auth
def list_classes():
    school_id = request.args.get("schoolId")
    params = []
    where = ""
    role = g.current_user.get("role")
    if role == "school_director":
        where = "WHERE c.school_id IN (SELECT id FROM schools WHERE director_user_id = %s)"
        params.append(g.current_user.get("id"))
    elif role in {"student", "guest_student"}:
        where = "WHERE c.school_id = (SELECT school_id FROM students WHERE user_id = %s)"
        params.append(g.current_user.get("id"))
    elif role in {"teacher", "guest_teacher"}:
        where = "WHERE c.school_id = (SELECT school_id FROM teachers WHERE user_id = %s)"
        params.append(g.current_user.get("id"))
    elif school_id:
        where = "WHERE c.school_id = %s"
        params.append(school_id)
    rows = db_fetchall(
        f"""
        SELECT c.id, c.school_id AS schoolId, s.name AS schoolName, c.name,
               c.level_name AS levelName, c.study_system AS studySystem,
               c.academic_year AS academicYear, c.status
        FROM classes c
        LEFT JOIN schools s ON s.id = c.school_id
        {where}
        ORDER BY COALESCE((SELECT sort_order FROM levels l WHERE l.name = c.level_name), 999), c.name
        """,
        tuple(params),
    )
    return jsonify({"success": True, "classes": rows})


@schools_bp.post("/modules")
@require_roles("school_director")
def create_module():
    data = request.get_json(silent=True) or {}
    if not data.get("name"):
        return jsonify({"success": False, "message": "Module name is required"}), 400
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_platform_tables(cursor)
    class_ids = [int(value) for value in data.get("classIds", [])]
    if not class_ids:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "At least one class is required"}), 400
    placeholders = ",".join(["%s"] * len(class_ids))
    cursor.execute(
        f"SELECT COUNT(*) AS total FROM classes WHERE id IN ({placeholders}) AND school_id IN (SELECT id FROM schools WHERE director_user_id = %s)",
        tuple(class_ids + [g.current_user.get("id")]),
    )
    if int((cursor.fetchone() or {}).get("total") or 0) != len(class_ids):
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "One or more classes are outside your school"}), 403
    cursor.execute(
        """
        INSERT INTO modules(name, description, level_name, weekly_hours, pedagogical_objectives, created_by)
        VALUES(%s, %s, %s, %s, %s, %s)
        """,
        (
            data.get("name"),
            data.get("description"),
            data.get("levelName"),
            data.get("weeklyHours") or 1,
            data.get("pedagogicalObjectives"),
            g.current_user.get("id"),
        ),
    )
    module_id = cursor.lastrowid
    for class_id in class_ids:
        cursor.execute(
            "INSERT IGNORE INTO class_modules(class_id, module_id) VALUES(%s, %s)",
            (class_id, module_id),
        )
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "moduleId": module_id}), 201


@schools_bp.get("/modules")
@require_auth
def list_modules():
    role = g.current_user.get("role")
    user_id = g.current_user.get("id")
    if role == "general_admin":
        query = """
            SELECT m.id, m.name, m.description, m.level_name AS levelName,
                   m.weekly_hours AS weeklyHours,
                   m.pedagogical_objectives AS pedagogicalObjectives,
                   GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS schoolName,
                   GROUP_CONCAT(DISTINCT c.id ORDER BY c.name SEPARATOR ',') AS classIdsCsv,
                   GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR '||') AS classNamesCsv,
                   COUNT(DISTINCT co.id) AS courseCount
            FROM modules m
            LEFT JOIN class_modules cm ON cm.module_id = m.id
            LEFT JOIN classes c ON c.id = cm.class_id
            LEFT JOIN schools s ON s.id = c.school_id
            LEFT JOIN courses co ON co.module_id = m.id
            GROUP BY m.id, m.name, m.description, m.level_name, m.weekly_hours, m.pedagogical_objectives
            ORDER BY m.name
        """
        rows = format_module_rows(db_fetchall(query))
        return jsonify({"success": True, "modules": rows})
    if role == "school_director":
        query = """
            SELECT m.id, m.name, m.description, m.level_name AS levelName,
                   m.weekly_hours AS weeklyHours,
                   m.pedagogical_objectives AS pedagogicalObjectives,
                   GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS schoolName,
                   GROUP_CONCAT(DISTINCT c.id ORDER BY c.name SEPARATOR ',') AS classIdsCsv,
                   GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR '||') AS classNamesCsv,
                   COUNT(DISTINCT co.id) AS courseCount
            FROM modules m
            JOIN class_modules cm ON cm.module_id = m.id
            JOIN classes c ON c.id = cm.class_id
            JOIN schools s ON s.id = c.school_id
            LEFT JOIN courses co ON co.module_id = m.id
            WHERE s.director_user_id = %s
            GROUP BY m.id, m.name, m.description, m.level_name, m.weekly_hours, m.pedagogical_objectives
            ORDER BY m.name
        """
    elif role in {"student", "guest_student"}:
        query = """
            SELECT m.id, m.name, m.description, m.level_name AS levelName,
                   m.weekly_hours AS weeklyHours,
                   m.pedagogical_objectives AS pedagogicalObjectives,
                   GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS schoolName,
                   GROUP_CONCAT(DISTINCT c.id ORDER BY c.name SEPARATOR ',') AS classIdsCsv,
                   GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR '||') AS classNamesCsv,
                   COUNT(DISTINCT co.id) AS courseCount
            FROM modules m
            JOIN class_modules cm ON cm.module_id = m.id
            JOIN classes c ON c.id = cm.class_id
            LEFT JOIN schools s ON s.id = c.school_id
            LEFT JOIN courses co ON co.module_id = m.id
            WHERE cm.class_id = (SELECT main_class_id FROM students WHERE user_id = %s)
            GROUP BY m.id, m.name, m.description, m.level_name, m.weekly_hours, m.pedagogical_objectives
            ORDER BY m.name
        """
    elif role in {"teacher", "guest_teacher"}:
        query = """
            SELECT m.id, m.name, m.description, m.level_name AS levelName,
                   m.weekly_hours AS weeklyHours,
                   m.pedagogical_objectives AS pedagogicalObjectives,
                   GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS schoolName,
                   GROUP_CONCAT(DISTINCT c.id ORDER BY c.name SEPARATOR ',') AS classIdsCsv,
                   GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR '||') AS classNamesCsv,
                   COUNT(DISTINCT co.id) AS courseCount
            FROM modules m
            JOIN module_teachers mt ON mt.module_id = m.id
            LEFT JOIN class_modules cm ON cm.module_id = m.id
            LEFT JOIN classes c ON c.id = cm.class_id
            LEFT JOIN schools s ON s.id = c.school_id
            LEFT JOIN courses co ON co.module_id = m.id
            WHERE mt.teacher_user_id = %s
            GROUP BY m.id, m.name, m.description, m.level_name, m.weekly_hours, m.pedagogical_objectives
            ORDER BY m.name
        """
    else:
        return jsonify({"success": True, "modules": []})
    rows = format_module_rows(db_fetchall(query, (user_id,)))
    return jsonify({"success": True, "modules": rows})


@schools_bp.patch("/classes/<int:class_id>")
@require_roles("school_director")
def update_class(class_id):
    data = request.get_json(silent=True) or {}
    db = get_db(); cursor = db.cursor()
    ensure_platform_tables(cursor)
    cursor.execute("""
        UPDATE classes SET name = COALESCE(%s, name), level_name = COALESCE(%s, level_name),
               academic_year = COALESCE(%s, academic_year), pedagogical_structure = COALESCE(%s, pedagogical_structure)
        WHERE id = %s AND school_id IN (SELECT id FROM schools WHERE director_user_id = %s)
    """, (data.get("name"), data.get("levelName"), data.get("academicYear"), data.get("pedagogicalStructure"), class_id, g.current_user.get("id")))
    if cursor.rowcount == 0:
        cursor.close(); db.close(); return jsonify({"success": False, "message": "Class not found"}), 404
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Class updated"})


@schools_bp.delete("/classes/<int:class_id>")
@require_roles("school_director")
def archive_class(class_id):
    db = get_db(); cursor = db.cursor()
    ensure_platform_tables(cursor)
    cursor.execute("UPDATE classes SET status = 'archived' WHERE id = %s AND school_id IN (SELECT id FROM schools WHERE director_user_id = %s)", (class_id, g.current_user.get("id")))
    if cursor.rowcount == 0:
        cursor.close(); db.close(); return jsonify({"success": False, "message": "Class not found"}), 404
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Class archived"})


@schools_bp.patch("/modules/<int:module_id>")
@require_roles("school_director")
def update_module(module_id):
    data = request.get_json(silent=True) or {}
    db = get_db(); cursor = db.cursor()
    ensure_platform_tables(cursor)
    cursor.execute("""
        UPDATE modules SET name = COALESCE(%s, name), description = COALESCE(%s, description),
               level_name = COALESCE(%s, level_name), weekly_hours = COALESCE(%s, weekly_hours),
               pedagogical_objectives = COALESCE(%s, pedagogical_objectives)
        WHERE id = %s AND EXISTS (
          SELECT 1 FROM class_modules cm JOIN classes c ON c.id = cm.class_id JOIN schools s ON s.id = c.school_id
          WHERE cm.module_id = modules.id AND s.director_user_id = %s
        )
    """, (data.get("name"), data.get("description"), data.get("levelName"), data.get("weeklyHours"), data.get("pedagogicalObjectives"), module_id, g.current_user.get("id")))
    if cursor.rowcount == 0:
        cursor.close(); db.close(); return jsonify({"success": False, "message": "Module not found"}), 404
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Module updated"})


@schools_bp.delete("/modules/<int:module_id>")
@require_roles("school_director")
def delete_module(module_id):
    db = get_db(); cursor = db.cursor()
    ensure_platform_tables(cursor)
    cursor.execute("SELECT 1 FROM class_modules cm JOIN classes c ON c.id = cm.class_id JOIN schools s ON s.id = c.school_id WHERE cm.module_id = %s AND s.director_user_id = %s LIMIT 1", (module_id, g.current_user.get("id")))
    if not cursor.fetchone():
        cursor.close(); db.close(); return jsonify({"success": False, "message": "Module not found"}), 404
    cursor.execute("DELETE FROM class_modules WHERE module_id = %s", (module_id,))
    cursor.execute("DELETE FROM module_teachers WHERE module_id = %s", (module_id,))
    cursor.execute("DELETE FROM modules WHERE id = %s", (module_id,))
    db.commit(); cursor.close(); db.close()
    return jsonify({"success": True, "message": "Module deleted"})
