import json

from flask import Blueprint, g, jsonify

from .database import get_db
from .platform import ensure_complete_platform_tables
from .security import require_auth

ai_bp = Blueprint("ai", __name__, url_prefix="/api")


@ai_bp.get("/ai-learning-profile")
@require_auth
def ai_learning_profile():
    user_id = g.current_user.get("id")
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_complete_platform_tables(cursor)
    cursor.execute(
        """
        SELECT percentage, category, feedback
        FROM quiz_results
        WHERE user_id = %s OR user_email = %s OR student_email = %s
        ORDER BY created_at DESC
        LIMIT 30
        """,
        (user_id, g.current_user.get("email"), g.current_user.get("email")),
    )
    rows = cursor.fetchall()
    scores = [float(row.get("percentage") or 0) for row in rows]
    avg = round(sum(scores) / len(scores), 2) if scores else 0
    estimated_level = "advanced" if avg >= 85 else "intermediate" if avg >= 60 else "foundation"
    categories = {}
    for row in rows:
        category = row.get("category") or "General"
        categories.setdefault(category, []).append(float(row.get("percentage") or 0))
    strengths = [name for name, values in categories.items() if sum(values) / len(values) >= 75]
    weaknesses = [name for name, values in categories.items() if sum(values) / len(values) < 60]
    recommendations = [
        "Review recent corrections before generating a new quiz",
        "Increase difficulty only after two strong attempts in the same module",
    ]
    if weaknesses:
        recommendations.insert(0, f"Revisit: {', '.join(weaknesses)}")

    cursor.execute(
        """
        SELECT s.education_level AS educationLevel, s.school_id AS schoolId,
               s.main_class_id AS classId, sc.name AS schoolName, c.name AS className,
               COUNT(DISTINCT d.id) AS trainedDocuments,
               COUNT(DISTINCT cm.module_id) AS trainedModules
        FROM students s
        LEFT JOIN schools sc ON sc.id = s.school_id
        LEFT JOIN classes c ON c.id = s.main_class_id
        LEFT JOIN class_modules cm ON cm.class_id = s.main_class_id
        LEFT JOIN ai_context_documents d ON d.user_id = s.user_id
        WHERE s.user_id = %s
        GROUP BY s.user_id, s.education_level, s.school_id, s.main_class_id, sc.name, c.name
        """,
        (user_id,),
    )
    scope = cursor.fetchone() or {}
    cursor.execute(
        "SELECT file_name AS fileName, created_at AS createdAt FROM ai_context_documents WHERE user_id = %s ORDER BY created_at DESC LIMIT 5",
        (user_id,),
    )
    sources = cursor.fetchall()

    cursor.execute(
        """
        INSERT INTO ai_learning_profiles (
            user_id, estimated_level, strengths, weaknesses, recommendations, history_summary
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            estimated_level = VALUES(estimated_level),
            strengths = VALUES(strengths),
            weaknesses = VALUES(weaknesses),
            recommendations = VALUES(recommendations),
            history_summary = VALUES(history_summary)
        """,
        (
            user_id,
            estimated_level,
            json.dumps(strengths),
            json.dumps(weaknesses),
            json.dumps(recommendations),
            json.dumps({"attempts": len(rows), "averageScore": avg}),
        ),
    )
    db.commit()
    cursor.close()
    db.close()
    return jsonify({
        "success": True,
        "profile": {
            "estimatedLevel": estimated_level,
            "averageScore": avg,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "recommendations": recommendations,
            "scope": scope,
            "sources": sources,
        },
    })
