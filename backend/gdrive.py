"""Google Drive uploader -> credentials built from .env -> uploads XLSX to a fixed folder."""
import os
import time
from pathlib import Path

import io
import threading

import httplib2
from google_auth_httplib2 import AuthorizedHttp

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload, MediaIoBaseUpload

load_dotenv()

FOLDER_ID = os.getenv("GDRIVE_FOLDER_ID", "")
CLIENT_ID = os.getenv("GDRIVE_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("GDRIVE_CLIENT_SECRET", "")
REFRESH_TOKEN = os.getenv("GDRIVE_REFRESH_TOKEN", "")
SCOPES = ["https://www.googleapis.com/auth/drive.file"]
TOKEN_URI = "https://oauth2.googleapis.com/token"

# googleapiclient/httplib2 objects are not thread-safe: one client per thread.
_local = threading.local()
HTTP_TIMEOUT = 120


def _reset():
    _local.service = None


def _drive():
    svc = getattr(_local, "service", None)
    if svc is not None:
        return svc
    if not (CLIENT_ID and CLIENT_SECRET and REFRESH_TOKEN):
        raise RuntimeError("GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET / GDRIVE_REFRESH_TOKEN missing in .env")
    creds = Credentials(
        token=None,
        refresh_token=REFRESH_TOKEN,
        token_uri=TOKEN_URI,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        scopes=SCOPES,
    )
    creds.refresh(Request())
    http = AuthorizedHttp(creds, http=httplib2.Http(timeout=HTTP_TIMEOUT))
    _local.service = build("drive", "v3", http=http, cache_discovery=False)
    return _local.service


def _escape_query(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def _find_existing(drive, name: str) -> str | None:
    """Return the file id of an existing same-named file in the folder, or None."""
    q = (
        f"name = '{_escape_query(name)}' "
        f"and '{FOLDER_ID}' in parents and trashed = false"
    )
    res = drive.files().list(
        q=q,
        spaces="drive",
        fields="files(id, name)",
        pageSize=1,
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()
    files = res.get("files", [])
    return files[0]["id"] if files else None


def upload_xlsx(local_path: str, drive_name: str | None = None, attempts: int = 4) -> dict:
    """Upload, overwriting any existing file with the same name (one file per artist)."""
    if not FOLDER_ID:
        raise RuntimeError("GDRIVE_FOLDER_ID is not set in .env")
    src = Path(local_path)
    if not src.exists():
        raise FileNotFoundError(local_path)
    name = drive_name or src.name

    last_err = None
    for attempt in range(attempts):
        try:
            drive = _drive()
            media = MediaFileUpload(
                str(src),
                mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                resumable=True,
                chunksize=1024 * 1024,
            )
            existing_id = _find_existing(drive, name)
            if existing_id:
                # Update the existing file in place -> no duplicate.
                request = drive.files().update(
                    fileId=existing_id,
                    media_body=media,
                    fields="id, name, webViewLink, webContentLink",
                    supportsAllDrives=True,
                )
            else:
                request = drive.files().create(
                    body={"name": name, "parents": [FOLDER_ID]},
                    media_body=media,
                    fields="id, name, webViewLink, webContentLink",
                    supportsAllDrives=True,
                )
            response = None
            while response is None:
                _, response = request.next_chunk()
            return response
        except Exception as e:
            last_err = e
            _reset()  # force a fresh client (new auth/connection) on retry
            if attempt < attempts - 1:
                wait = 2 ** attempt
                print(f"[GDrive] upload error ({e}) — retry {attempt + 1}/{attempts} in {wait}s")
                time.sleep(wait)
    raise RuntimeError(f"Drive upload failed after {attempts} attempts: {last_err}")


def download_bytes(file_id: str) -> bytes:
    """Stream a Drive file's content into memory and return raw bytes."""
    drive = _drive()
    request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    buf.seek(0)
    return buf.read()


# ── Generic helpers (Song Merge projects: folders, small files, app properties) ──
_folder_cache = {}
FOLDER_MIME = "application/vnd.google-apps.folder"


def _retry(fn, attempts=4):
    last_err = None
    for attempt in range(attempts):
        try:
            return fn(_drive())
        except Exception as e:
            last_err = e
            _reset()
            if attempt < attempts - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Drive request failed after {attempts} attempts: {last_err}")


def ensure_folder(name: str, parent_id: str | None = None) -> str:
    """Return the id of folder `name` under `parent_id` (default: GDRIVE_FOLDER_ID), creating it once."""
    parent_id = parent_id or FOLDER_ID
    if not parent_id:
        raise RuntimeError("GDRIVE_FOLDER_ID is not set in .env")
    key = (parent_id, name)
    if key in _folder_cache:
        return _folder_cache[key]

    def run(drive):
        q = (f"name = '{_escape_query(name)}' and '{parent_id}' in parents "
             f"and mimeType = '{FOLDER_MIME}' and trashed = false")
        found = drive.files().list(q=q, fields="files(id)", pageSize=1, spaces="drive",
                                   supportsAllDrives=True, includeItemsFromAllDrives=True).execute().get("files", [])
        if found:
            return found[0]["id"]
        return drive.files().create(body={"name": name, "mimeType": FOLDER_MIME, "parents": [parent_id]},
                                    fields="id", supportsAllDrives=True).execute()["id"]

    _folder_cache[key] = _retry(run)
    return _folder_cache[key]


def put_bytes(data: bytes, name: str, mimetype: str, parent_id: str | None = None,
              file_id: str | None = None, app_properties: dict | None = None) -> dict:
    """Create a file (or replace the content of `file_id`) from bytes."""
    def run(drive):
        media = MediaIoBaseUpload(io.BytesIO(data), mimetype=mimetype, resumable=False)
        fields = "id, name, webViewLink, parents, appProperties, modifiedTime"
        if file_id:
            body = {"name": name}
            if app_properties is not None:
                body["appProperties"] = app_properties
            return drive.files().update(fileId=file_id, body=body, media_body=media,
                                        fields=fields, supportsAllDrives=True).execute()
        body = {"name": name, "parents": [parent_id or FOLDER_ID]}
        if app_properties:
            body["appProperties"] = app_properties
        return drive.files().create(body=body, media_body=media, fields=fields,
                                    supportsAllDrives=True).execute()
    return _retry(run)


def get_meta(file_id: str) -> dict:
    return _retry(lambda drive: drive.files().get(
        fileId=file_id, fields="id, name, parents, appProperties, modifiedTime, webViewLink, trashed",
        supportsAllDrives=True).execute())


def find_by_property(key: str, value: str) -> list:
    """All non-trashed files carrying appProperties[key] == value, newest first."""
    def run(drive):
        out, token = [], None
        q = f"appProperties has {{ key='{_escape_query(key)}' and value='{_escape_query(value)}' }} and trashed = false"
        while True:
            res = drive.files().list(q=q, spaces="drive", pageSize=200, pageToken=token,
                                     orderBy="modifiedTime desc",
                                     fields="nextPageToken, files(id, name, parents, appProperties, modifiedTime, webViewLink)",
                                     supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
            out += res.get("files", [])
            token = res.get("nextPageToken")
            if not token:
                return out
    return _retry(run)


def trash(file_id: str) -> None:
    _retry(lambda drive: drive.files().update(fileId=file_id, body={"trashed": True},
                                              supportsAllDrives=True).execute())


if __name__ == "__main__":
    print(f"[GDrive] folder: {FOLDER_ID or '<unset>'}")
    _drive()
    print("[GDrive] credentials OK")
