import json
from datetime import date, datetime, timedelta

from flask import Blueprint, g, jsonify, request

from .database import ensure_column, get_db
from .platform import ensure_complete_platform_tables
from .schools import ensure_platform_tables
from .config import normalize_role
from .security import require_auth, require_roles

schedule_bp = Blueprint("schedule", __name__, url_prefix="/api")


def ensure_schedule_tables(cursor):
    ensure_platform_tables(cursor)
    ensure_complete_platform_tables(cursor)
    ensure_column(cursor, "schedules", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
    ensure_column(cursor, "schedules", "week_start_date", "DATE NULL")
    cursor.execute("UPDATE schedules SET week_start_date = DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY) WHERE week_start_date IS NULL")


def normalize_time(value):
    text = str(value or "").strip()
    if len(text) >= 5:
        return text[:5]
    return text


def parse_week_start(value):
    if isinstance(value, datetime):
        current = value.date()
    elif isinstance(value, date):
        current = value
    else:
        text = str(value or "").strip()
        if not text:
            current = date.today()
        else:
            try:
                current = datetime.strptime(text[:10], "%Y-%m-%d").date()
            except ValueError:
                current = date.today()
    return current - timedelta(days=current.weekday())


def row_week_start(row):
    value = row.get("weekStartDate") or row.get("week_start_date") or row.get("createdAt") or row.get("created_at")
    return parse_week_start(value).isoformat()


def class_in_director_scope(cursor, class_id, director_id):
    cursor.execute(
        """
        SELECT c.id, c.school_id, c.name AS className, sc.name AS schoolName
        FROM classes c
        JOIN schools sc ON sc.id = c.school_id
        WHERE c.id = %s AND sc.director_user_id = %s AND sc.status = 'approved'
        """,
        (class_id, director_id),
    )
    return cursor.fetchone()


def schedule_in_director_scope(cursor, schedule_id, director_id):
    cursor.execute(
        """
        SELECT s.id, s.school_id, s.class_id
        FROM schedules s
        JOIN schools sc ON sc.id = s.school_id
        WHERE s.id = %s AND sc.director_user_id = %s
        """,
        (schedule_id, director_id),
    )
    return cursor.fetchone()


def serialize_schedule_entries(cursor, schedule_ids, role=None, user_id=None):
    if not schedule_ids:
        return {}
    placeholders = ",".join(["%s"] * len(schedule_ids))
    params = list(schedule_ids)
    teacher_filter = ""
    if role in {"teacher", "guest_teacher"}:
        teacher_filter = " AND si.teacher_user_id = %s"
        params.append(user_id)
    cursor.execute(
        f"""
        SELECT si.id, si.schedule_id AS scheduleId, si.class_id AS classId,
               si.module_id AS moduleId, m.name AS moduleName,
               si.teacher_user_id AS teacherId, u.name AS teacherName,
               si.day_of_week AS dayOfWeek,
               TIME_FORMAT(si.start_time, '%H:%i') AS startTime,
               TIME_FORMAT(si.end_time, '%H:%i') AS endTime,
               si.room AS roomName,
               si.conflict_status AS conflictStatus
        FROM schedule_items si
        LEFT JOIN modules m ON m.id = si.module_id
        LEFT JOIN users u ON u.id = si.teacher_user_id
        WHERE si.schedule_id IN ({placeholders}){teacher_filter}
        ORDER BY si.day_of_week, si.start_time, si.id
        """,
        tuple(params),
    )
    grouped = {schedule_id: [] for schedule_id in schedule_ids}
    for row in cursor.fetchall():
        grouped.setdefault(row["scheduleId"], []).append(row)
    return grouped


def backfill_schedule_items(cursor, schedule):
    try:
        legacy_entries = json.loads(schedule.get("entriesJson") or "[]")
    except (TypeError, json.JSONDecodeError):
        legacy_entries = []
    if not legacy_entries:
        return
    cursor.execute("SELECT COUNT(*) AS total FROM schedule_items WHERE schedule_id = %s", (schedule["id"],))
    if int((cursor.fetchone() or {}).get("total") or 0) > 0:
        return
    for entry in legacy_entries:
        try:
            day = int(entry.get("dayOfWeek"))
        except (TypeError, ValueError):
            day = None
        start_time = normalize_time(entry.get("startTime"))
        end_time = normalize_time(entry.get("endTime"))
        if day not in {1, 2, 3, 4, 5, 6, 7} or not start_time or not end_time or start_time >= end_time:
            continue
        cursor.execute(
            """
            INSERT INTO schedule_items(schedule_id, class_id, module_id, teacher_user_id, day_of_week, start_time, end_time, room, conflict_status)
            VALUES(%s, %s, %s, %s, %s, %s, %s, %s, 'clear')
            """,
            (
                schedule["id"],
                schedule["classId"],
                entry.get("moduleId") or None,
                entry.get("teacherId") or None,
                day,
                start_time,
                end_time,
                entry.get("roomName") or entry.get("room") or None,
            ),
        )


@schedule_bp.post("/teacher-availability")
@require_roles("teacher", "guest_teacher")
def save_teacher_availability():
    slots = (request.get_json(silent=True) or {}).get("slots", [])
    if not isinstance(slots, list):
        return jsonify({"success": False, "message": "slots must be a list"}), 400
    db = get_db()
    cursor = db.cursor()
    ensure_schedule_tables(cursor)
    cursor.execute("DELETE FROM teacher_availability WHERE teacher_user_id = %s", (g.current_user.get("id"),))
    for slot in slots:
        try:
            day = int(slot.get("dayOfWeek"))
        except (TypeError, ValueError):
            day = None
        start_time = slot.get("startTime")
        end_time = slot.get("endTime")
        if day not in {1, 2, 3, 4, 5, 6, 7} or not start_time or not end_time or start_time >= end_time:
            cursor.close()
            db.close()
            return jsonify({"success": False, "message": "Invalid availability slot"}), 400
        cursor.execute(
            """
            INSERT INTO teacher_availability(teacher_user_id, day_of_week, start_time, end_time)
            VALUES(%s, %s, %s, %s)
            """,
            (g.current_user.get("id"), day, start_time, end_time),
        )
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "message": "Availability saved"})


@schedule_bp.get("/teacher-availability")
@require_roles("teacher", "guest_teacher")
def get_teacher_availability():
    db = get_db(); cursor = db.cursor(dictionary=True)
    ensure_schedule_tables(cursor)
    cursor.execute("SELECT id, day_of_week AS dayOfWeek, TIME_FORMAT(start_time, '%H:%i') AS startTime, TIME_FORMAT(end_time, '%H:%i') AS endTime FROM teacher_availability WHERE teacher_user_id = %s ORDER BY day_of_week, start_time", (g.current_user.get("id"),))
    slots = cursor.fetchall(); cursor.close(); db.close()
    return jsonify({"success": True, "slots": slots})


@schedule_bp.post("/schedules/generate")
@require_roles("school_director")
def generate_schedule():
    data = request.get_json(silent=True) or {}
    class_id = data.get("classId")
    if not class_id:
        return jsonify({"success": False, "message": "classId is required"}), 400

    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_schedule_tables(cursor)
    class_scope = class_in_director_scope(cursor, class_id, g.current_user.get("id"))
    if not class_scope:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Class is outside your school"}), 403
    cursor.execute(
        """
        SELECT m.id, m.name, m.weekly_hours AS weeklyHours,
               (SELECT ct.teacher_user_id FROM class_teachers ct JOIN module_teachers mt ON mt.teacher_user_id = ct.teacher_user_id WHERE ct.class_id = %s AND mt.module_id = m.id AND ct.status = 'approved' LIMIT 1) AS teacherId
        FROM modules m
        JOIN class_modules cm ON cm.module_id = m.id
        WHERE cm.class_id = %s
        ORDER BY m.name
        """,
        (class_id, class_id),
    )
    modules = cursor.fetchall()

    raw_days = data.get("days") or [1, 2, 3, 4, 5]
    try:
        days = [int(day) for day in raw_days]
    except (TypeError, ValueError):
        days = []
    if not days or any(day not in {1, 2, 3, 4, 5, 6, 7} for day in days):
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "days must contain valid weekdays"}), 400
    start_hour = int(data.get("startHour") or 8)
    end_hour = int(data.get("endHour") or 17)
    if start_hour < 0 or end_hour > 23 or start_hour >= end_hour:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Invalid schedule hours"}), 400
    entries = []
    day_index = 0
    hour = start_hour
    for module in modules:
        sessions = max(1, int(round(float(module.get("weeklyHours") or 1))))
        for _ in range(sessions):
            entries.append({
                "dayOfWeek": days[day_index % len(days)],
                "startTime": f"{hour:02d}:00",
                "endTime": f"{hour + 1:02d}:00",
                "moduleId": module.get("id"),
                "moduleName": module.get("name"),
                "teacherId": module.get("teacherId"),
            })
            hour += 1
            if hour >= end_hour:
                hour = start_hour
                day_index += 1

    cursor.close()
    db.close()
    return jsonify({"success": True, "entries": entries})


@schedule_bp.post("/schedules")
@require_roles("school_director")
def save_schedule():
    data = request.get_json(silent=True) or {}
    class_id = data.get("classId")
    entries = data.get("entries")
    if not class_id or not isinstance(entries, list):
        return jsonify({"success": False, "message": "classId and entries are required"}), 400
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_schedule_tables(cursor)
    class_scope = class_in_director_scope(cursor, class_id, g.current_user.get("id"))
    if not class_scope:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Class is outside your school"}), 403
    normalized_entries = []
    for entry in entries:
        try:
            day = int(entry.get("dayOfWeek"))
        except (TypeError, ValueError):
            day = None
        start_time = normalize_time(entry.get("startTime"))
        end_time = normalize_time(entry.get("endTime"))
        if day not in {1, 2, 3, 4, 5, 6, 7} or not start_time or not end_time or start_time >= end_time:
            cursor.close(); db.close()
            return jsonify({"success": False, "message": "Invalid timetable slot"}), 400
        normalized_entries.append({
            "dayOfWeek": day,
            "startTime": start_time,
            "endTime": end_time,
            "moduleId": entry.get("moduleId") or None,
            "moduleName": entry.get("moduleName") or "",
            "teacherId": entry.get("teacherId") or None,
            "roomName": entry.get("roomName") or entry.get("room") or None,
        })
    week_start = parse_week_start(data.get("weekStartDate"))
    cursor.execute(
        """
        SELECT id FROM schedules
        WHERE class_id = %s AND school_id = %s AND week_start_date = %s
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (class_id, class_scope["school_id"], week_start),
    )
    existing = cursor.fetchone()
    if existing:
        schedule_id = existing["id"]
        cursor.execute(
            "UPDATE schedules SET generated_by = %s, status = 'published', entries_json = %s, week_start_date = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (g.current_user.get("id"), json.dumps(normalized_entries), week_start, schedule_id),
        )
        cursor.execute("DELETE FROM schedule_items WHERE schedule_id = %s", (schedule_id,))
    else:
        cursor.execute(
            """
            INSERT INTO schedules(school_id, class_id, generated_by, status, entries_json, week_start_date)
            VALUES(%s, %s, %s, 'published', %s, %s)
            """,
            (class_scope["school_id"], class_id, g.current_user.get("id"), json.dumps(normalized_entries), week_start),
        )
        schedule_id = cursor.lastrowid
    for entry in normalized_entries:
        cursor.execute(
            """
            INSERT INTO schedule_items(schedule_id, class_id, module_id, teacher_user_id, day_of_week, start_time, end_time, room, conflict_status)
            VALUES(%s, %s, %s, %s, %s, %s, %s, %s, 'clear')
            """,
            (
                schedule_id,
                class_id,
                entry["moduleId"],
                entry["teacherId"],
                entry["dayOfWeek"],
                entry["startTime"],
                entry["endTime"],
                entry["roomName"],
            ),
        )
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "message": "Emploi du temps enregistré", "scheduleId": schedule_id})


@schedule_bp.get("/schedules")
@require_auth
def list_schedules():
    class_id = request.args.get("classId")
    week_start = request.args.get("weekStartDate")
    role = normalize_role(g.current_user.get("role"))
    params = []
    filters = []
    if class_id:
        filters.append("s.class_id = %s")
        params.append(class_id)
    if week_start:
        filters.append("s.week_start_date = %s")
        params.append(parse_week_start(week_start))
    if role in {"student", "guest_student"}:
        filters.append("s.class_id = (SELECT main_class_id FROM students WHERE user_id = %s)")
        params.append(g.current_user.get("id"))
    elif role == "general_admin":
        pass
    elif role == "school_director":
        filters.append("s.school_id IN (SELECT id FROM schools WHERE director_user_id = %s)")
        params.append(g.current_user.get("id"))
    elif role in {"teacher", "guest_teacher"}:
        filters.append("s.class_id IN (SELECT class_id FROM class_teachers WHERE teacher_user_id = %s AND status = 'approved')")
        params.append(g.current_user.get("id"))
    else:
        filters.append("1 = 0")
    where = f"WHERE {' AND '.join(filters)}" if filters else ""
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_schedule_tables(cursor)
    cursor.execute(
        f"""
        SELECT s.id, s.school_id AS schoolId, sc.name AS schoolName,
               s.class_id AS classId, c.name AS className,
               s.status, s.entries_json AS entriesJson,
               s.week_start_date AS weekStartDate,
               s.created_at AS createdAt,
               COALESCE(s.updated_at, s.created_at) AS updatedAt
        FROM schedules s
        LEFT JOIN schools sc ON sc.id = s.school_id
        LEFT JOIN classes c ON c.id = s.class_id
        {where}
        ORDER BY COALESCE(s.week_start_date, DATE(s.created_at)) DESC, COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
        """,
        tuple(params),
    )
    rows = cursor.fetchall()
    for row in rows:
        backfill_schedule_items(cursor, row)
    db.commit()
    grouped_entries = serialize_schedule_entries(cursor, [row["id"] for row in rows], role, g.current_user.get("id"))
    cursor.close()
    db.close()
    for row in rows:
        legacy_entries = json.loads(row.pop("entriesJson") or "[]")
        row["weekStartDate"] = row_week_start(row)
        row["entries"] = grouped_entries.get(row["id"]) or legacy_entries
    return jsonify({"success": True, "schedules": rows})


@schedule_bp.patch("/schedules/<int:schedule_id>/items/<int:item_id>")
@require_roles("school_director")
def update_schedule_item(schedule_id, item_id):
    data = request.get_json(silent=True) or {}
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_schedule_tables(cursor)
    schedule = schedule_in_director_scope(cursor, schedule_id, g.current_user.get("id"))
    if not schedule:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Schedule is outside your school"}), 403
    cursor.execute("SELECT id FROM schedule_items WHERE id = %s AND schedule_id = %s", (item_id, schedule_id))
    if not cursor.fetchone():
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Slot not found"}), 404
    try:
        day = int(data.get("dayOfWeek"))
    except (TypeError, ValueError):
        day = None
    start_time = normalize_time(data.get("startTime"))
    end_time = normalize_time(data.get("endTime"))
    if day not in {1, 2, 3, 4, 5, 6, 7} or not start_time or not end_time or start_time >= end_time:
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Invalid timetable slot"}), 400
    cursor.execute(
        """
        UPDATE schedule_items
        SET day_of_week = %s, start_time = %s, end_time = %s,
            module_id = %s, teacher_user_id = %s, room = %s
        WHERE id = %s AND schedule_id = %s
        """,
        (
            day,
            start_time,
            end_time,
            data.get("moduleId") or None,
            data.get("teacherId") or None,
            data.get("roomName") or data.get("room") or None,
            item_id,
            schedule_id,
        ),
    )
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "message": "Créneau modifié"})


@schedule_bp.delete("/schedules/<int:schedule_id>/items/<int:item_id>")
@require_roles("school_director")
def delete_schedule_item(schedule_id, item_id):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_schedule_tables(cursor)
    if not schedule_in_director_scope(cursor, schedule_id, g.current_user.get("id")):
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Schedule is outside your school"}), 403
    cursor.execute("DELETE FROM schedule_items WHERE id = %s AND schedule_id = %s", (item_id, schedule_id))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "message": "Créneau supprimé"})


@schedule_bp.delete("/schedules/<int:schedule_id>")
@require_roles("school_director")
def delete_schedule(schedule_id):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_schedule_tables(cursor)
    if not schedule_in_director_scope(cursor, schedule_id, g.current_user.get("id")):
        cursor.close(); db.close()
        return jsonify({"success": False, "message": "Schedule is outside your school"}), 403
    cursor.execute("DELETE FROM schedule_items WHERE schedule_id = %s", (schedule_id,))
    cursor.execute("DELETE FROM schedules WHERE id = %s", (schedule_id,))
    db.commit()
    cursor.close()
    db.close()
    return jsonify({"success": True, "message": "Emploi du temps supprimé"})
