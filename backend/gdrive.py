"""Google Drive uploader -> credentials built from .env -> uploads XLSX to a fixed folder."""
import os
import time
from pathlib import Path

import io

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

load_dotenv()

FOLDER_ID = os.getenv("GDRIVE_FOLDER_ID", "")
CLIENT_ID = os.getenv("GDRIVE_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("GDRIVE_CLIENT_SECRET", "")
REFRESH_TOKEN = os.getenv("GDRIVE_REFRESH_TOKEN", "")
SCOPES = ["https://www.googleapis.com/auth/drive.file"]
TOKEN_URI = "https://oauth2.googleapis.com/token"

_service = None


def _drive():
    global _service
    if _service is not None:
        return _service
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
    _service = build("drive", "v3", credentials=creds, cache_discovery=False)
    return _service


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
    global _service
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
            _service = None  # force a fresh client (new auth/connection) on retry
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


if __name__ == "__main__":
    print(f"[GDrive] folder: {FOLDER_ID or '<unset>'}")
    _drive()
    print("[GDrive] credentials OK")
