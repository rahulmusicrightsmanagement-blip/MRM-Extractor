"""One-off Muso extraction with a live progress tracker; stops cleanly when the API quota runs out.

Usage: backend/venv/bin/python -u muso_exports/muso_run.py <api_key> <profile_id> <output.xlsx> [workers=4] [--add-to base.xlsx]
--add-to: only fetch songs NOT already in base.xlsx (matched by Muso Track ID or ISRC); output = base songs + new
songs, with the new ones also listed on an "Added Songs" sheet. Use for a duplicate profile of the same artist.
--resume partial.xlsx: continue a run that stopped early. Songs that already have full track details are not
re-fetched; only the incomplete songs' tracks and all albums are fetched.
When running several profiles at once, lower workers (e.g. 2) since all runs share the key's 300 calls/min.
Progress is printed and also kept in <output.xlsx>.progress.txt
"""
import re, sys, time, threading, requests
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "/home/rahul/Desktop/MRM-Extractor/backend")
import song_extractor as se
from openpyxl import Workbook, load_workbook

# Muso definitions live here (not in backend/song_extractor.py) so this script stands alone.
MUSO_BASE = "https://api.platform.muso.ai/v1"
MUSO_HEADERS = [
    "Type of Object", "Name of the Song / Title", "Name of the Album", "ISRC",
    "Song Release Date", "Main Artist (All)", "Singer", "Lyricist", "Composer",
    "Music Label", "Producer", "Recording Engineer", "Mixing Engineer", "Genre",
    "Duration (mm:ss)", "Song Link",
    "Artist's Role(s)", "Featured Artist", "Mastering Engineer", "Publisher",
    "Record Label (credited org)", "Other Credits", "UPC", "Album Track Count",
    "P-Line", "C-Line", "Popularity (0-100)", "BPM", "Key",
    "Spotify Track ID", "Muso Track ID",
]
# Muso child role -> output column. Unmapped roles go to "Other Credits" as "Name (Role)".
MUSO_ROLE_COL = {
    "Vocals": "Singer", "Lyricist": "Lyricist", "Composer": "Composer", "Co-Writer": "Composer",
    "Producer": "Producer", "Co-Producer": "Producer", "Engineer": "Recording Engineer",
    "Recording Engineer": "Recording Engineer", "Mixing": "Mixing Engineer",
    "Mixing Engineer": "Mixing Engineer", "Mastering": "Mastering Engineer",
    "Mastering Engineer": "Mastering Engineer", "Publisher": "Publisher",
    "Featured Artist": "Featured Artist", "Record Label": "Record Label (credited org)",
}


def muso_profile_id(text):
    m = re.search(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", text or "")
    return m.group(0).lower() if m else None


def parse_muso_track(item, track, album):
    buckets, primaries, other = {}, [], []
    for group in track.get("credits") or []:
        for cr in group.get("credits") or []:
            role = cr.get("child") or ""
            names = [c.get("name") for c in cr.get("collaborators") or [] if c.get("name")]
            if role == "Primary Artist":
                primaries += names
                continue
            col = MUSO_ROLE_COL.get(role)
            if col:
                buckets.setdefault(col, []).extend(names)
            else:
                other += [f"{n} ({role})" for n in names]

    def joined(col, fallback="N/A"):
        return ", ".join(se.dedupe(buckets.get(col))) or fallback

    tc = album.get("trackCount") or 0
    dur = track.get("duration")
    sid = (track.get("spotifyIds") or [None])[0] or (item.get("track") or {}).get("spotifyId")
    pop = track.get("popularity")

    row = {
        "Type of Object": obj_type(tc),
        "Name of the Song / Title": se.safe(track.get("title")),
        "Name of the Album": se.safe((track.get("album") or item.get("album") or {}).get("title")),
        "ISRC": se.arr2str(track.get("isrcs")),
        "Song Release Date": se.safe(track.get("releaseDate") or item.get("releaseDate")),
        "Main Artist (All)": se.arr2str([a.get("name") for a in track.get("artists") or []]),
        # No "Vocals" credit -> assume the primary artists sang it.
        "Singer": joined("Singer", se.arr2str(se.dedupe(primaries))),
        "Lyricist": joined("Lyricist"),
        "Composer": joined("Composer"),
        "Music Label": se.safe(track.get("label") or album.get("label")),
        "Producer": joined("Producer"),
        "Recording Engineer": joined("Recording Engineer"),
        "Mixing Engineer": joined("Mixing Engineer"),
        "Genre": "Not provided by Muso",
        "Duration (mm:ss)": f"{dur // 60}:{dur % 60:02d}" if isinstance(dur, int) and dur else "N/A",
        "Song Link": f"https://open.spotify.com/track/{sid}" if sid else "N/A",
        "Artist's Role(s)": se.arr2str([c.get("child") for c in item.get("credits") or []]),
        "Featured Artist": joined("Featured Artist"),
        "Mastering Engineer": joined("Mastering Engineer"),
        "Publisher": joined("Publisher", se.safe(track.get("publisher"))),
        "Record Label (credited org)": joined("Record Label (credited org)"),
        "Other Credits": se.arr2str(other),
        "UPC": se.safe(album.get("upc")),
        "Album Track Count": tc or "N/A",
        "P-Line": se.safe(track.get("p_line")),
        "C-Line": se.safe(track.get("c_line")),
        "Popularity (0-100)": pop if pop is not None else "N/A",
        "BPM": se.safe(track.get("bpm")),
        "Key": se.safe(track.get("key")),
        "Spotify Track ID": se.safe(sid),
        "Muso Track ID": se.safe(track.get("id")),
    }
    return [row[h] for h in MUSO_HEADERS]


args = sys.argv[1:]
BASE = RESUME = None
if "--add-to" in args:
    i = args.index("--add-to")
    BASE = args[i + 1]
    del args[i:i + 2]
if "--resume" in args:
    i = args.index("--resume")
    RESUME = args[i + 1]
    del args[i:i + 2]
KEY, PID, OUT = args[0], args[1], args[2]
WORKERS = int(args[3]) if len(args) > 3 else 4
PROGRESS_FILE = OUT + ".progress.txt"
STOP = threading.Event()
stop_reason = [""]
calls = [0]
lock = threading.Lock()


def fetch(path, params=None, _attempt=0):
    if STOP.is_set():
        return None  # quota gone: no more billed calls
    with lock:
        calls[0] += 1
    try:
        r = requests.get(MUSO_BASE + path, params=params, headers={"x-api-key": KEY}, timeout=30)
    except requests.RequestException as e:
        if _attempt < 3:
            time.sleep(1 + _attempt)
            return fetch(path, params, _attempt + 1)
        print(f"[Muso] network error {path}: {e}", flush=True)
        return None
    if r.status_code == 429:
        if _attempt < 6:
            time.sleep(float(r.headers.get("Retry-After") or 5))
            return fetch(path, params, _attempt + 1)
        STOP.set(); stop_reason[0] = f"429 persisted: {r.text[:200]}"
        return None
    if r.status_code in (401, 402, 403):
        STOP.set(); stop_reason[0] = f"{r.status_code}: {r.text[:200]}"
        print(f"[Muso] STOPPING — {stop_reason[0]}", flush=True)
        return None
    if r.status_code >= 500 and _attempt < 3:
        time.sleep(1 + _attempt)
        return fetch(path, params, _attempt + 1)
    if r.status_code != 200:
        print(f"[Muso] {r.status_code} {path}: {r.text[:200]}", flush=True)
        return None
    return r.json().get("data")


def progress(stage, done, total):
    line = (f"[PROGRESS] {stage} {done}/{total} ({done * 100 // max(total, 1)}%)"
            f" | calls so far: {calls[0]} (~${calls[0] * 0.02:.2f})")
    print(line, flush=True)
    with open(PROGRESS_FILE, "w") as f:
        f.write(time.strftime("%H:%M:%S ") + line + "\n")


def counted(stage, total, fn):
    done = [0]

    def run(x):
        res = fn(x)
        with lock:
            done[0] += 1
            n = done[0]
        if n % 10 == 0 or n == total:
            progress(stage, n, total)
        return res
    return run


def isrcs_of(v):
    return {x.strip().upper() for x in str(v or "").split(",") if x.strip() and x.strip() != "N/A"}


def obj_type(tc):
    return "Single" if 0 < tc <= 3 else "EP" if 3 < tc <= 6 else "Album" if tc else "N/A"


def patch_album(row, album):
    # Fill the album-derived columns of an already-complete row.
    if not album:
        return row
    row = list(row)
    H = MUSO_HEADERS
    tc = album.get("trackCount") or 0
    row[H.index("Type of Object")] = obj_type(tc)
    row[H.index("UPC")] = se.safe(album.get("upc"))
    row[H.index("Album Track Count")] = tc or "N/A"
    if row[H.index("Music Label")] in (None, "", "N/A"):
        row[H.index("Music Label")] = se.safe(album.get("label"))
    return row


def catalog(pid, skip_ids=frozenset(), skip_isrcs=frozenset(), have=None):
    have = have or {}
    items, offset = [], 0
    while True:
        page = fetch(f"/profile/{pid}/credits", params={"limit": 50, "offset": offset})
        if not page or not page.get("items"):
            break
        items.extend(page["items"])
        offset += 50
        total = page.get("totalCount") or 0
        progress("Song list", min(offset, total), total)
        if offset >= total:
            break
    if skip_ids or skip_isrcs:
        before = len(items)
        items = [it for it in items
                 if (it.get("track") or {}).get("id") not in skip_ids
                 and not (isrcs_of(",".join((it.get("track") or {}).get("isrcs") or [])) & skip_isrcs)]
        print(f"[Muso] {before - len(items)} of {before} songs already in base file -> skipped", flush=True)
    album_ids = se.dedupe([(it.get("album") or {}).get("id") for it in items if (it.get("album") or {}).get("id")])
    tid = lambda it: (it.get("track") or {}).get("id")
    todo = [it for it in items if tid(it) not in have]
    if have:
        # Skip albums whose songs are all complete and already carry album data (from an earlier resume).
        tci = MUSO_HEADERS.index("Album Track Count")
        need = {(it.get("album") or {}).get("id") for it in items
                if tid(it) not in have or have[tid(it)][tci] in (None, "", "N/A")}
        skipped = [a for a in album_ids if a not in need]
        album_ids = [a for a in album_ids if a in need]
        if skipped:
            print(f"[Muso] resume: {len(skipped)} albums already fetched -> not re-fetched", flush=True)
    if have:
        print(f"[Muso] resume: {len(items) - len(todo)} songs already complete -> not re-fetched", flush=True)
    print(f"[Muso] {len(items)} songs on {len(album_ids)} albums -> about {len(todo) + len(album_ids)} more calls", flush=True)

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        fetched = dict(zip([tid(it) for it in todo], ex.map(counted("Tracks", len(todo),
                           lambda it: fetch(f"/track/id/{tid(it)}") or {}), todo)))
        albums = dict(zip(album_ids, ex.map(counted("Albums", len(album_ids),
                                                    lambda a: fetch(f"/album/id/{a}") or {}), album_ids)))

    rows = []
    for it in items:
        album = albums.get((it.get("album") or {}).get("id")) or {}
        if tid(it) in have:
            rows.append(patch_album(have[tid(it)], album))
            continue
        tr = fetched.get(tid(it))
        if not tr:
            tr = dict(it.get("track") or {}, album=it.get("album"), artists=it.get("artists"),
                      label=it.get("label"), p_line=it.get("p_line"), c_line=it.get("c_line"))
        rows.append(parse_muso_track(it, tr, album))
    return rows


pid = muso_profile_id(PID)
if not pid:
    sys.exit(f"Not a Muso profile ID or URL: {PID}")
print(f"[Muso] profile: {pid}", flush=True)
base_rows, skip_ids, skip_isrcs = [], set(), set()
if BASE:
    ws = load_workbook(BASE)["Muso Credits"]
    hdr = [c.value for c in ws[1]]
    base_rows = [list(r) for r in ws.iter_rows(min_row=2, values_only=True)]
    ti, ii = hdr.index("Muso Track ID"), hdr.index("ISRC")
    skip_ids = {r[ti] for r in base_rows if r[ti]}
    for r in base_rows:
        skip_isrcs |= isrcs_of(r[ii])
    print(f"[Muso] base file: {len(base_rows)} songs", flush=True)
have = {}
if RESUME:
    ws = load_workbook(RESUME)["Muso Credits"]
    hdr = [c.value for c in ws[1]]
    ti, di = hdr.index("Muso Track ID"), hdr.index("Duration (mm:ss)")
    # Rows with a duration came from a full track fetch; the rest only have credits-list data.
    have = {r[ti]: list(r) for r in ws.iter_rows(min_row=2, values_only=True) if r[ti] and r[di] != "N/A"}
    print(f"[Muso] resume file: {len(have)} complete songs", flush=True)
rows = catalog(pid, skip_ids, skip_isrcs, have)
if BASE:
    # Second ISRC check on full track data (list items don't always carry ISRCs).
    ii = MUSO_HEADERS.index("ISRC")
    new_rows = []
    for r in rows:
        if not (isrcs_of(r[ii]) & skip_isrcs):
            new_rows.append(r)
            skip_isrcs |= isrcs_of(r[ii])
    print(f"[Muso] {len(new_rows)} new songs added to base ({len(rows) - len(new_rows)} more dropped as ISRC duplicates)", flush=True)
    added, rows = new_rows, base_rows + new_rows

wb = Workbook()
wb.remove(wb.active)
se.write_sheet(wb, "Muso Credits", rows, headers=MUSO_HEADERS)
if BASE:
    se.write_sheet(wb, "Added Songs", added, headers=MUSO_HEADERS)
if STOP.is_set():
    wb.create_sheet("Info")["A1"] = (f"Stopped early — API limit reached ({stop_reason[0]}). "
                                     "Songs after that point use basic credits-list data only.")
wb.save(OUT)
summary = f"DONE rows={len(rows)} calls={calls[0]} (~${calls[0] * 0.02:.2f}) stopped={STOP.is_set()} {stop_reason[0]}"
print(summary, flush=True)
with open(PROGRESS_FILE, "w") as f:
    f.write(time.strftime("%H:%M:%S ") + summary + "\n")
print(f"Saved: {OUT}", flush=True)
