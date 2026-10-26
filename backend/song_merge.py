"""Song Merge: upload an Excel of songs -> merge by ISRC -> suggest work-level merges.

Music logic
  * An ISRC identifies one sound recording. Rows sharing an ISRC are the same
    recording and are always merged.
  * A musical work (ISWC level) is defined by its writers. A remix, cover, lofi
    or live version of a song keeps the same work - same lyricist(s)/author(s)
    and composer(s) - while singers/performers may change.
  * If the writer credits differ at all (a remixer added as composer, a different
    lyricist, a missing credit) the version may be a new/derivative work, so it is
    never suggested. Only exact writer matches (ignoring case, punctuation and
    order) with a similar title become a merge suggestion for a human to accept.
"""
import difflib
import io
import re
import threading
import time
import uuid
from collections import Counter, OrderedDict, defaultdict

import openpyxl
import xlsxwriter

from merge_muso import (
    DSU,
    FUZZY_RATIO,
    clean_title,
    is_placeholder,
    isrc_tokens,
    merge_column,
    name_key,
    split_names,
    title_key,
    version_type,
)

TITLE = "Name of the Song / Title"
ALBUM = "Name of the Album"
SINGER = "Singer"
DATE = "Song Release Date"
WRITER_COLS = ("Lyricist", "Author", "Composer")
TYPE = "Type"
MANUAL_TYPE = "Manual Type"
COVER_OF = "Covers / Remix Song name"
TYPE_COLS = (TYPE, MANUAL_TYPE, COVER_OF)  # written by this tool, after the sheet's own columns
# Dropdown choices for Manual Type (Excel list items must not contain commas)
MANUAL_TYPES = ["Original", "Re-release", "Remix", "Lofi", "Jhankar", "Slowed / Reverb", "Reprise",
                "Unplugged / Acoustic", "Live", "Instrumental", "Cover", "Recreated", "Medley / Mashup",
                "Male / Female Version", "Sad / Happy Version", "Other"]

# Uploaded sheets may use other header names; map them onto the app's own
HEADER_ALIASES = {
    TITLE: ["name of the song / title", "name of the song", "song title", "title", "song",
            "song name", "track", "track name", "track title"],
    "ISRC": ["isrc", "isrc code", "isrcs"],
    ALBUM: ["name of the album", "album", "album name", "release title"],
    SINGER: ["singer", "singers", "vocalist", "vocals", "performer", "performers"],
    "Lyricist": ["lyricist", "lyricists", "lyrics", "lyrics by", "lyricist(s)"],
    "Author": ["author", "authors", "author(s)"],
    "Composer": ["composer", "composers", "composer(s)", "music", "music by", "music director"],
    DATE: ["song release date", "release date", "date", "released"],
    TYPE: ["type", "version type", "song type"],
    MANUAL_TYPE: ["manual type"],
    COVER_OF: ["covers / remix song name", "cover / remix song name", "covers/remix song name",
               "cover of", "remix of"],
}
_ALIAS_LOOKUP = {a: canon for canon, aliases in HEADER_ALIASES.items() for a in aliases}
# Sheets this tool writes; never treated as input when a merged file is re-uploaded
OUTPUT_SHEETS = {"Summary", "Merged Songs", "Merge Suggestions", "All Rows",
                 "Merged by Song", "Song Versions", "Merged by ISRC"}

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
SESSION_TTL = 3 * 60 * 60
SESSIONS = {}
_lock = threading.Lock()


class MergeError(ValueError):
    pass


# ── Parsing ──────────────────────────────────────────────────────────────────

def _canon_header(h):
    if h is None:
        return None
    s = re.sub(r"\s+", " ", str(h)).strip()
    return _ALIAS_LOOKUP.get(s.lower(), s)


def _sheet_headers(ws):
    first = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), None) or ()
    return [_canon_header(h) for h in first]


def candidate_sheets(wb):
    out = []
    for name in wb.sheetnames:
        if name in OUTPUT_SHEETS:
            continue
        hdrs = _sheet_headers(wb[name])
        if TITLE in hdrs and "ISRC" in hdrs:
            out.append(name)
    return out


def parse_workbook(data, sheet=None):
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception:
        raise MergeError("Could not read the file. Upload an Excel .xlsx file.")
    sheets = candidate_sheets(wb)
    if not sheets:
        raise MergeError("No sheet has both a song title column and an ISRC column.")
    if sheet and sheet not in sheets:
        raise MergeError(f"Sheet '{sheet}' has no title + ISRC columns.")
    if not sheet:
        sheet = "Muso Credits" if "Muso Credits" in sheets else sheets[0]
    ws = wb[sheet]
    raw_headers = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
    headers, labels, seen = [], {}, set()
    for i, h in enumerate(raw_headers):
        c = _canon_header(h) or f"Column {i + 1}"
        while c in seen:  # keep duplicate header names apart
            c = f"{c} ({i + 1})"
        seen.add(c)
        headers.append(c)
        labels[c] = str(h).strip() if h not in (None, "") else c  # name as uploaded
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r or not any(v not in (None, "") for v in r):
            continue
        rows.append({h: (r[i] if i < len(r) else None) for i, h in enumerate(headers)})
    wb.close()
    if not rows:
        raise MergeError(f"Sheet '{sheet}' has no song rows.")
    return sheet, sheets, headers, labels, rows


# ── Merging ──────────────────────────────────────────────────────────────────

def _primary_order(rows, idxs):
    """Primary version first: untagged title, earliest release, most popular."""
    def score(i):
        d = rows[i]
        date = str(d.get(DATE) or "")
        date = date if re.match(r"\d{4}", date) else "9999"
        try:
            pop = -float(d.get("Popularity (0-100)") or 0)
        except (TypeError, ValueError):
            pop = 0
        return (version_type(d.get(TITLE)) != "Original / Re-release", date, pop, i)
    return sorted(idxs, key=score)


def _release(rows, idxs):
    dates = sorted(str(rows[i].get(DATE)) for i in idxs
                   if re.match(r"\d{4}", str(rows[i].get(DATE) or "")))
    return dates[0] if dates else ""


def _sheet_value(rows, idxs, col):
    for i in idxs:
        v = rows[i].get(col)
        if not is_placeholder(v) and str(v).strip():
            return str(v).strip()
    return ""


def assign_types(rows, records, rids):
    """Type of each recording among the versions of one song.
    A Type given in the uploaded sheet is kept as written. Otherwise the title's
    version tag decides (Lofi, Remix, Jhankar, ...); of the untagged versions the
    earliest release is the Original and the rest are Re-release."""
    out, plain = {}, []
    for r in rids:
        t = _sheet_value(rows, records[r], TYPE)
        if not t:
            vt = version_type(rows[records[r][0]].get(TITLE))
            t = "" if vt == "Original / Re-release" else vt
        if t:
            out[r] = t
        else:
            plain.append(r)
    has_original = any(t.casefold() == "original" for t in out.values())
    heads = {records[r][0]: r for r in plain}
    for n, i in enumerate(_primary_order(rows, list(heads))):
        out[heads[i]] = "Re-release" if n or has_original else "Original"
    return out


def record_types(rows, records, suggestions):
    """Type of every recording: versions in a suggestion are typed together."""
    types = {r["id"]: r["type"] for s in suggestions for r in s["records"]}
    for rid in range(len(records)):
        if rid not in types:
            types.update(assign_types(rows, records, [rid]))
    return [types[r] for r in range(len(records))]


def sheet_manual(rows, records):
    """Manual Type / Covers values already filled in the uploaded sheet."""
    out = {}
    for rid, idxs in enumerate(records):
        t, c = _sheet_value(rows, idxs, MANUAL_TYPE), _sheet_value(rows, idxs, COVER_OF)
        if t or c:
            out[str(rid)] = {"type": t, "cover": c}
    return out


def clean_manual(sess, manual):
    """{record id: {type, cover}} as sent by the UI, validated."""
    n, out = len(sess["records"]), {}
    for k, v in (manual or {}).items():
        try:
            rid = int(k)
        except (TypeError, ValueError):
            continue
        if 0 <= rid < n and isinstance(v, dict):
            out[str(rid)] = {"type": str(v.get("type") or "").strip()[:60],
                             "cover": str(v.get("cover") or "").strip()[:300]}
    return out


def effective_manual(sess, saved):
    """Sheet values, overridden by what was entered in the app (a blank entry clears)."""
    return {**sheet_manual(sess["rows"], sess["records"]), **(saved or {})}


def _row_writers(d, writer_cols):
    """Writer identity of one row: names per writer column, formatting ignored."""
    return tuple(frozenset(name_key(n) for n in split_names(d.get(c))) - {""} for c in writer_cols)


def group_records(rows, writer_cols=()):
    """Rows sharing an ISRC (a cell may hold several) form one recording - but only
    when their lyricist / author / composer credits are identical. Same ISRC with
    different writers stays separate and is flagged for review."""
    dsu = DSU(len(rows))
    first = {}
    for i, d in enumerate(rows):
        sig = _row_writers(d, writer_cols)
        for t in isrc_tokens(d.get("ISRC")):
            key = (t, sig)
            if key in first:
                dsu.union(first[key], i)
            else:
                first[key] = i
    groups = OrderedDict()
    for i in range(len(rows)):
        groups.setdefault(dsu.find(i), []).append(i)
    return [_primary_order(rows, g) for g in groups.values()]


def _names(rows, idxs, col):
    """Distinct names in a column across rows, display spelling kept, in order."""
    out = OrderedDict()
    for i in idxs:
        for n in split_names(rows[i].get(col)):
            out.setdefault(name_key(n), n)
    out.pop("", None)
    return out


def writer_signature(rows, idxs, writer_cols):
    """Exact writer identity of a recording, or None when credits are incomplete.
    Only formatting is ignored (case, spaces, punctuation, order)."""
    sig = []
    for col in writer_cols:
        sig.append(frozenset(_names(rows, idxs, col)))
    by_col = dict(zip(writer_cols, sig))
    if not by_col.get("Composer"):
        return None
    if not (by_col.get("Lyricist") or by_col.get("Author")):
        return None
    return tuple(sig)


def _record_summary(rid, rows, idxs, rtype):
    p = rows[idxs[0]]
    isrcs = list(OrderedDict.fromkeys(t for i in idxs for t in isrc_tokens(rows[i].get("ISRC"))))
    return {
        "id": rid,
        "title": _txt(p.get(TITLE)),
        "album": _txt(p.get(ALBUM)),
        "isrcs": isrcs,
        "singer": ", ".join(_names(rows, idxs, SINGER).values()),
        "lyricist": ", ".join(_names(rows, idxs, "Lyricist").values()),
        "author": ", ".join(_names(rows, idxs, "Author").values()),
        "composer": ", ".join(_names(rows, idxs, "Composer").values()),
        "release": _release(rows, idxs),
        "type": rtype,
        "rows": len(idxs),
    }


def build_conflicts(rows, records, writer_cols, types):
    """Recordings that share an ISRC but were not merged because writer credits differ.
    kind: 'missing'   - the only difference is a blank credit on some copies
          'extra'     - one copy lists extra writers on top of the other's
          'overlap'   - credits differ but every pair shares at least one name
          'different' - at least two copies credit completely different people"""
    owners = defaultdict(list)
    for rid, idxs in enumerate(records):
        for t in OrderedDict.fromkeys(t for i in idxs for t in isrc_tokens(rows[i].get("ISRC"))):
            owners[t].append(rid)
    dsu = DSU(len(records))
    for rids in owners.values():
        for r in rids[1:]:
            dsu.union(rids[0], r)
    groups = OrderedDict()
    for rids in owners.values():
        if len(rids) > 1:
            groups.setdefault(dsu.find(rids[0]), set()).update(rids)

    rank = {"missing": 0, "extra": 1, "overlap": 2, "different": 3}
    out = []
    for rids in groups.values():
        rids = sorted(rids)
        kind, diff_cols = "missing", []
        for col in writer_cols:
            sets = [frozenset(_names(rows, records[r], col)) for r in rids]
            filled = [x for x in sets if x]
            if len(set(sets)) > 1:
                diff_cols.append(col)
            if len(set(filled)) <= 1:
                continue
            if all(a <= b or b <= a for a in filled for b in filled):
                k = "extra"
            elif all(a & b for a in filled for b in filled):
                k = "overlap"
            else:
                k = "different"
            kind = max(kind, k, key=rank.get)
        recs = [_record_summary(r, rows, records[r], types[r]) for r in rids]
        isrcs = list(OrderedDict.fromkeys(t for r in recs for t in r["isrcs"]))
        shared = [t for t in isrcs if sum(t in r["isrcs"] for r in recs) > 1]
        out.append({"kind": kind, "diff_cols": diff_cols, "isrcs": shared or isrcs,
                    "title": recs[0]["title"], "records": recs})
    out.sort(key=lambda c: (rank[c["kind"]], c["isrcs"][0] if c["isrcs"] else ""))
    for n, c in enumerate(out, start=1):
        c["id"] = f"C{n:04d}"
    return out


def compare(sid, rids):
    """Every column of the sheet for a few recordings, for side-by-side review."""
    sess = SESSIONS[sid]
    rows, records, headers = sess["rows"], sess["records"], sess["headers"]
    label = sess.get("labels", {})
    out = []
    for rid in rids:
        if not 0 <= rid < len(records):
            continue
        dicts = [rows[i] for i in records[rid]]
        values = {}
        for h in headers:
            orig, dup = merge_column(h, dicts)
            values[h] = "" if orig is None else (f"{orig} | {dup}" if dup else str(orig))
        out.append({"id": rid, "rows": len(dicts), "values": values})
    return {
        "columns": [{"key": h, "label": label.get(h, h), "writer": h in sess["writer_cols"]} for h in headers],
        "records": out,
    }


# People columns searched for the client's name
PEOPLE_COLS = ("Main Artist (All)", SINGER, "Lyricist", "Author", "Composer", "Producer",
               "Featured Artist", "Recording Engineer", "Mixing Engineer", "Mastering Engineer",
               "Other Credits")


def isrc_split_records(rows, records):
    """Recordings that share an ISRC with another recording (kept apart: writers differ)."""
    owners = defaultdict(set)
    for rid, idxs in enumerate(records):
        for i in idxs:
            for t in isrc_tokens(rows[i].get("ISRC")):
                owners[t].add(rid)
    return {rid for rids in owners.values() if len(rids) > 1 for rid in rids}


def _client_keys(match_names):
    return [k for k in (name_key(n) for n in (match_names or [])) if len(k) >= 3]


def row_credits_client(d, headers, keys):
    for col in PEOPLE_COLS:
        if col not in headers:
            continue
        for n in split_names(d.get(col)):
            k = name_key(n)
            if k and any(ck in k for ck in keys):
                return True
    return False


def client_missing_records(rows, records, headers, match_names):
    """Recordings where none of the client's names appear in any people column."""
    keys = _client_keys(match_names)
    if not keys:
        return set()
    return {rid for rid, idxs in enumerate(records)
            if not any(row_credits_client(rows[i], headers, keys) for i in idxs)}


def _txt(v):
    return "" if is_placeholder(v) else str(v).strip()


def build_suggestions(rows, records, writer_cols):
    """Recordings with a similar base title AND identical writers."""
    blocks = defaultdict(list)
    for rid, idxs in enumerate(records):
        sig = writer_signature(rows, idxs, writer_cols)
        key = title_key(rows[idxs[0]].get(TITLE))
        if sig and key:
            blocks[sig].append((rid, key))

    suggestions = []
    for sig, items in blocks.items():
        if len(items) < 2:
            continue
        dsu = DSU(len(items))
        by_key = defaultdict(list)
        for n, (_, k) in enumerate(items):
            by_key[k].append(n)
        for ns in by_key.values():
            for n in ns[1:]:
                dsu.union(ns[0], n)
        keys = list(by_key)
        for a in range(len(keys)):
            for b in range(a + 1, len(keys)):
                ka, kb = keys[a], keys[b]
                if min(len(ka), len(kb)) < 8:
                    continue
                sm = difflib.SequenceMatcher(None, ka, kb)
                if sm.quick_ratio() >= FUZZY_RATIO and sm.ratio() >= FUZZY_RATIO:
                    dsu.union(by_key[ka][0], by_key[kb][0])
        clusters = defaultdict(list)
        for n, (rid, _) in enumerate(items):
            clusters[dsu.find(n)].append(rid)
        for rids in clusters.values():
            if len(rids) > 1:
                suggestions.append(_suggestion(rows, records, sorted(rids), writer_cols))

    suggestions.sort(key=lambda s: (-len(s["records"]), s["base_title"].lower()))
    for n, s in enumerate(suggestions, start=1):
        s["id"] = f"G{n:04d}"
    return suggestions


def _suggestion(rows, records, rids, writer_cols):
    # Order versions like a song's versions: original first
    heads = {records[r][0]: r for r in rids}
    ordered = [heads[i] for i in _primary_order(rows, list(heads))]
    types = assign_types(rows, records, ordered)
    recs = [_record_summary(r, rows, records[r], types[r]) for r in ordered]
    singer_sets = {frozenset(name_key(s) for s in r["singer"].split(", ") if s) for r in recs}
    first = records[ordered[0]]
    return {
        "base_title": clean_title(rows[first[0]].get(TITLE)) or recs[0]["title"],
        "writers": {c: ", ".join(_names(rows, first, c).values()) for c in writer_cols},
        "singers_differ": len(singer_sets) > 1,
        "types": dict(Counter(r["type"] for r in recs).most_common()),
        "records": recs,
    }


# ── Sessions ─────────────────────────────────────────────────────────────────

def _prune():
    now = time.time()
    with _lock:
        for sid in [s for s, v in SESSIONS.items() if now - v["created"] > SESSION_TTL]:
            SESSIONS.pop(sid, None)


def analyze(data, file_name, owner, sheet=None, sid=None, match_names=None):
    """Parse + merge an upload, keep it as an in-memory session, return the UI payload."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise MergeError("File is larger than 25 MB.")
    _prune()
    sheet, sheets, headers, labels, rows = parse_workbook(data, sheet)
    writer_cols = [c for c in WRITER_COLS if c in headers]
    records = group_records(rows, writer_cols)
    suggestions = build_suggestions(rows, records, writer_cols)
    types = record_types(rows, records, suggestions)
    conflicts = build_conflicts(rows, records, writer_cols, types)
    sid = sid or uuid.uuid4().hex
    with _lock:
        SESSIONS[sid] = {
            "created": time.time(), "owner": owner, "file_name": file_name,
            "sheet": sheet, "sheets": sheets, "headers": headers, "labels": labels,
            "rows": rows, "records": records, "types": types,
            "suggestions": {s["id"]: s for s in suggestions}, "writer_cols": writer_cols,
            "conflicts": {c["id"]: c for c in conflicts},
            "match_names": list(match_names or []),
        }
    return payload(sid)


def payload(sid):
    sess = SESSIONS[sid]
    rows, records = sess["rows"], sess["records"]
    split = isrc_split_records(rows, records)
    missing = client_missing_records(rows, records, sess["headers"], sess.get("match_names"))
    has_client = bool(_client_keys(sess.get("match_names")))

    def flags(rec):
        return {**rec, "isrc_split": rec["id"] in split,
                "client_credited": (rec["id"] not in missing) if has_client else None}

    suggestions = [{**s, "records": [flags(r) for r in s["records"]]} for s in sess["suggestions"].values()]
    conflicts = [{**c, "records": [flags(r) for r in c["records"]]} for c in sess["conflicts"].values()]
    return {
        "session_id": sid,
        "file_name": sess["file_name"],
        "sheet": sess["sheet"],
        "sheets": sess["sheets"],
        "writer_cols": sess["writer_cols"],
        "stats": {
            "rows": len(rows),
            "records": len(records),
            "isrc_merged_rows": len(rows) - len(records),
            "suggestions": len(suggestions),
            "suggested_records": sum(len(s["records"]) for s in suggestions),
            "isrc_split": len(split),
            "isrc_conflicts": len(conflicts),
            "conflict_kinds": dict(Counter(c["kind"] for c in conflicts)),
            "client_missing": len(missing),
        },
        "match_names": sess.get("match_names") or [],
        "records": [flags(_record_summary(r, rows, idxs, sess["types"][r])) for r, idxs in enumerate(records)],
        "suggestions": suggestions,
        "conflicts": conflicts,
        "manual_types": MANUAL_TYPES,
    }


def set_match_names(sid, names):
    sess = SESSIONS[sid]
    sess["match_names"] = [n.strip() for n in names if n and n.strip()][:20]
    missing = client_missing_records(sess["rows"], sess["records"], sess["headers"], sess["match_names"])
    return {"match_names": sess["match_names"], "missing": sorted(missing),
            "has_client": bool(_client_keys(sess["match_names"]))}


def rename_session(old, new):
    with _lock:
        SESSIONS[new] = SESSIONS.pop(old)


def get_session(sid):
    s = SESSIONS.get(sid)
    if s:
        s["created"] = time.time()  # keep active sessions warm
    return s


# ── Excel output ─────────────────────────────────────────────────────────────

def review_items(sess):
    """Everything a person decides on: merge suggestions and ISRC conflicts."""
    return {**sess["suggestions"], **sess.get("conflicts", {})}


def resolve_groups(sess, decisions):
    """decisions: {item_id: {"status": "accepted"|"rejected", "records": [rid,...]}}
    Accepted items join their recordings into one song (transitively).
    Returns final songs (lists of record ids) and the status of every item."""
    dsu = DSU(len(sess["records"]))
    status = {}
    for gid, s in review_items(sess).items():
        d = decisions.get(gid) or {}
        allowed = {r["id"] for r in s["records"]}
        chosen = [r for r in (d.get("records") or []) if r in allowed]
        if d.get("status") == "accepted" and len(chosen) >= 2:
            status[gid] = ("Accepted", set(chosen))
            for r in chosen[1:]:
                dsu.union(chosen[0], r)
        else:
            status[gid] = ("Rejected" if d.get("status") == "rejected" else "Not reviewed", set())
    songs = OrderedDict()
    for rid in range(len(sess["records"])):
        songs.setdefault(dsu.find(rid), []).append(rid)
    return list(songs.values()), status, None


def build_workbook(sess, decisions, manual=None):
    """Two sheets: 'Merged Songs' (one row per song, original + Duplicates columns)
    and 'All Songs' (every uploaded row, unchanged, in upload order). Both end with
    Type, Manual Type (dropdown) and Covers / Remix Song name.
    manual: {record id: {type, cover}} entered in the app."""
    rows, records = sess["rows"], sess["records"]
    headers = [h for h in sess["headers"] if h not in TYPE_COLS]  # rewritten at the end
    label = sess.get("labels", {})
    songs, _, _ = resolve_groups(sess, decisions)
    # Within an accepted song, order recordings original-first
    songs = [[{records[r][0]: r for r in s}[i] for i in _primary_order(rows, [records[r][0] for r in s])]
             if len(s) > 1 else s for s in songs]
    # Original / Re-release is decided among the versions that end up in one song
    types = {}
    for s in songs:
        types.update(assign_types(rows, records, s))
    manual = effective_manual(sess, manual)
    extra = lambda r: [types[r], (manual.get(str(r)) or {}).get("type", ""),
                       (manual.get(str(r)) or {}).get("cover", "")]
    row_rid = {i: rid for rid, idxs in enumerate(records) for i in idxs}
    dropdown = {"validate": "list", "source": MANUAL_TYPES, "error_type": "warning",
                "error_title": "Manual Type", "error_message": "Not one of the listed types. Keep it anyway?"}

    # Songs that never credit the client are highlighted red in both sheets
    keys = _client_keys(sess.get("match_names"))
    missing = client_missing_records(rows, records, headers, sess.get("match_names"))
    fmt = lambda kind, miss: F[f"{kind}_miss"] if miss and kind in ("orig", "dup") else F[kind]

    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True, "strings_to_urls": False})
    F = _formats(wb)

    ws = wb.add_worksheet("Merged Songs")
    cols, kinds = [], []
    for h in headers:
        name = label.get(h, h)
        cols += [name, f"{name} (Duplicates)"]
        kinds += ["isrc" if h == "ISRC" else "orig", "dup"]
    for name in TYPE_COLS:
        cols += [name, f"{name} (Duplicates)"]
        kinds += ["orig", "dup"]
    _header(ws, cols, kinds, F)
    for n, s in enumerate(songs, start=1):
        dicts = [rows[i] for r in s for i in records[r]]
        out = []
        for h in headers:
            out.extend(merge_column(h, dicts))
        # One value per version, in the same order as the ISRC duplicates
        per = [extra(r) for r in s]
        for k in range(len(TYPE_COLS)):
            dups = [v[k] for v in per[1:]]
            out += [per[0][k], ", ".join(x or "—" for x in dups) if any(dups) else None]
        miss = all(r in missing for r in s)
        for c, v in enumerate(out):
            ws.write(n, c, _cell(v), fmt(kinds[c], miss))
    c = cols.index(MANUAL_TYPE)
    ws.data_validation(1, c, max(len(songs), 1), c, dropdown)
    _finish(ws, cols, len(songs), freeze_col=0)

    ws = wb.add_worksheet("All Songs")
    cols = [label.get(h, h) for h in headers] + list(TYPE_COLS)
    kinds = ["isrc" if h == "ISRC" else "orig" for h in headers] + ["orig"] * len(TYPE_COLS)
    _header(ws, cols, kinds, F)
    for n, d in enumerate(rows, start=1):
        miss = bool(keys) and not row_credits_client(d, headers, keys)
        for c, v in enumerate([d.get(h) for h in headers] + extra(row_rid[n - 1])):
            ws.write(n, c, _cell(v), fmt(kinds[c], miss))
    c = cols.index(MANUAL_TYPE)
    ws.data_validation(1, c, max(len(rows), 1), c, dropdown)
    _finish(ws, cols, len(rows), freeze_col=0)

    wb.close()
    return buf.getvalue()


def _cell(v):
    if v is None:
        return ""
    if isinstance(v, (int, float)):
        return v
    s = str(v)
    return s[:32000]


WIDTHS = {
    TITLE: 34, ALBUM: 34, "ISRC": 16, DATE: 13, "Main Artist (All)": 26, SINGER: 26,
    "Lyricist": 26, "Author": 26, "Composer": 30, "Music Label": 24, "Song Link": 40,
    "Song ID": 10, "Recording ID": 12, "Merge Basis": 22, "Suggestion ID": 12,
    "Base Title": 30, "Title": 34, "Album": 30, "Singer ": 26,
    TYPE: 18, MANUAL_TYPE: 18, COVER_OF: 34,
}


def _formats(wb):
    base = {"font_name": "Calibri", "font_size": 10, "valign": "top", "text_wrap": True,
            "border": 1, "border_color": "#BFBFBF"}
    f = lambda **kw: wb.add_format({**base, **kw})
    return {
        "hdr": f(bold=True, font_size=11, font_color="#FFFFFF", bg_color="#1F4E78", align="center", valign="vcenter"),
        "hdr_dup": f(bold=True, font_size=11, font_color="#FFFFFF", bg_color="#2E75B6", align="center", valign="vcenter"),
        "cell": f(),
        "orig": f(),
        "lead": f(),
        "bold_cell": f(bold=True),
        "band": f(bg_color="#DDEBF7"),
        "band_bold": f(bg_color="#DDEBF7", bold=True),
        "dup": f(bg_color="#FFF2CC"),
        "orig_miss": f(bg_color="#FDE2E1"),
        "dup_miss": f(bg_color="#F9CFCF"),
        "isrc": f(bg_color="#FFE699", bold=True),
        "bold": wb.add_format({"bold": True, "font_size": 11}),
        "plain": wb.add_format({"font_size": 10}),
    }


def _header(ws, cols, kinds, F):
    ws.set_row(0, 34)
    for c, (h, k) in enumerate(zip(cols, kinds)):
        ws.write(0, c, h, F["hdr_dup"] if k == "dup" else F["hdr"])
        base = h.replace(" (Duplicates)", "").replace("Shared ", "")
        w = WIDTHS.get(base, 18)
        ws.set_column(c, c, int(w * 1.4) if k == "dup" else w)


def _finish(ws, cols, n_rows, freeze_col):
    ws.freeze_panes(1, freeze_col)
    ws.autofilter(0, 0, max(n_rows, 1), len(cols) - 1)
