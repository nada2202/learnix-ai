import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import current_app, g, jsonify, request
from werkzeug.security import generate_password_hash

from .config import normalize_role
from .database import ensure_users_security_columns, get_db


def _b64url_encode(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value):
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def create_access_token(user, expires_in=None):
    now = datetime.now(timezone.utc)
    exp = now + (expires_in or current_app.config["JWT_EXPIRES_IN"])
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(user.get("id")),
        "email": user.get("email"),
        "name": user.get("name"),
        "role": normalize_role(user.get("role") or user.get("level")),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    secret = current_app.config["JWT_SECRET"].encode("utf-8")
    signing_input = ".".join([
        _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8")),
        _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
    ])
    signature = hmac.new(secret, signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def decode_access_token(token):
    try:
        header_part, payload_part, signature_part = token.split(".")
        signing_input = f"{header_part}.{payload_part}"
        secret = current_app.config["JWT_SECRET"].encode("utf-8")
        expected = _b64url_encode(
            hmac.new(secret, signing_input.encode("ascii"), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(expected, signature_part):
            return None
        payload = json.loads(_b64url_decode(payload_part))
        if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def current_token_user():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    payload = decode_access_token(auth_header.removeprefix("Bearer ").strip())
    if not payload:
        return None
    return {
        "id": payload.get("sub"),
        "email": payload.get("email"),
        "name": payload.get("name"),
        "role": normalize_role(payload.get("role")),
    }


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_token_user()
        if not user:
            return jsonify({"success": False, "message": "Authentication required"}), 401
        db = get_db()
        cursor = db.cursor(dictionary=True)
        ensure_users_security_columns(cursor)
        cursor.execute(
            "SELECT id, name, email, role, level, status, avatar_url FROM users WHERE id = %s",
            (user.get("id"),),
        )
        db_user = cursor.fetchone()
        cursor.execute("UPDATE users SET last_seen = NOW() WHERE id = %s", (user.get("id"),))
        db.commit()
        cursor.close()
        db.close()
        if not db_user:
            return jsonify({"success": False, "message": "Authentication required"}), 401
        if str(db_user.get("status") or "active").lower() == "disabled":
            return jsonify({"success": False, "message": "Account is disabled"}), 403
        user = {
            "id": db_user.get("id"),
            "email": db_user.get("email"),
            "name": db_user.get("name"),
            "role": normalize_role(db_user.get("role") or db_user.get("level")),
            "avatar_url": db_user.get("avatar_url"),
        }
        g.current_user = user
        return view(*args, **kwargs)

    return wrapped


def require_roles(*roles):
    normalized_roles = {normalize_role(role) for role in roles}

    def decorator(view):
        @wraps(view)
        @require_auth
        def wrapped(*args, **kwargs):
            if g.current_user.get("role") not in normalized_roles:
                return jsonify({"success": False, "message": "Forbidden"}), 403
            return view(*args, **kwargs)

        return wrapped

    return decorator


def issue_password_reset_token(email):
    token = secrets.token_urlsafe(32)
    token_hash = generate_password_hash(token)
    expires = datetime.utcnow() + timedelta(
        minutes=current_app.config["RESET_TOKEN_EXPIRES_MINUTES"]
    )
    db = get_db()
    cursor = db.cursor()
    ensure_users_security_columns(cursor)
    cursor.execute(
        """
        UPDATE users
        SET reset_token_hash = %s, reset_token_expires_at = %s
        WHERE email = %s
        """,
        (token_hash, expires, email),
    )
    db.commit()
    cursor.close()
    db.close()
    return token, expires
