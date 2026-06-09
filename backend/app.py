from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
from werkzeug.security import generate_password_hash, check_password_hash
from PyPDF2 import PdfReader
from groq import Groq
from dotenv import load_dotenv
import os
import hashlib
import json
import re
from datetime import datetime
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

try:
    from PIL import Image
    import pytesseract
except Exception:
    Image = None
    pytesseract = None

load_dotenv()

app = Flask(__name__)
CORS(app)

client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None


def get_db():
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "127.0.0.1"),
        port=int(os.getenv("MYSQL_PORT", "3307")),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
        database=os.getenv("MYSQL_DATABASE", "ai_learning_platform")
    )


def find_user_by_email(email):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cursor.fetchone()
    cursor.close()
    db.close()
    return user


def legacy_hash_matches(stored_password, plain_password):
    legacy_hashes = {
        hashlib.sha1(plain_password.encode()).hexdigest(),
        hashlib.sha256(plain_password.encode()).hexdigest(),
    }
    return stored_password in legacy_hashes


def password_matches(stored_password, plain_password):
    if not stored_password:
        return False

    try:
        if check_password_hash(stored_password, plain_password):
            return True
    except ValueError:
        pass

    return legacy_hash_matches(stored_password, plain_password)


def upgrade_password_hash(user_id, plain_password):
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "UPDATE users SET password = %s WHERE id = %s",
        (generate_password_hash(plain_password), user_id)
    )
    db.commit()
    cursor.close()
    db.close()


def ensure_results_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS quiz_results (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,
            student_email VARCHAR(255) NULL,
            user_email VARCHAR(255) NULL,
            student_name VARCHAR(255) NULL,
            category VARCHAR(100) NULL,
            teacher_id VARCHAR(100) NULL,
            teacher_name VARCHAR(255) NULL,
            teacher_email VARCHAR(255) NULL,
            teacher_subject VARCHAR(100) NULL,
            difficulty VARCHAR(50) NULL,
            total_questions INT NOT NULL,
            score INT NOT NULL,
            correct_count INT DEFAULT 0,
            incorrect_count INT DEFAULT 0,
            percentage DECIMAL(5,2) NOT NULL,
            time_spent_seconds INT DEFAULT 0,
            feedback TEXT NULL,
            details LONGTEXT NULL,
            questions_json LONGTEXT NULL,
            answers_json LONGTEXT NULL,
            corrections_json LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("SHOW COLUMNS FROM quiz_results")
    existing_columns = {
        column.get("Field") if isinstance(column, dict) else column[0]
        for column in cursor.fetchall()
    }
    if "time_spent_seconds" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN time_spent_seconds INT DEFAULT 0")
    if "user_email" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN user_email VARCHAR(255) NULL")
    if "correct_count" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN correct_count INT DEFAULT 0")
    if "incorrect_count" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN incorrect_count INT DEFAULT 0")
    if "student_name" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN student_name VARCHAR(255) NULL")
    if "teacher_id" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN teacher_id VARCHAR(100) NULL")
    if "teacher_name" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN teacher_name VARCHAR(255) NULL")
    if "teacher_email" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN teacher_email VARCHAR(255) NULL")
    if "teacher_subject" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN teacher_subject VARCHAR(100) NULL")
    if "questions_json" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN questions_json LONGTEXT NULL")
    if "answers_json" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN answers_json LONGTEXT NULL")
    if "corrections_json" not in existing_columns:
        cursor.execute("ALTER TABLE quiz_results ADD COLUMN corrections_json LONGTEXT NULL")


def safe_json_load(value, fallback):
    if not value:
        return fallback

    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def result_details_from_row(row):
    return safe_json_load(row.get("details"), [])


def serialize_quiz_result(row, include_details=False):
    details = result_details_from_row(row)
    correct_count = row.get("correct_count")
    incorrect_count = row.get("incorrect_count")

    if correct_count is None or int(correct_count or 0) == 0 and details:
        correct_count = len([item for item in details if item.get("isCorrect")])

    if incorrect_count is None or int(incorrect_count or 0) == 0 and details:
        incorrect_count = len(details) - int(correct_count or 0)

    serialized = {
        "id": row.get("id"),
        "userId": row.get("user_id"),
        "email": row.get("user_email") or row.get("student_email"),
        "studentName": row.get("student_name") or "",
        "category": row.get("category") or "General",
        "teacherId": row.get("teacher_id") or "",
        "teacherName": row.get("teacher_name") or "",
        "teacherEmail": row.get("teacher_email") or "",
        "teacherSubject": row.get("teacher_subject") or "",
        "difficulty": row.get("difficulty") or "Easy",
        "totalQuestions": int(row.get("total_questions") or len(details) or 0),
        "score": int(row.get("score") or 0),
        "correctCount": int(correct_count or 0),
        "incorrectCount": int(incorrect_count or 0),
        "percentage": float(row.get("percentage") or 0),
        "feedback": row.get("feedback") or "",
        "timeSpentSeconds": int(row.get("time_spent_seconds") or 0),
        "status": "completed",
        "createdAt": row.get("created_at").isoformat() if row.get("created_at") else None,
    }

    if include_details:
        serialized["details"] = details
        serialized["questions"] = safe_json_load(row.get("questions_json"), [])
        serialized["answers"] = safe_json_load(row.get("answers_json"), [])
        serialized["corrections"] = safe_json_load(row.get("corrections_json"), details)

    return serialized


def load_quiz_result_row(result_id):
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_results_table(cursor)
    cursor.execute("SELECT * FROM quiz_results WHERE id = %s", (result_id,))
    row = cursor.fetchone()
    cursor.close()
    db.close()
    return row


def saved_quiz_exercises(row):
    details = result_details_from_row(row)
    exercises = []

    for item in details:
        question = item.get("question", "")
        correct_answer = item.get("correctAnswer", "")

        if question and correct_answer:
            exercises.append({
                "question": question,
                "instructions": item.get("instructions", ""),
                "answer": correct_answer
            })

    return exercises


def public_saved_questions(row):
    exercises = saved_quiz_exercises(row)
    return [
        {
            "question": item.get("question", ""),
            "instructions": item.get("instructions", "")
        }
        for item in exercises
    ]


def normalize_answer(value):
    value = str(value or "").lower()
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def answer_is_correct(student_answer, correct_answer):
    student = normalize_answer(student_answer)
    correct = normalize_answer(correct_answer)

    if not student or not correct:
        return False

    if student == correct or student in correct or correct in student:
        return True

    correct_words = [word for word in correct.split(" ") if len(word) > 2]
    student_words = {word for word in student.split(" ") if len(word) > 2}

    if not correct_words:
        return False

    matched_words = len([word for word in correct_words if word in student_words])
    return matched_words / len(correct_words) >= 0.6


def build_feedback(percentage):
    if percentage >= 85:
        return "Excellent work. You show strong understanding and clear recall of the lesson."
    if percentage >= 60:
        return "Good progress. Review the corrections carefully and strengthen the concepts you missed."
    return "Keep practicing. Revisit the lesson, compare each correction, and retake the quiz when ready."


def language_name(code):
    return {
        "en": "English",
        "fr": "French",
        "ar": "Arabic",
    }.get(code, "English")


def localized_language_instruction(code):
    instructions = {
        "en": (
            "Answer ONLY in English. Translate and generate all educational content "
            "in English."
        ),
        "fr": (
            "Réponds UNIQUEMENT en français. Traduis et génère tout le contenu "
            "pédagogique en français, même si le PDF source est en anglais."
        ),
        "ar": (
            "أجب باللغة العربية فقط. ترجم وأنشئ كل المحتوى التعليمي باللغة العربية، "
            "حتى إذا كان ملف PDF الأصلي باللغة الإنجليزية."
        ),
    }
    return instructions.get(code, instructions["en"])


def technical_terms_instruction(code):
    if code == "fr":
        return (
            "Conserve les termes techniques nécessaires en anglais lorsqu'ils sont "
            "couramment utilisés en informatique, par exemple Java, class, object, "
            "inheritance, interface, public, static, String, int."
        )

    if code == "ar":
        return (
            "حافظ على المصطلحات التقنية عند الحاجة كما هي أو اكتبها بوضوح، مثل "
            "Java و class و object و inheritance و interface و public و static و String و int."
        )

    return (
        "Keep technical terms clear and understandable, for example Java, class, "
        "object, inheritance, interface, public, static, String, int."
    )


def localized_message(key, language):
    messages = {
        "non_educational": {
            "en": "I can only help with educational questions and lessons.",
            "fr": "Je peux uniquement aider avec des questions éducatives et des leçons.",
            "ar": "يمكنني المساعدة فقط في الأسئلة والدروس التعليمية.",
        },
        "image_unavailable": {
            "en": "Image analysis is not available yet.",
            "fr": "L'analyse d'image n'est pas encore disponible.",
            "ar": "تحليل الصور غير متاح حاليا.",
        },
        "upload_summary_unavailable": {
            "en": "The lesson was uploaded, but the summary could not be generated.",
            "fr": "Le cours a été importé, mais le résumé n'a pas pu être généré.",
            "ar": "تم رفع الدرس، لكن تعذر إنشاء الملخص.",
        },
    }
    return messages.get(key, {}).get(language, messages.get(key, {}).get("en", ""))


def extract_pdf_text(file_storage):
    reader = PdfReader(file_storage)
    text = ""

    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            text += extracted + "\n"

    return text.strip()


def is_educational_message(message, context=""):
    if context and len(context.strip()) > 30:
        return True

    text = str(message or "").lower()
    educational_keywords = [
        "lesson", "study", "explain", "summarize", "summary", "homework",
        "exercise", "question", "answer", "course", "class", "teacher",
        "student", "exam", "quiz", "definition", "concept", "example",
        "why", "how", "math", "science", "physics", "chemistry", "biology",
        "history", "language", "grammar", "java", "python", "programming",
        "database", "network", "algorithm", "code", "solve", "calculate",
        "learn", "education", "school", "university", "chapter", "pdf"
    ]
    return any(keyword in text for keyword in educational_keywords)


def summarize_context(context, language):
    if client is None:
        return localized_message("upload_summary_unavailable", language)

    output_language = language_name(language)
    prompt = f"""
Summarize this educational lesson for a student.

LANGUAGE REQUIREMENT:
- {localized_language_instruction(language)}
- Translate and generate all educational content in {output_language}.
- Do not copy raw source paragraphs.
- Keep technical terms understandable.

Return a short, clear summary in 4 to 6 bullet-style sentences.

Lesson text:
{context[:3500]}
"""
    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an educational assistant. Summarize lessons simply "
                    f"for students. {localized_language_instruction(language)}"
                )
            },
            {"role": "user", "content": prompt}
        ]
    )
    return completion.choices[0].message.content.strip()


def difficulty_rules(difficulty):
    rules = {
        "Easy": (
            "Easy / Facile: create very simple definition questions, direct recall "
            "questions, and short-answer questions that can be answered directly from one "
            "clear part of the PDF."
        ),
        "Medium": (
            "Medium / Moyen: create application questions that require examples, "
            "explain why/how reasoning, and connecting two ideas from the PDF."
        ),
        "Hard": (
            "Hard / Difficile: create deeper reasoning, problem-solving, analysis, "
            "comparison, advanced reasoning, and scenario-based questions, while still "
            "using only concepts present in the PDF."
        )
    }
    return rules.get(difficulty, rules["Easy"])


def validate_generated_exercises(exercises, category, source_text):
    if not exercises:
        return False, "AI did not return valid exercises. Please try again."

    combined_questions = " ".join(
        f"{item.get('question', '')} {item.get('instructions', '')} {item.get('answer', '')}"
        for item in exercises
    ).lower()
    source_lower = source_text.lower()

    math_terms = [
        "solve for x", "equation", "algebra", "geometry", "derivative",
        "integral", "triangle", "polynomial"
    ]
    programming_terms = [
        "java", "class", "object", "method", "constructor", "inheritance",
        "polymorphism", "encapsulation", "interface", "public", "private",
        "static", "void", "main", "string", "array", "exception", "oop"
    ]

    if category == "Programming":
        has_programming_context = any(term in combined_questions for term in programming_terms)
        has_math_question = any(term in combined_questions for term in math_terms)
        source_has_math = any(term in source_lower for term in math_terms)

        if has_math_question and not source_has_math:
            return False, "Generated questions did not match the detected Programming category."

        if not has_programming_context:
            return False, "Generated questions did not contain enough Programming context."

    return True, ""


def localized_feedback(percentage, language):
    if language == "fr":
        if percentage >= 85:
            return "Excellent travail. Vous montrez une très bonne compréhension de la leçon."
        if percentage >= 60:
            return "Bon progrès. Relisez les corrections et renforcez les concepts manqués."
        return "Continuez à pratiquer. Relisez la leçon, comparez chaque correction et réessayez."

    if language == "ar":
        if percentage >= 85:
            return "عمل ممتاز. لديك فهم قوي وواضح للدرس."
        if percentage >= 60:
            return "تقدم جيد. راجع التصحيحات بعناية وقو المفاهيم التي أخطأت فيها."
        return "واصل التدريب. راجع الدرس وقارن كل تصحيح ثم أعد المحاولة."

    return build_feedback(percentage)


def build_explanation(question, student_answer, correct_answer, is_correct, language="en"):
    if language == "fr":
        if is_correct:
            return "Votre réponse correspond à l'idée attendue. Vous pouvez l'améliorer avec un vocabulaire plus précis du cours."
        if not student_answer:
            return f"Aucune réponse n'a été fournie. Une bonne réponse devrait inclure : {correct_answer}"
        return (
            "Votre réponse ne correspond pas entièrement à la réponse attendue. "
            f"Pour cette question, concentrez-vous sur cette idée clé : {correct_answer}"
        )

    if language == "ar":
        if is_correct:
            return "إجابتك تطابق الفكرة المطلوبة. يمكنك تحسينها باستخدام مصطلحات أدق من الدرس."
        if not student_answer:
            return f"لم يتم تقديم إجابة. يجب أن تتضمن الإجابة الصحيحة: {correct_answer}"
        return (
            "إجابتك لا تطابق الإجابة المتوقعة بالكامل. "
            f"ركز في هذا السؤال على الفكرة الأساسية التالية: {correct_answer}"
        )

    if is_correct:
        return "Your answer matches the expected idea. You can improve it by adding precise lesson vocabulary."

    if not student_answer:
        return f"No answer was provided. A correct response should include: {correct_answer}"

    return (
        "Your answer does not fully match the expected response. "
        f"For this question, focus on this key idea: {correct_answer}"
    )


def pdf_text(value):
    return escape(str(value or ""))


def format_duration(seconds):
    seconds = int(seconds or 0)

    if seconds < 60:
        return f"{seconds}s"

    minutes = seconds // 60
    remaining_seconds = seconds % 60

    if minutes < 60:
        return f"{minutes}min {remaining_seconds}s" if remaining_seconds else f"{minutes}min"

    hours = minutes // 60
    remaining_minutes = minutes % 60
    return f"{hours}h {remaining_minutes:02d}min"


def correct_quiz_payload(data):
    exercises = data.get("exercises", [])
    answers = data.get("answers", [])
    language = data.get("language", "en")

    details = []
    for index, exercise in enumerate(exercises):
        student_answer = answers[index] if index < len(answers) else ""
        correct_answer = exercise.get("answer", "")
        is_correct = answer_is_correct(student_answer, correct_answer)
        details.append({
            "question": exercise.get("question", ""),
            "instructions": exercise.get("instructions", ""),
            "studentAnswer": student_answer,
            "correctAnswer": correct_answer,
            "isCorrect": is_correct,
            "explanation": build_explanation(
                exercise.get("question", ""),
                student_answer,
                correct_answer,
                is_correct,
                language
            )
        })

    score = len([item for item in details if item["isCorrect"]])
    total_questions = len(details)
    incorrect = total_questions - score
    percentage = round((score / total_questions) * 100, 2) if total_questions else 0
    feedback = localized_feedback(percentage, language)

    return {
        "score": score,
        "incorrect": incorrect,
        "totalQuestions": total_questions,
        "percentage": percentage,
        "timeSpentSeconds": int(data.get("timeSpentSeconds") or 0),
        "feedback": feedback,
        "details": details
    }


def persist_quiz_result(data, result):
    db = get_db()
    cursor = db.cursor()
    ensure_results_table(cursor)
    details = result.get("details", [])
    correct_count = len([item for item in details if item.get("isCorrect")])
    incorrect_count = len(details) - correct_count
    questions = [item.get("question", "") for item in details]
    answers = [item.get("studentAnswer", "") for item in details]
    cursor.execute(
        """
        INSERT INTO quiz_results (
            user_id,
            student_email,
            user_email,
            student_name,
            category,
            teacher_id,
            teacher_name,
            teacher_email,
            teacher_subject,
            difficulty,
            total_questions,
            score,
            correct_count,
            incorrect_count,
            percentage,
            time_spent_seconds,
            feedback,
            details,
            questions_json,
            answers_json,
            corrections_json
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            data.get("userId"),
            data.get("studentEmail"),
            data.get("studentEmail"),
            data.get("studentName"),
            data.get("category"),
            data.get("teacherId"),
            data.get("teacherName"),
            data.get("teacherEmail"),
            data.get("teacherSubject"),
            data.get("difficulty"),
            int(result.get("totalQuestions", 0)),
            int(result.get("score", 0)),
            correct_count,
            incorrect_count,
            float(result.get("percentage", 0)),
            int(data.get("timeSpentSeconds") or result.get("timeSpentSeconds") or 0),
            result.get("feedback", ""),
            json.dumps(details),
            json.dumps(questions),
            json.dumps(answers),
            json.dumps(details)
        )
    )
    db.commit()
    result_id = cursor.lastrowid
    cursor.close()
    db.close()
    return result_id


@app.route("/")
def home():
    return jsonify({"message": "AI Learning Platform Backend Running"})


@app.route("/dashboard-stats", methods=["GET"])
def dashboard_stats():
    user_id = request.args.get("userId")
    email = request.args.get("email")

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        ensure_results_table(cursor)

        where_clause = ""
        params = []

        if user_id:
            where_clause = "WHERE user_id = %s"
            params.append(user_id)
        elif email:
            where_clause = "WHERE student_email = %s OR user_email = %s"
            params.extend([email, email])

        cursor.execute(
            f"""
            SELECT
                COUNT(*) AS total_quizzes,
                COALESCE(AVG(percentage), 0) AS average_score,
                COALESCE(MAX(percentage), 0) AS best_score,
                COALESCE(SUM(time_spent_seconds), 0) AS total_time_spent
            FROM quiz_results
            {where_clause}
            """,
            tuple(params)
        )
        stats = cursor.fetchone() or {}
        cursor.close()
        db.close()
    except Error as e:
        return jsonify({"success": False, "message": f"Stats failed: {str(e)}"}), 500

    return jsonify({
        "success": True,
        "stats": {
            "totalQuizzes": int(stats.get("total_quizzes") or 0),
            "averageScore": round(float(stats.get("average_score") or 0), 2),
            "bestScore": round(float(stats.get("best_score") or 0), 2),
            "totalTimeSpent": int(stats.get("total_time_spent") or 0)
        }
    })


@app.route("/quiz-results", methods=["GET"])
def quiz_results():
    email = request.args.get("email")
    user_id = request.args.get("userId")
    teacher_id = request.args.get("teacherId")
    limit = request.args.get("limit")

    where_parts = []
    params = []

    if user_id:
        where_parts.append("user_id = %s")
        params.append(user_id)

    if email:
        where_parts.append("(student_email = %s OR user_email = %s)")
        params.extend([email, email])

    if teacher_id:
        where_parts.append("teacher_id = %s")
        params.append(teacher_id)

    where_clause = "WHERE " + " AND ".join(where_parts) if where_parts else ""
    limit_clause = ""

    if limit:
        try:
            limit_clause = f"LIMIT {max(1, min(int(limit), 50))}"
        except ValueError:
            limit_clause = ""

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        ensure_results_table(cursor)
        cursor.execute(
            f"""
            SELECT *
            FROM quiz_results
            {where_clause}
            ORDER BY created_at DESC, id DESC
            {limit_clause}
            """,
            tuple(params)
        )
        rows = cursor.fetchall()
        cursor.close()
        db.close()
    except Error as e:
        return jsonify({"success": False, "message": f"Results failed: {str(e)}"}), 500

    return jsonify({
        "success": True,
        "results": [serialize_quiz_result(row) for row in rows]
    })


@app.route("/quiz-result/<int:result_id>", methods=["GET"])
def quiz_result(result_id):
    try:
        row = load_quiz_result_row(result_id)
    except Error as e:
        return jsonify({"success": False, "message": f"Result failed: {str(e)}"}), 500

    if not row:
        return jsonify({"success": False, "message": "Quiz result not found"}), 404

    return jsonify({
        "success": True,
        "result": serialize_quiz_result(row, include_details=True)
    })


@app.route("/share-result", methods=["POST"])
def share_result():
    return jsonify({"success": True, "message": "Share summary prepared"})


@app.route("/shared-quiz/<int:result_id>", methods=["GET"])
def shared_quiz(result_id):
    try:
        row = load_quiz_result_row(result_id)
    except Error as e:
        return jsonify({"success": False, "message": f"Shared quiz failed: {str(e)}"}), 500

    if not row:
        return jsonify({"success": False, "message": "Shared quiz not found"}), 404

    questions = public_saved_questions(row)

    if not questions:
        return jsonify({"success": False, "message": "This quiz cannot be shared because no questions were saved"}), 404

    return jsonify({
        "success": True,
        "quiz": {
            "id": row.get("id"),
            "category": row.get("category") or "General",
            "difficulty": row.get("difficulty") or "Easy",
            "totalQuestions": len(questions),
            "questions": questions
        }
    })


@app.route("/submit-saved-quiz/<int:result_id>", methods=["POST"])
def submit_saved_quiz(result_id):
    data = request.get_json(silent=True) or {}

    try:
        row = load_quiz_result_row(result_id)
    except Error as e:
        return jsonify({"success": False, "message": f"Quiz submit failed: {str(e)}"}), 500

    if not row:
        return jsonify({"success": False, "message": "Quiz not found"}), 404

    exercises = saved_quiz_exercises(row)

    if not exercises:
        return jsonify({"success": False, "message": "No saved questions found for this quiz"}), 404

    correction_data = {
        "exercises": exercises,
        "answers": data.get("answers", []),
        "language": data.get("language", "en"),
        "timeSpentSeconds": data.get("timeSpentSeconds", 0),
    }
    result = correct_quiz_payload(correction_data)

    save_data = {
        "userId": data.get("userId"),
        "studentName": data.get("studentName"),
        "studentEmail": data.get("studentEmail"),
        "category": row.get("category"),
        "teacherId": row.get("teacher_id"),
        "teacherName": row.get("teacher_name"),
        "teacherEmail": row.get("teacher_email"),
        "teacherSubject": row.get("teacher_subject") or row.get("category"),
        "difficulty": row.get("difficulty"),
        "timeSpentSeconds": data.get("timeSpentSeconds", 0)
    }

    try:
        result_id_new = persist_quiz_result(save_data, result)
        result["saved"] = True
        result["resultId"] = result_id_new
    except Error as e:
        return jsonify({"success": False, "message": f"Quiz result save failed: {str(e)}"}), 500

    return jsonify({
        "success": True,
        "message": "Quiz submitted successfully",
        "result": result
    })


@app.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    name = data.get("name")
    email = data.get("email")
    password = data.get("password")
    level = data.get("level", "Student")

    if not name or not email or not password:
        return jsonify({"success": False, "message": "All fields are required"})

    existing_user = find_user_by_email(email)

    if existing_user:
        return jsonify({"success": False, "message": "Email already exists"})

    hashed_password = generate_password_hash(password)

    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute(
            "INSERT INTO users(name, email, password, level) VALUES(%s, %s, %s, %s)",
            (name, email, hashed_password, level)
        )
        db.commit()
        cursor.close()
        db.close()
    except Error as e:
        return jsonify({"success": False, "message": f"Registration failed: {str(e)}"}), 500

    return jsonify({"success": True, "message": "Account created successfully"})


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"success": False, "message": "Email and password are required"})

    user = find_user_by_email(email)

    if not user:
        return jsonify({"success": False, "message": "Invalid email or password"})

    stored_password = user.get("password")

    if password_matches(stored_password, password):
        if legacy_hash_matches(stored_password, password):
            upgrade_password_hash(user.get("id"), password)

        return jsonify({
            "success": True,
            "message": "Login successful",
            "user": {
                "id": user.get("id"),
                "name": user.get("name"),
                "email": user.get("email"),
                "level": user.get("level", "Student")
            }
        })

    return jsonify({"success": False, "message": "Invalid email or password"})


@app.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json(silent=True) or {}

    email = data.get("email")
    new_password = data.get("password") or data.get("newPassword")

    if not email or not new_password:
        return jsonify({"success": False, "message": "Email and new password are required"})

    user = find_user_by_email(email)

    if not user:
        return jsonify({"success": False, "message": "No account found for this email"})

    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute(
            "UPDATE users SET password = %s WHERE email = %s",
            (generate_password_hash(new_password), email)
        )
        db.commit()
        cursor.close()
        db.close()
    except Error as e:
        return jsonify({"success": False, "message": f"Password update failed: {str(e)}"}), 500

    return jsonify({"success": True, "message": "Password updated successfully"})


def detect_category(text):
    categories = {
        "Mathematics": [
            "algebra", "equation", "function", "geometry", "calculus", "calculation",
            "number", "integer", "fraction", "matrix", "derivative", "integral",
            "probability", "statistics", "theorem", "proof", "solve for x"
        ],
        "Programming": [
            "java", "class", "object", "method", "constructor", "inheritance",
            "polymorphism", "encapsulation", "interface", "package", "public",
            "private", "protected", "static", "void", "main", "string", "int",
            "loop", "array", "exception", "oop", "algorithm", "variable",
            "compiler", "program", "programming", "extends", "implements",
            "new object", "source code", "boolean", "double", "return"
        ],
        "Database": [
            "sql", "database", "table", "query", "primary key", "foreign key",
            "schema", "join", "index", "normalization", "transaction", "mysql"
        ],
        "Network": [
            "network", "ip", "router", "protocol", "tcp", "udp", "cisco",
            "packet", "switch", "subnet", "dns", "http", "firewall"
        ],
        "Operating Systems": [
            "linux", "process", "memory", "file system", "kernel", "thread",
            "scheduling", "deadlock", "semaphore", "operating system"
        ],
        "Web Development": [
            "html", "css", "javascript", "react", "flask", "web", "browser",
            "dom", "frontend", "backend", "api", "http request"
        ],
        "Physics": [
            "physics", "force", "motion", "velocity", "acceleration", "energy",
            "mass", "gravity", "newton", "electricity", "magnetism", "wave",
            "optics", "pressure", "momentum", "circuit"
        ],
        "English": [
            "english", "grammar", "vocabulary", "sentence", "verb", "noun",
            "adjective", "adverb", "literature", "writing", "pronunciation",
            "reading comprehension", "essay"
        ],
        "French": [
            "french", "français", "francais", "grammaire", "vocabulaire",
            "conjugaison", "phrase", "verbe", "nom", "adjectif",
            "prononciation", "littérature", "litterature"
        ],
        "History": [
            "history", "war", "empire", "civilization", "revolution", "century",
            "ancient", "medieval", "colonial", "independence"
        ],
        "Languages": [
            "grammar", "vocabulary", "sentence", "verb", "noun", "adjective",
            "translation", "pronunciation", "language", "literature", "writing"
        ],
        "General": []
    }

    lower_text = text.lower()
    scores = {}

    for category, keywords in categories.items():
        score = 0
        for keyword in keywords:
            pattern = r"\b" + re.escape(keyword.lower()) + r"\b"
            matches = re.findall(pattern, lower_text)
            weight = 3 if category == "Programming" and keyword.lower() in {
                "java", "class", "object", "method", "constructor", "inheritance",
                "polymorphism", "encapsulation", "interface", "public", "private",
                "static", "void", "main", "string", "oop"
            } else 1
            score += len(matches) * weight
        scores[category] = score

    best_category = max(scores, key=scores.get)

    if scores.get("Programming", 0) > scores.get("Mathematics", 0):
        best_category = "Programming"

    return best_category if scores.get(best_category, 0) > 0 else "General"


@app.route("/chatbot", methods=["POST"])
def chatbot():
    data = request.get_json(silent=True) or {}
    message = str(data.get("message") or "").strip()
    language = data.get("language", "en")
    context = str(data.get("context") or "").strip()

    if not message:
        return jsonify({"success": False, "message": "Message is required"}), 400

    if not is_educational_message(message, context):
        return jsonify({
            "success": True,
            "answer": localized_message("non_educational", language)
        })

    if client is None:
        return jsonify({"success": False, "message": "GROQ_API_KEY is not configured"}), 500

    output_language = language_name(language)
    context_block = context[:4500] if context else "No uploaded lesson context was provided."
    prompt = f"""
Student question:
{message}

Uploaded lesson context, if any:
{context_block}

Instructions:
- Answer only educational or study-related questions.
- If the question is not educational, reply exactly with: {localized_message("non_educational", language)}
- {localized_language_instruction(language)}
- Translate and generate the full answer in the selected application language: {output_language}.
- Keep the explanation simple, clear, and helpful for a student.
- If lesson context is provided, prioritize it and do not invent facts outside it.
- Do not answer with raw copied PDF paragraphs; explain the ideas.
- {technical_terms_instruction(language)}
"""

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an Educational AI Assistant for students. "
                    "You only answer educational and lesson-related questions. "
                    f"{localized_language_instruction(language)}"
                )
            },
            {"role": "user", "content": prompt}
        ]
    )

    return jsonify({
        "success": True,
        "answer": completion.choices[0].message.content.strip()
    })


@app.route("/chatbot-upload", methods=["POST"])
def chatbot_upload():
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file uploaded"}), 400

    file = request.files["file"]
    language = request.form.get("language", "en")
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()

    try:
        if filename.endswith(".pdf") or "pdf" in content_type:
            context = extract_pdf_text(file)

            if not context:
                return jsonify({"success": False, "message": "No text found in PDF"}), 400

            return jsonify({
                "success": True,
                "context": context[:9000],
                "summary": summarize_context(context, language)
            })

        if content_type.startswith("image/") or filename.endswith((".png", ".jpg", ".jpeg", ".webp")):
            if Image is None or pytesseract is None:
                return jsonify({
                    "success": False,
                    "message": localized_message("image_unavailable", language)
                }), 200

            try:
                image = Image.open(file.stream)
                context = pytesseract.image_to_string(image).strip()
            except Exception:
                return jsonify({
                    "success": False,
                    "message": localized_message("image_unavailable", language)
                }), 200

            if not context:
                return jsonify({
                    "success": False,
                    "message": localized_message("image_unavailable", language)
                }), 200

            return jsonify({
                "success": True,
                "context": context[:9000],
                "summary": summarize_context(context, language)
            })

        return jsonify({"success": False, "message": "Unsupported file type"}), 400
    except Exception as e:
        print("CHATBOT UPLOAD ERROR:", str(e))
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/generate-exercises", methods=["POST"])
def generate_exercises():
    if client is None:
        return jsonify({"success": False, "message": "GROQ_API_KEY is not configured"})

    if "file" not in request.files:
        return jsonify({"success": False, "message": "No PDF uploaded"})

    file = request.files["file"]

    num_questions = request.form.get("numQuestions", "3")
    difficulty = request.form.get("difficulty", "Easy")
    language = request.form.get("language", "en")
    output_language = language_name(language)
    language_instruction = localized_language_instruction(language)
    terms_instruction = technical_terms_instruction(language)

    try:
        num_questions = max(1, min(int(num_questions), 10))
    except ValueError:
        num_questions = 3

    if difficulty not in ["Easy", "Medium", "Hard"]:
        difficulty = "Easy"
    selected_difficulty_rules = difficulty_rules(difficulty)

    try:
        text = extract_pdf_text(file)

        if not text.strip():
            return jsonify({"success": False, "message": "No text found in PDF"})

        short_text = text[:3000]
        category = detect_category(short_text)

        prompt = f"""
You are an AI educational assistant.

The student uploaded a lesson PDF.

Detected category: {category}
Difficulty level: {difficulty}
Number of exercises: {num_questions}
Output language: {output_language}

Generate a lesson study package based ONLY on the lesson content.

LANGUAGE REQUIREMENT:
- {language_instruction}
- Translate and generate all educational content in the selected application language: {output_language}.
- The source PDF may be in another language. Do NOT copy source-language paragraphs into the output.
- Do NOT return raw PDF excerpts.
- The fields summary, keyConcepts, importantNotes, question, instructions, and answer MUST be in {output_language}.
- {terms_instruction}

Rules:
- Generate questions ONLY from the uploaded PDF content.
- Respect this difficulty rule exactly: {selected_difficulty_rules}
- All generated exercises must match the detected category: {category}.
- Do not generate Mathematics questions unless the detected category is Mathematics.
- If the detected category is Programming, generate Programming questions only.
- If the PDF is about Java/programming, do not ask algebra, equation-solving, geometry, or unrelated math questions.
- Do not use unrelated examples, facts, scenarios, APIs, or topics that are not present in the PDF.
- Every answer must be supported by the uploaded PDF content.
- Return ONLY valid JSON.
- The response must be a JSON object with exactly these keys:
  summary: string
  keyConcepts: array of strings
  importantNotes: array of strings
  exercises: array of exactly {num_questions} objects
- Each exercise object must have exactly these string keys: question, instructions, answer.
- Do not wrap the JSON in markdown.

Lesson content:
{short_text}
"""

        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You create localized educational quiz content. "
                        f"{language_instruction} Never answer in the PDF source language "
                        f"unless it is the selected application language."
                    )
                },
                {"role": "user", "content": prompt}
            ]
        )

        ai_response = completion.choices[0].message.content

        generated_content = parse_generation_response(ai_response)
        exercises = generated_content["exercises"]
        localized_summary = generated_content["summary"].strip()

        if not exercises:
            return jsonify({
                "success": False,
                "message": "AI did not return valid exercises. Please try again."
            }), 502

        is_valid, validation_message = validate_generated_exercises(exercises, category, short_text)

        if not is_valid:
            return jsonify({
                "success": False,
                "message": validation_message
            }), 502

        if not localized_summary:
            localized_summary = {
                "en": "The lesson summary could not be generated. Please regenerate the quiz.",
                "fr": "Le résumé du cours n'a pas pu être généré. Veuillez régénérer le quiz.",
                "ar": "تعذر إنشاء ملخص الدرس. يرجى إعادة إنشاء الاختبار.",
            }.get(language, "The lesson summary could not be generated. Please regenerate the quiz.")

        return jsonify({
            "success": True,
            "preview": localized_summary,
            "summary": localized_summary,
            "keyConcepts": generated_content["keyConcepts"],
            "importantNotes": generated_content["importantNotes"],
            "category": category,
            "difficulty": difficulty,
            "language": language,
            "numQuestions": num_questions,
            "exercises": exercises
        })

    except Exception as e:
        print("AI ERROR:", str(e))
        return jsonify({
            "success": False,
            "message": "AI generation failed: " + str(e)
        })


@app.route("/save-result", methods=["POST"])
def save_result():
    data = request.get_json(silent=True) or {}

    total_questions = data.get("totalQuestions")
    score = data.get("score")
    percentage = data.get("percentage")
    details = data.get("details", [])

    if total_questions is None or score is None or percentage is None:
        return jsonify({"success": False, "message": "Result score data is required"}), 400

    result = {
        "totalQuestions": total_questions,
        "score": score,
        "percentage": percentage,
        "timeSpentSeconds": int(data.get("timeSpentSeconds") or 0),
        "feedback": data.get("feedback", ""),
        "details": details
    }

    try:
        result_id = persist_quiz_result(data, result)
    except Error as e:
        return jsonify({"success": False, "message": f"Result save failed: {str(e)}"}), 500

    return jsonify({
        "success": True,
        "message": "Result saved successfully",
        "resultId": result_id
    })


@app.route("/correct-quiz", methods=["POST"])
def correct_quiz():
    data = request.get_json(silent=True) or {}

    if not isinstance(data.get("exercises"), list):
        return jsonify({"success": False, "message": "Exercises are required"}), 400

    result = correct_quiz_payload(data)

    try:
        result_id = persist_quiz_result(data, result)
        result["saved"] = True
        result["resultId"] = result_id
    except Error as e:
        return jsonify({"success": False, "message": f"Correction save failed: {str(e)}"}), 500

    return jsonify({
        "success": True,
        "message": "Quiz corrected successfully",
        "result": result
    })


@app.route("/download-correction-pdf", methods=["POST"])
def download_correction_pdf():
    data = request.get_json(silent=True) or {}
    result = data.get("result", {})
    details = result.get("details", [])
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    duration = format_duration(result.get("timeSpentSeconds") or data.get("timeSpentSeconds") or 0)
    score = int(result.get("score", 0) or 0)
    total_questions = int(result.get("totalQuestions", 0) or 0)
    percentage = float(result.get("percentage", 0) or 0)
    correct_count = int(result.get("correctCount", score) or score)
    incorrect_count = int(result.get("incorrectCount", max(0, total_questions - score)) or 0)

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="QuizTitle",
        parent=styles["Title"],
        textColor=colors.HexColor("#0f172a"),
        fontSize=23,
        leading=28,
        spaceAfter=4
    ))
    styles.add(ParagraphStyle(
        name="BrandLine",
        parent=styles["BodyText"],
        textColor=colors.HexColor("#2563eb"),
        fontSize=10,
        leading=13,
        alignment=1
    ))
    styles.add(ParagraphStyle(
        name="SectionTitle",
        parent=styles["Heading2"],
        textColor=colors.HexColor("#0f172a"),
        fontSize=13,
        leading=16,
        spaceBefore=8,
        spaceAfter=7
    ))
    styles.add(ParagraphStyle(
        name="SmallText",
        parent=styles["BodyText"],
        fontSize=9,
        leading=12
    ))
    styles.add(ParagraphStyle(
        name="FeedbackText",
        parent=styles["BodyText"],
        fontSize=10,
        leading=14,
        leftIndent=8,
        rightIndent=8,
        spaceAfter=8
    ))

    def section_table(rows, col_widths=None):
        table = Table(rows, colWidths=col_widths or [1.65 * inch, 4.95 * inch])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eff6ff")),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#0f172a")),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#bfdbfe")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 8),
        ]))
        return table

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#64748b"))
        canvas.drawString(0.55 * inch, 0.32 * inch, f"Learnix AI / Generated {generated_at}")
        canvas.drawRightString(letter[0] - 0.55 * inch, 0.32 * inch, f"Page {doc.page}")
        canvas.restoreState()

    story = [
        Paragraph("Learnix AI Assessment Report", styles["QuizTitle"]),
        Paragraph("Professional AI-powered learning assessment and correction report", styles["BrandLine"]),
        Spacer(1, 16)
    ]

    student_rows = [
        ["Student", Paragraph(pdf_text(data.get("studentName") or "Student"), styles["SmallText"])],
        ["Email", Paragraph(pdf_text(data.get("studentEmail") or "Not provided"), styles["SmallText"])],
        ["Category", Paragraph(pdf_text(data.get("category") or "General"), styles["SmallText"])],
        ["Difficulty", Paragraph(pdf_text(data.get("difficulty") or "Easy"), styles["SmallText"])],
    ]
    story.extend([
        Paragraph("Student Information", styles["SectionTitle"]),
        section_table(student_rows),
        Spacer(1, 12),
        Paragraph("Duration", styles["SectionTitle"]),
        section_table([["Time spent", Paragraph(pdf_text(duration), styles["SmallText"])]]),
        Spacer(1, 12),
    ])

    score_rows = [
        ["Score", Paragraph(pdf_text(f"{score} / {total_questions}"), styles["SmallText"])],
        ["Percentage", Paragraph(pdf_text(f"{percentage:.2f}%"), styles["SmallText"])],
        ["Correct answers", Paragraph(pdf_text(correct_count), styles["SmallText"])],
        ["Needs review", Paragraph(pdf_text(incorrect_count), styles["SmallText"])],
    ]
    story.extend([
        Paragraph("Professional Score Summary", styles["SectionTitle"]),
        section_table(score_rows),
        Spacer(1, 12),
        Paragraph("AI Feedback", styles["SectionTitle"]),
        Paragraph(pdf_text(result.get("feedback", "")) or "No feedback provided.", styles["FeedbackText"]),
        Spacer(1, 12),
    ])

    for index, item in enumerate(details, start=1):
        status = "Correct" if item.get("isCorrect") else "Incorrect"
        story.append(Paragraph(f"Question {index} - {status}", styles["Heading3"]))
        story.append(Paragraph(f"<b>Question:</b> {pdf_text(item.get('question', ''))}", styles["SmallText"]))
        story.append(Paragraph(f"<b>Student answer:</b> {pdf_text(item.get('studentAnswer') or 'No answer provided')}", styles["SmallText"]))
        story.append(Paragraph(f"<b>Correct answer:</b> {pdf_text(item.get('correctAnswer', ''))}", styles["SmallText"]))
        story.append(Paragraph(f"<b>AI feedback:</b> {pdf_text(item.get('explanation', ''))}", styles["SmallText"]))
        story.append(Spacer(1, 10))

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    buffer.seek(0)

    return send_file(
        buffer,
        as_attachment=True,
        download_name="correction-report.pdf",
        mimetype="application/pdf"
    )


def parse_generation_response(ai_response):
    try:
        parsed = json.loads(ai_response)
    except json.JSONDecodeError:
        object_match = re.search(r"\{.*\}", ai_response, re.DOTALL)
        array_match = re.search(r"\[.*\]", ai_response, re.DOTALL)
        try:
            parsed = json.loads(object_match.group(0)) if object_match else json.loads(array_match.group(0))
        except (AttributeError, TypeError, json.JSONDecodeError):
            parsed = []

    if isinstance(parsed, dict):
        exercises = parse_exercises(json.dumps(parsed.get("exercises", [])))
        key_concepts = parsed.get("keyConcepts", [])
        important_notes = parsed.get("importantNotes", [])

        return {
            "summary": str(parsed.get("summary", "")).strip(),
            "keyConcepts": [str(item).strip() for item in key_concepts if str(item).strip()],
            "importantNotes": [str(item).strip() for item in important_notes if str(item).strip()],
            "exercises": exercises
        }

    return {
        "summary": "",
        "keyConcepts": [],
        "importantNotes": [],
        "exercises": parse_exercises(json.dumps(parsed))
    }


def parse_exercises(ai_response):
    try:
        parsed = json.loads(ai_response)
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", ai_response, re.DOTALL)
        if not match:
            return []
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            return []

    if not isinstance(parsed, list):
        return []

    exercises = []
    for item in parsed:
        if not isinstance(item, dict):
            continue

        question = str(item.get("question", "")).strip()
        instructions = str(item.get("instructions", "")).strip()
        answer = str(item.get("answer", "")).strip()

        if question and answer:
            exercises.append({
                "question": question,
                "instructions": instructions or "Answer using the lesson content.",
                "answer": answer
            })

    return exercises


if __name__ == "__main__":
    app.run(debug=True)
