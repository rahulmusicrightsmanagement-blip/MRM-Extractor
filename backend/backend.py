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
    consume_reset_token,
    create_reset_token,
    current_user,
    db,
    decode_token,
    hash_password,
    make_token,
    require_admin,
    seed_super_admin,
    set_password,
    verify_password,
)

ROOT = Path(__file__).parent

app = FastAPI()

# Comma-separated list of allowed frontend origins. Falls back to "*" for local dev.
_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()] or ["*"]

# Base URL of the frontend, used to build password-reset links in emails.
# Hardcoded to the production domain (NOT read from env) so reset links always
# point at the deployed app, regardless of any local FRONTEND_URL value.
FRONTEND_URL = "https://extractor.musicrightsmanagement.in"
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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

# Cap simultaneous extractions to avoid hammering the Apple/Spotify APIs (429s)
# when many users run at once. Extra jobs wait their turn, then run normally.
# Hardcoded (NOT read from env) so the cap is exactly 3 regardless of any
# MAX_CONCURRENT_JOBS value set in the deployment environment.
MAX_CONCURRENT_JOBS = 3
_job_slots = threading.BoundedSemaphore(MAX_CONCURRENT_JOBS)

# Safety net: never let a wedged/very-long job hold its slot forever, or the
# queue would block all other users indefinitely. After this many seconds the
# slot is force-released so waiting jobs can proceed.
JOB_MAX_SECONDS = 15 * 60


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


class ForgotReq(BaseModel):
    email: EmailStr


class ResetReq(BaseModel):
    token: str
    password: str


def slugify(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_") or "Output"


def split_ids(text: str):
    if not text:
        return []
    return [x.strip() for x in re.split(r"[\s,;\n]+", text) if x.strip()]


# ── Per-job stdout routing (concurrency-safe) ──
# Each worker thread registers its own queue; prints made on that thread go to
# that job's queue only. The real stdout stays shared. No global sys.stdout
# hijacking -> multiple users can run jobs at once without crossing logs.
_thread_q = threading.local()


def set_thread_queue(q):
    """Route the calling thread's stdout to queue `q` (None to stop)."""
    _thread_q.q = q


def get_thread_queue():
    """Current thread's job queue, or None. Used by worker pools to inherit it."""
    return getattr(_thread_q, "q", None)


class JobStreamRouter(io.TextIOBase):
    """Installed once as sys.stdout. Routes writes to the calling thread's
    registered queue (if any); otherwise passes through to the real stdout."""

    def __init__(self, original):
        self.original = original
        self._bufs = {}  # thread_id -> partial-line buffer

    def write(self, s):
        try:
            self.original.write(s)
            self.original.flush()
        except Exception:
            pass
        q = get_thread_queue()
        if q is None:
            return len(s)
        tid = threading.get_ident()
        buf = self._bufs.get(tid, "") + s
        while True:
            idx_n = buf.find("\n")
            idx_r = buf.find("\r")
            cuts = [i for i in (idx_n, idx_r) if i >= 0]
            if not cuts:
                break
            cut = min(cuts)
            line = buf[:cut].strip()
            buf = buf[cut + 1:]
            if line:
                q.put({"type": "log", "msg": line})
        self._bufs[tid] = buf
        return len(s)

    def flush(self):
        try:
            self.original.flush()
        except Exception:
            pass


# Install the router exactly once, at import time.
if not isinstance(sys.stdout, JobStreamRouter):
    sys.stdout = JobStreamRouter(sys.stdout)


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

    set_thread_queue(q)  # route this thread's prints to this job's queue

    # Release the slot exactly once — whether by normal finish, crash, or the
    # watchdog timeout. A double-release on a BoundedSemaphore would raise.
    _release_lock = threading.Lock()
    _released = {"done": False}

    def _release_slot():
        with _release_lock:
            if not _released["done"]:
                _released["done"] = True
                _job_slots.release()

    watchdog = None
    slot_acquired = False
    try:
        # Wait for a free slot if too many extractions are already running.
        if not _job_slots.acquire(blocking=False):
            info["status"] = "queued"
            print("[STAGE] Waiting in queue (server busy with other extractions)...")
            _job_slots.acquire()
        slot_acquired = True
        # Watchdog: force-release the slot after JOB_MAX_SECONDS so a wedged or
        # very long job can never block the queue for everyone else.
        watchdog = threading.Timer(JOB_MAX_SECONDS, _release_slot)
        watchdog.daemon = True
        watchdog.start()
        info["status"] = "running"
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

        # Upload to Drive (with internal retries). Drive is the primary store.
        print("[STAGE] Uploading to Google Drive...")
        uploaded = False
        try:
            res = gdrive.upload_xlsx(str(final_path), drive_name=file_name)
            info["drive_id"] = res.get("id", "")
            info["drive_link"] = res.get("webViewLink", "")
            uploaded = True
            print(f"[STAGE] Saved to Google Drive -> {info['drive_link']}")
        except Exception as e:
            print(f"[GDrive] upload failed after retries: {e}")
            info["drive_id"] = ""
            info["drive_link"] = ""

        # Record history NOW (on completion) -> always matches Drive, even if never downloaded.
        try:
            db()["downloads"].insert_one({
                "email": info.get("owner", ""),
                "file": file_name,
                "job_id": job_id,
                "artist": artist,
                "apple_ids": req.apple_ids.strip(),
                "spotify_ids": req.spotify_ids.strip(),
                "drive_link": info.get("drive_link", ""),
                "drive_id": info.get("drive_id", ""),
                "songs": merged_count,
                "at": datetime.now(timezone.utc),
            })
        except Exception as e:
            print(f"[History] insert failed: {e}")

        info["status"] = "done"
        q.put({"type": "done", "file": file_name, "job_id": job_id, "merged_count": merged_count, "drive_link": info.get("drive_link", "")})
    except Exception as e:
        uploaded = False
        info["status"] = "error"
        q.put({"type": "error", "msg": str(e)})
    finally:
        if watchdog is not None:
            watchdog.cancel()
        if slot_acquired:
            _release_slot()
        set_thread_queue(None)  # stop routing this thread's prints
        # Only delete local copy if it's safely in Drive.
        # If the upload failed, KEEP the file on disk so the download still works.
        if uploaded:
            try:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass
        else:
            info["local_path"] = str(final_path)
            print("[STAGE] Kept local copy as fallback (Drive upload failed).")
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


@app.post("/api/auth/forgot")
def forgot_password(req: ForgotReq):
    # Always return ok (don't reveal whether the email exists). Only send a
    # mail if the user actually exists.
    email = req.email.lower().strip()
    user = db()["users"].find_one({"email": email})
    if user:
        try:
            raw = create_reset_token(email)
            reset_url = f"{FRONTEND_URL}/?reset={raw}"
            email_digest.send_password_reset(email, reset_url)
        except Exception as e:
            print(f"[Reset] send failed for {email}: {e}")
            raise HTTPException(500, "Could not send reset email. Please try again later.")
    return {"ok": True}


@app.post("/api/auth/reset")
def reset_password(req: ResetReq):
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    email = consume_reset_token(req.token.strip())
    set_password(email, req.password)
    return {"ok": True}


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
    if not info:
        raise HTTPException(404, "Unknown job")

    drive_id = info.get("drive_id", "")
    drive_link = info.get("drive_link", "")
    file_name = info.get("file_name", f"SongExtraction_{job_id[:8]}.xlsx")
    local_path = info.get("local_path", "")

    data = None
    if drive_id:
        try:
            data = gdrive.download_bytes(drive_id)
        except Exception as e:
            print(f"[GDrive] fetch failed, trying local fallback: {e}")
    if data is None and local_path and Path(local_path).exists():
        # Drive upload had failed -> serve the kept local copy.
        data = Path(local_path).read_bytes()
    if data is None:
        raise HTTPException(404, "File not available (Drive upload failed and no local copy)")

    # History is recorded at extraction time (see run_job), not here.
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
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
