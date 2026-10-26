"""Song Merge projects, saved in Google Drive so work survives refreshes and restarts.

Drive layout (inside GDRIVE_FOLDER_ID):
    Song Merge/
        <Client name>/
            <upload>.xlsx                the uploaded file
            <upload> - review.json       the project: decisions, manual types + metadata
            <upload>_merged.xlsx         the latest merged download

The review file carries appProperties (client, counts, ...) so every project is
listed with a single Drive query. Its file id is the project id.
"""
import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

import gdrive
import song_merge

ROOT_FOLDER = "Song Merge"
KIND = "mrm_merge_project"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_locks = {}
_locks_guard = threading.Lock()


class ProjectError(ValueError):
    pass


def _lock(pid):
    with _locks_guard:
        return _locks.setdefault(pid, threading.Lock())


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _clip(v, n=90):
    # appProperties: key + value must fit in 124 bytes
    b = str(v or "").encode("utf-8")[:n]
    return b.decode("utf-8", "ignore")


def _counts(decisions):
    c = {"accepted": 0, "rejected": 0}
    for d in (decisions or {}).values():
        if d.get("status") in c:
            c[d["status"]] += 1
    return c


def _props(state):
    c = _counts(state["decisions"])
    return {
        "kind": KIND,
        "client": _clip(state["client"]),
        "file": _clip(state["file_name"]),
        "sheet": _clip(state["sheet"], 60),
        "owner": _clip(state["owner"], 80),
        "created": state["created_at"],
        "total": str(state.get("suggestions", 0) + state.get("conflicts", 0)),
        "rows": str(state.get("rows", 0)),
        "songs": str(state.get("records", 0)),
        "accepted": str(c["accepted"]),
        "rejected": str(c["rejected"]),
    }


def _clean_client(name):
    name = re.sub(r"\s+", " ", str(name or "")).strip()
    name = re.sub(r"[\\/:*?\"<>|]", "-", name)
    if not name:
        raise ProjectError("Enter a client name.")
    return name[:80]


def _write_state(pid, state):
    state["updated_at"] = _now()
    gdrive.put_bytes(json.dumps(state, ensure_ascii=False).encode("utf-8"),
                     state["review_name"], "application/json",
                     file_id=pid, app_properties=_props(state))


def _project_info(pid, state, folder_id):
    c = _counts(state["decisions"])
    return {
        "id": pid,
        "client": state["client"],
        "file_name": state["file_name"],
        "sheet": state["sheet"],
        "owner": state["owner"],
        "created_at": state["created_at"],
        "updated_at": state.get("updated_at"),
        "folder_link": f"https://drive.google.com/drive/folders/{folder_id}" if folder_id else "",
        "merged_link": state.get("merged_link", ""),
        **c,
    }


# ── Public API ───────────────────────────────────────────────────────────────

def create(data, file_name, client, owner, sheet=None):
    client = _clean_client(client)
    result = song_merge.analyze(data, file_name, owner, sheet, match_names=[client])  # validates before touching Drive
    temp_sid = result["session_id"]
    try:
        folder = gdrive.ensure_folder(client, gdrive.ensure_folder(ROOT_FOLDER))
        stem = Path(file_name).stem
        original = gdrive.put_bytes(data, file_name, XLSX, parent_id=folder)
        state = {
            "client": client, "file_name": file_name, "sheet": result["sheet"], "owner": owner,
            "created_at": _now(), "original_id": original["id"], "merged_id": "", "merged_link": "",
            "review_name": f"{stem} - review.json", "decisions": {}, "match_names": [client],
            "suggestions": result["stats"]["suggestions"], "rows": result["stats"]["rows"],
            "records": result["stats"]["records"], "conflicts": result["stats"]["isrc_conflicts"],
        }
        rec = gdrive.put_bytes(json.dumps(state).encode("utf-8"), state["review_name"],
                               "application/json", parent_id=folder, app_properties=_props(state))
    except Exception as e:
        song_merge.SESSIONS.pop(temp_sid, None)
        raise ProjectError(f"Could not save to Google Drive: {e}")
    pid = rec["id"]
    song_merge.rename_session(temp_sid, pid)
    song_merge.SESSIONS[pid].update(state=state, folder_id=folder)
    return {**song_merge.payload(pid), "project": _project_info(pid, state, folder), "decisions": {},
            "manual": song_merge.effective_manual(song_merge.SESSIONS[pid], {})}


def _load_state(pid):
    try:
        meta = gdrive.get_meta(pid)
    except Exception:
        raise ProjectError("This merge project was not found in Google Drive.")
    if meta.get("trashed") or (meta.get("appProperties") or {}).get("kind") != KIND:
        raise ProjectError("This merge project was not found in Google Drive.")
    state = json.loads(gdrive.download_bytes(pid).decode("utf-8"))
    return state, (meta.get("parents") or [""])[0]


def session(pid, sheet=None):
    """In-memory session for a project, rebuilt from Drive when needed."""
    sess = song_merge.get_session(pid)
    if sess and "state" in sess and (not sheet or sheet == sess["sheet"]):
        return sess
    state, folder = (sess["state"], sess["folder_id"]) if sess and "state" in sess else _load_state(pid)
    data = gdrive.download_bytes(state["original_id"])
    want = sheet or state["sheet"]
    result = song_merge.analyze(data, state["file_name"], state["owner"], want, sid=pid,
                                match_names=state.get("match_names") or [state["client"]])
    if result["sheet"] != state["sheet"]:  # sheet switched -> earlier decisions no longer apply
        state.update(sheet=result["sheet"], decisions={}, manual={}, suggestions=result["stats"]["suggestions"],
                     rows=result["stats"]["rows"], records=result["stats"]["records"])
        with _lock(pid):
            _write_state(pid, state)
    st = result["stats"]
    state.update(suggestions=st["suggestions"], conflicts=st["isrc_conflicts"],
                 rows=st["rows"], records=st["records"])
    sess = song_merge.SESSIONS[pid]
    sess.update(state=state, folder_id=folder)
    return sess


def open_project(pid, sheet=None):
    sess = session(pid, sheet)
    state = sess["state"]
    return {**song_merge.payload(pid), "project": _project_info(pid, state, sess["folder_id"]),
            "decisions": state["decisions"],
            "manual": song_merge.effective_manual(sess, state.get("manual"))}


def save_decisions(pid, decisions, manual=None):
    """manual: {record id: {type, cover}} - Manual Type and Covers / Remix Song name.
    None leaves the saved values as they are."""
    sess = session(pid)
    state = sess["state"]
    if manual is not None:
        state["manual"] = song_merge.clean_manual(sess, manual)
    valid = song_merge.review_items(sess)
    state["decisions"] = {
        gid: {"status": d.get("status"), "records": [int(r) for r in (d.get("records") or [])]}
        for gid, d in (decisions or {}).items()
        if gid in valid and d.get("status") in ("accepted", "rejected")
    }
    with _lock(pid):
        _write_state(pid, state)
    return {"saved_at": state["updated_at"], **_counts(state["decisions"])}


def compare(pid, rids):
    session(pid)
    return song_merge.compare(pid, rids)


def set_match_names(pid, names):
    """Names that count as the client being credited (e.g. 'Laxmikant–Pyarelal, Laxmikant Kudalkar')."""
    sess = session(pid)
    result = song_merge.set_match_names(pid, names)
    sess["state"]["match_names"] = result["match_names"]
    with _lock(pid):
        _write_state(pid, sess["state"])
    return result


def download(pid, decisions, manual=None):
    """Build the merged Excel, store it in the client's folder, return (bytes, file name)."""
    sess = session(pid)
    state = sess["state"]
    if manual is not None:
        manual = song_merge.clean_manual(sess, manual)
    data = song_merge.build_workbook(sess, decisions or {},
                                     state.get("manual") if manual is None else manual)
    name = f"{Path(state['file_name']).stem}_merged.xlsx"

    def store():
        try:
            save_decisions(pid, decisions, manual)
            with _lock(pid):
                f = gdrive.put_bytes(data, name, XLSX, parent_id=sess["folder_id"],
                                     file_id=state.get("merged_id") or None)
                state["merged_id"], state["merged_link"] = f["id"], f.get("webViewLink", "")
                _write_state(pid, state)
        except Exception as e:
            print(f"[SongMerge] saving merged Excel to Drive failed: {e}")

    threading.Thread(target=store, daemon=True).start()
    return data, name


def list_projects():
    out = []
    for f in gdrive.find_by_property("kind", KIND):
        p = f.get("appProperties") or {}
        folder = (f.get("parents") or [""])[0]
        out.append({
            "id": f["id"],
            "client": p.get("client", ""),
            "file_name": p.get("file", ""),
            "sheet": p.get("sheet", ""),
            "owner": p.get("owner", ""),
            "created_at": p.get("created", ""),
            "updated_at": f.get("modifiedTime", ""),
            "rows": int(p.get("rows") or 0),
            "songs": int(p.get("songs") or 0),
            "total": int(p.get("total") or 0),
            "accepted": int(p.get("accepted") or 0),
            "rejected": int(p.get("rejected") or 0),
            "folder_link": f"https://drive.google.com/drive/folders/{folder}" if folder else "",
        })
    return out


def owner_of(pid):
    try:
        props = gdrive.get_meta(pid).get("appProperties") or {}
    except Exception:
        props = {}
    if props.get("kind") != KIND:
        raise ProjectError("This merge project was not found in Google Drive.")
    return props.get("owner", "")


def delete(pid):
    state, _ = _load_state(pid)
    for fid in (state.get("merged_id"), state.get("original_id"), pid):
        if fid:
            try:
                gdrive.trash(fid)
            except Exception as e:
                print(f"[SongMerge] trash {fid} failed: {e}")
    song_merge.SESSIONS.pop(pid, None)
