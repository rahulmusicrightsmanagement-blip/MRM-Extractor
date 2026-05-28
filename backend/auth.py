"""MongoDB auth -> JWT + bcrypt + role-based access."""
import os
import time
from datetime import datetime, timezone

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
