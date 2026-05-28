"""Google Drive uploader -> credentials built from .env -> uploads XLSX to a fixed folder."""
import os
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


def upload_xlsx(local_path: str, drive_name: str | None = None) -> dict:
    if not FOLDER_ID:
        raise RuntimeError("GDRIVE_FOLDER_ID is not set in .env")
    src = Path(local_path)
    if not src.exists():
        raise FileNotFoundError(local_path)
    name = drive_name or src.name
    drive = _drive()
    body = {"name": name, "parents": [FOLDER_ID]}
    media = MediaFileUpload(
        str(src),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        resumable=False,
    )
    f = drive.files().create(
        body=body,
        media_body=media,
        fields="id, name, webViewLink, webContentLink",
        supportsAllDrives=True,
    ).execute()
    return f


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
