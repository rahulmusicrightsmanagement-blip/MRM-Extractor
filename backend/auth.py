"""MongoDB auth -> JWT + bcrypt + role-based access."""
import hashlib
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

import jwt
import bcrypt
from dotenv import load_dotenv
from pymongo import MongoClient
from fastapi import HTTPException, Header

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "")
MONGO_DB = os.getenv("MONGO_DB", "mrm_extractor")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
JWT_ALGO = "HS256"
JWT_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days
RESET_TTL_SECONDS = 60 * 30  # password reset link valid for 30 minutes

SUPER_ADMIN_EMAIL = os.getenv("SUPER_ADMIN_EMAIL", "").strip().lower()
SUPER_ADMIN_PASSWORD = os.getenv("SUPER_ADMIN_PASSWORD", "")

_client = None
_db = None


def db():
    global _client, _db
    if _db is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
        _db = _client[MONGO_DB]
    return _db


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def seed_super_admin():
    if not SUPER_ADMIN_EMAIL or not SUPER_ADMIN_PASSWORD:
        return
    users = db()["users"]
    users.create_index("email", unique=True)
    db()["downloads"].create_index([("at", -1)])
    db()["downloads"].create_index("email")
    # Password-reset tokens auto-expire via a MongoDB TTL index on expires_at.
    resets = db()["password_resets"]
    resets.create_index("expires_at", expireAfterSeconds=0)
    resets.create_index("token_hash")
    existing = users.find_one({"email": SUPER_ADMIN_EMAIL})
    if existing:
        if existing.get("role") != "admin":
            users.update_one({"_id": existing["_id"]}, {"$set": {"role": "admin"}})
        return
    users.insert_one({
        "email": SUPER_ADMIN_EMAIL,
        "password": hash_password(SUPER_ADMIN_PASSWORD),
        "role": "admin",
        "created_at": datetime.now(timezone.utc),
    })


def make_token(user) -> str:
    payload = {
        "sub": str(user["_id"]),
        "email": user["email"],
        "role": user["role"],
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_TTL_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        return None


def current_user(authorization: str = Header(default="")):
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Invalid or expired token")
    return payload


def require_admin(authorization: str = Header(default="")):
    user = current_user(authorization)
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return user


# ── PASSWORD RESET ──
def _hash_token(token: str) -> str:
    # Store only the hash, never the raw token, in the DB.
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_reset_token(email: str) -> str:
    """Issue a one-time reset token for `email`. Returns the raw token (emailed,
    never stored). Invalidates any previous outstanding tokens for that email."""
    email = email.lower().strip()
    raw = secrets.token_urlsafe(32)
    resets = db()["password_resets"]
    resets.delete_many({"email": email})
    resets.insert_one({
        "email": email,
        "token_hash": _hash_token(raw),
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(seconds=RESET_TTL_SECONDS),
    })
    return raw


def consume_reset_token(token: str) -> str:
    """Validate + burn a reset token. Returns the email on success, else raises."""
    if not token:
        raise HTTPException(400, "Invalid or expired reset link")
    resets = db()["password_resets"]
    rec = resets.find_one({"token_hash": _hash_token(token)})
    if not rec:
        raise HTTPException(400, "Invalid or expired reset link")
    exp = rec.get("expires_at")
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp is None or exp < datetime.now(timezone.utc):
        resets.delete_one({"_id": rec["_id"]})
        raise HTTPException(400, "Invalid or expired reset link")
    resets.delete_one({"_id": rec["_id"]})  # one-time use
    return rec["email"]


def set_password(email: str, new_password: str):
    users = db()["users"]
    res = users.update_one(
        {"email": email.lower().strip()},
        {"$set": {"password": hash_password(new_password)}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
