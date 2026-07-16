import uuid
from pathlib import Path

from flask import Blueprint, g, jsonify, request, send_file
from PIL import Image, UnidentifiedImageError
from werkzeug.utils import secure_filename

from .database import ensure_users_security_columns, get_db
from .security import require_auth


avatars_bp = Blueprint("avatars", __name__, url_prefix="/api")

AVATAR_DIR = Path(__file__).resolve().parents[1] / "uploads" / "avatars"
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}
MAX_AVATAR_BYTES = 5 * 1024 * 1024
AVATAR_SIZE = 256


def _avatar_url(filename):
    return f"/api/avatars/{filename}"


def _filename_from_url(url):
    value = str(url or "")
    if not value.startswith("/api/avatars/"):
        return ""
    return secure_filename(value.rsplit("/", 1)[-1])


def _delete_avatar_file(url):
    filename = _filename_from_url(url)
    if not filename:
        return
    path = (AVATAR_DIR / filename).resolve()
    if AVATAR_DIR.resolve() in path.parents and path.exists():
        path.unlink(missing_ok=True)


def _extension(filename):
    return secure_filename(filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""


@avatars_bp.get("/avatars/<path:filename>")
def view_avatar(filename):
    safe_name = secure_filename(filename)
    path = (AVATAR_DIR / safe_name).resolve()
    if AVATAR_DIR.resolve() not in path.parents or not path.exists():
        return jsonify({"success": False, "message": "Image introuvable"}), 404
    return send_file(path, mimetype="image/webp", max_age=3600)


@avatars_bp.post("/me/avatar")
@require_auth
def upload_avatar():
    file = request.files.get("avatar") or request.files.get("file")
    if not file:
        return jsonify({"success": False, "message": "Aucune image reçue."}), 400
    ext = _extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"success": False, "message": "Format non pris en charge. Utilisez JPG, PNG ou WEBP."}), 400
    if file.mimetype not in ALLOWED_MIMES:
        return jsonify({"success": False, "message": "Type d'image non autorisé."}), 400

    data = file.read()
    if len(data) > MAX_AVATAR_BYTES:
        return jsonify({"success": False, "message": "L'image ne doit pas dépasser 5 Mo."}), 400
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"user-{g.current_user.get('id')}-{uuid.uuid4().hex}.webp"
    path = AVATAR_DIR / filename
    try:
        from io import BytesIO
        with Image.open(BytesIO(data)) as image:
            image = image.convert("RGB")
            width, height = image.size
            side = min(width, height)
            left = (width - side) // 2
            top = (height - side) // 2
            image = image.crop((left, top, left + side, top + side))
            image = image.resize((AVATAR_SIZE, AVATAR_SIZE), Image.Resampling.LANCZOS)
            image.save(path, "WEBP", quality=86, method=6)
    except (UnidentifiedImageError, OSError, ValueError):
        return jsonify({"success": False, "message": "Impossible de traiter cette image."}), 400

    avatar_url = _avatar_url(filename)
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_users_security_columns(cursor)
    cursor.execute("SELECT avatar_url FROM users WHERE id = %s", (g.current_user.get("id"),))
    old = cursor.fetchone() or {}
    cursor.execute("UPDATE users SET avatar_url = %s WHERE id = %s", (avatar_url, g.current_user.get("id")))
    db.commit()
    cursor.close()
    db.close()
    _delete_avatar_file(old.get("avatar_url"))
    return jsonify({"success": True, "message": "Photo de profil enregistrée.", "avatar_url": avatar_url})


@avatars_bp.delete("/me/avatar")
@require_auth
def delete_avatar():
    db = get_db()
    cursor = db.cursor(dictionary=True)
    ensure_users_security_columns(cursor)
    cursor.execute("SELECT avatar_url FROM users WHERE id = %s", (g.current_user.get("id"),))
    old = cursor.fetchone() or {}
    cursor.execute("UPDATE users SET avatar_url = NULL WHERE id = %s", (g.current_user.get("id"),))
    db.commit()
    cursor.close()
    db.close()
    _delete_avatar_file(old.get("avatar_url"))
    return jsonify({"success": True, "message": "Photo de profil supprimée.", "avatar_url": None})
