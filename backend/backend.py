"""FastAPI backend -> auth + /api/extract (SSE) + /api/download + admin user mgmt"""
import asyncio
import io
import json
import os
import queue
import re
import shutil
import sys
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, EmailStr

import song_extractor
import merge_isrc
import gdrive
import email_digest
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from auth import (
    current_user,
    db,
    decode_token,
    hash_password,
    make_token,
    require_admin,
    seed_super_admin,
    verify_password,
)

ROOT = Path(__file__).parent

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


_scheduler = None


@app.on_event("startup")
def _startup():
    try:
        seed_super_admin()
        print("[Auth] super-admin seeded / verified")
    except Exception as e:
        print(f"[Auth] seed failed: {e}")
    global _scheduler
    try:
        _scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
        _scheduler.add_job(
            _safe_weekly_digest,
            CronTrigger(day_of_week="sat", hour=9, minute=0, timezone="Asia/Kolkata"),
            id="weekly_digest",
            replace_existing=True,
        )
        _scheduler.start()
        print("[Scheduler] weekly digest scheduled -> Sat 09:00 IST")
    except Exception as e:
        print(f"[Scheduler] start failed: {e}")


def _safe_weekly_digest():
    try:
        res = email_digest.send_weekly_digest()
        print(f"[Scheduler] digest sent -> {res}")
    except Exception as e:
        print(f"[Scheduler] digest failed: {e}")


JOBS = {}


class ExtractReq(BaseModel):
    artist_name: str = ""
    apple_ids: str = ""
    spotify_ids: str = ""


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class CreateUserReq(BaseModel):
    email: EmailStr
    password: str
    role: str = "user"


def slugify(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_") or "Output"


def split_ids(text: str):
    if not text:
        return []
    return [x.strip() for x in re.split(r"[\s,;\n]+", text) if x.strip()]


class StreamCapture(io.TextIOBase):
    def __init__(self, original, q):
        self.original = original
        self.q = q
        self.buf = ""

    def write(self, s):
        try:
            self.original.write(s)
            self.original.flush()
        except Exception:
            pass
        self.buf += s
        while True:
            idx_n = self.buf.find("\n")
            idx_r = self.buf.find("\r")
            cuts = [i for i in (idx_n, idx_r) if i >= 0]
            if not cuts:
                break
            cut = min(cuts)
            line = self.buf[:cut].strip()
            self.buf = self.buf[cut + 1:]
            if line:
                self.q.put({"type": "log", "msg": line})
        return len(s)

    def flush(self):
        try:
            self.original.flush()
        except Exception:
            pass


def run_job(job_id: str, req: ExtractReq):
    info = JOBS[job_id]
    q = info["q"]
    artist = req.artist_name.strip()
    apple = split_ids(req.apple_ids)
    spotify = split_ids(req.spotify_ids)
    out_name = slugify(artist) if artist else f"job_{job_id[:8]}"
    file_name = f"SongExtraction_{out_name}.xlsx"

    tmp_dir = Path(tempfile.mkdtemp(prefix="mrm_"))
    raw_path = tmp_dir / f"{out_name}_raw.xlsx"
    final_path = tmp_dir / file_name

    orig_stdout = sys.stdout
    capture = StreamCapture(orig_stdout, q)
    sys.stdout = capture
    try:
        print("[STAGE] Pipeline starting...")
        song_extractor.run_extraction(
            artist_name=artist or "Unknown",
            apple_ids=apple,
            spotify_ids=spotify,
            output_path=str(raw_path),
        )
        print("[STAGE] Building final Excel file (styling 4 sheets)...")
        merge_res = merge_isrc.run_merge(src_path=str(raw_path), out_path=str(final_path))
        merged_count = merge_res.get("merged_count", 0) if isinstance(merge_res, dict) else 0
        print(f"[STAGE] Excel ready ({merged_count} merged songs)")

        info["file_name"] = file_name
        info["merged_count"] = merged_count

        # Upload to Drive immediately -> Drive is the single source of truth.
        print("[STAGE] Uploading to Google Drive...")
        try:
            res = gdrive.upload_xlsx(str(final_path), drive_name=file_name)
            info["drive_id"] = res.get("id", "")
            info["drive_link"] = res.get("webViewLink", "")
            print(f"[STAGE] Saved to Google Drive -> {info['drive_link']}")
        except Exception as e:
            print(f"[GDrive] upload failed: {e}")
            info["drive_id"] = ""
            info["drive_link"] = ""

        info["status"] = "done"
        q.put({"type": "done", "file": file_name, "job_id": job_id, "merged_count": merged_count, "drive_link": info.get("drive_link", "")})
    except Exception as e:
        info["status"] = "error"
        q.put({"type": "error", "msg": str(e)})
    finally:
        sys.stdout = orig_stdout
        # Wipe all local artifacts -> nothing persists on disk.
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass
        q.put(None)


# ── AUTH ROUTES ──
@app.post("/api/auth/login")
def login(req: LoginReq):
    users = db()["users"]
    u = users.find_one({"email": req.email.lower().strip()})
    if not u:
        raise HTTPException(403, "You are not a part of this organisation. Please ask the admin to provide you access.")
    if not verify_password(req.password, u["password"]):
        raise HTTPException(401, "Incorrect password. Please try again.")
    token = make_token(u)
    return {
        "token": token,
        "user": {"email": u["email"], "role": u["role"]},
    }


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return {"email": user["email"], "role": user["role"]}


# ── ADMIN: USER MGMT ──
@app.get("/api/admin/users")
def list_users(admin=Depends(require_admin)):
    users = db()["users"]
    out = []
    for u in users.find({}, {"password": 0}).sort("created_at", 1):
        ca = u.get("created_at")
        if ca is not None and ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)
        out.append({
            "id": str(u["_id"]),
            "email": u["email"],
            "role": u["role"],
            "created_at": ca.isoformat() if ca else None,
        })
    return out


@app.post("/api/admin/users")
def create_user(req: CreateUserReq, admin=Depends(require_admin)):
    if req.role not in ("admin", "user"):
        raise HTTPException(400, "Role must be 'admin' or 'user'")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    users = db()["users"]
    email = req.email.lower().strip()
    if users.find_one({"email": email}):
        raise HTTPException(409, "User already exists")
    users.insert_one({
        "email": email,
        "password": hash_password(req.password),
        "role": req.role,
        "created_at": datetime.now(timezone.utc),
    })
    return {"ok": True}


@app.delete("/api/admin/users/{user_id}")
def delete_user(user_id: str, admin=Depends(require_admin)):
    users = db()["users"]
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(400, "Bad id")
    target = users.find_one({"_id": oid})
    if not target:
        raise HTTPException(404, "User not found")
    if target["email"] == admin["email"]:
        raise HTTPException(400, "Cannot delete yourself")
    users.delete_one({"_id": oid})
    return {"ok": True}


# ── EXTRACT (auth required) ──
@app.post("/api/extract")
def start_extract(req: ExtractReq, user=Depends(current_user)):
    if not req.artist_name and not req.apple_ids and not req.spotify_ids:
        raise HTTPException(400, "Provide artist name or IDs")
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {
        "q": queue.Queue(),
        "status": "running",
        "owner": user["email"],
        "artist": req.artist_name.strip(),
        "apple_ids": req.apple_ids.strip(),
        "spotify_ids": req.spotify_ids.strip(),
    }
    t = threading.Thread(target=run_job, args=(job_id, req), daemon=True)
    JOBS[job_id]["thread"] = t
    t.start()
    return {"job_id": job_id}


def _q_get(q: queue.Queue, timeout: float):
    try:
        return q.get(True, timeout)
    except queue.Empty:
        return _SENTINEL_EMPTY


_SENTINEL_EMPTY = object()


@app.get("/api/stream/{job_id}")
async def stream(job_id: str, token: str = Query(default="")):
    payload = decode_token(token) if token else None
    if not payload:
        raise HTTPException(401, "Missing token")
    info = JOBS.get(job_id)
    if not info:
        raise HTTPException(404, "Unknown job")
    q: queue.Queue = info["q"]

    async def gen():
        loop = asyncio.get_event_loop()
        try:
            while True:
                msg = await loop.run_in_executor(None, _q_get, q, 15)
                if msg is _SENTINEL_EMPTY:
                    yield ": keepalive\n\n"
                    continue
                if msg is None:
                    break
                yield f"data: {json.dumps(msg)}\n\n"
        except (asyncio.CancelledError, ConnectionResetError, GeneratorExit):
            return

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/api/download/{job_id}")
def download(job_id: str, token: str = Query(default="")):
    payload = decode_token(token) if token else None
    if not payload:
        raise HTTPException(401, "Missing token")
    info = JOBS.get(job_id)
    if not info or not info.get("drive_id"):
        raise HTTPException(404, "File not ready (Drive upload missing)")

    drive_id = info.get("drive_id", "")
    drive_link = info.get("drive_link", "")
    file_name = info.get("file_name", f"SongExtraction_{job_id[:8]}.xlsx")

    try:
        data = gdrive.download_bytes(drive_id)
    except Exception as e:
        print(f"[GDrive] fetch failed: {e}")
        raise HTTPException(502, "Could not fetch file from Google Drive")

    # Log the download once (avoid double-logging on repeat clicks of same job).
    if not info.get("logged"):
        info["logged"] = True
        try:
            db()["downloads"].insert_one({
                "email": payload.get("email"),
                "file": file_name,
                "job_id": job_id,
                "artist": info.get("artist", ""),
                "apple_ids": info.get("apple_ids", ""),
                "spotify_ids": info.get("spotify_ids", ""),
                "drive_link": drive_link,
                "drive_id": drive_id,
                "songs": info.get("merged_count", 0),
                "at": datetime.now(timezone.utc),
            })
        except Exception as e:
            print(f"[History] insert failed: {e}")

    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


@app.get("/api/history")
def history(user=Depends(current_user), limit: int = 200):
    coll = db()["downloads"]
    out = []
    for d in coll.find({}).sort("at", -1).limit(limit):
        at = d.get("at")
        if at is not None and at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        out.append({
            "id": str(d["_id"]),
            "email": d.get("email"),
            "artist": d.get("artist", ""),
            "apple_ids": d.get("apple_ids", ""),
            "spotify_ids": d.get("spotify_ids", ""),
            "drive_link": d.get("drive_link", ""),
            "songs": d.get("songs", 0),
            "at": at.isoformat() if at else None,
        })
    return out


@app.get("/")
def root():
    return {"name": "MRM Extractor API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
