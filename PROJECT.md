# MRM Extractor — Project Overview

MRM Extractor is an internal web tool for **Music Rights Management**. Given an artist name and/or platform IDs, it pulls the artist's full song catalog from **Apple Music**, **Spotify** and (optionally) **Muso.ai**, adds songwriter/producer credits from **MusicBrainz**, **Deezer** and Apple Music song pages, and produces a styled **Excel workbook**. It also merges songs across platforms by **ISRC**. Each finished file is saved to **Google Drive**, recorded in **MongoDB**, and listed in a **weekly email digest**.

Production URL: `https://extractor.musicrightsmanagement.in`

---

## 1. Architecture at a glance

```
┌──────────────────────┐   REST + JWT    ┌──────────────────────────────┐
│  Frontend (React)    │ ──────────────► │  Backend (FastAPI, Python)   │
│  Vite + Tailwind     │ ◄── SSE logs ── │  backend.py                  │
│  served by nginx     │                 │   ├─ auth.py      (JWT/Mongo)│
└──────────────────────┘                 │   ├─ song_extractor.py       │
                                         │   ├─ merge_isrc.py  (Excel)  │
                                         │   ├─ gdrive.py    (Drive)    │
                                         │   └─ email_digest.py (SMTP)  │
                                         └──────────────┬───────────────┘
                                                        │
         ┌──────────────┬──────────────┬────────────────┼──────────────┬──────────────┐
         ▼              ▼              ▼                ▼              ▼              ▼
   Apple Music API  Spotify API   MusicBrainz/Deezer   Muso.ai API   MongoDB Atlas  Google Drive
   (+ song pages)                 (credits by ISRC)    (paid)        users/history  xlsx storage
```

| Layer     | Tech                                                          | Location                                           |
|-----------|---------------------------------------------------------------|----------------------------------------------------|
| Frontend  | React 19, Vite 8, Tailwind 3, nginx (prod)                    | [frontend/](frontend/)                             |
| Backend   | FastAPI + Uvicorn, Python 3.12                                | [backend/](backend/)                               |
| Database  | MongoDB Atlas (`users`, `downloads`, `password_resets`)       | [backend/auth.py](backend/auth.py)                 |
| Storage   | Google Drive (OAuth refresh token, one fixed folder)          | [backend/gdrive.py](backend/gdrive.py)             |
| Email     | Gmail SMTP with an App Password                               | [backend/email_digest.py](backend/email_digest.py) |
| Scheduler | APScheduler (weekly digest, Saturday 09:00 IST)               | [backend/backend.py](backend/backend.py)           |
| Deploy    | Docker / docker-compose, Coolify in production                | [docker-compose.yml](docker-compose.yml)           |

---

## 2. End-to-end process (what happens when a user clicks "Extract")

### Step 1 — Login
1. The user signs in on the Login screen. The frontend calls `POST /api/auth/login`.
2. The backend looks up the email in MongoDB `users` and checks the password with bcrypt.
3. On success it returns a **JWT** (HS256, valid for 7 days) containing `email` and `role`. The frontend stores it in `localStorage` (`mrm_token`, `mrm_user`).
4. There is no self-signup. Only an **admin** can create users. The super-admin is created automatically on first startup from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`.

### Step 2 — Fill in the extraction form
On the **Extractor** page the user:
- Chooses one or more **platforms**: Apple Music, Spotify, Muso (paid). The default is Apple + Spotify.
- Enters any of:
  - **Artist name**, used for the name-based search ("Specific Songs" sheet).
  - **Apple Music ID(s)**: artist IDs or URLs.
  - **Spotify ID(s)**: artist/track IDs or URLs.
  - **Muso profile ID**: a UUID or profile URL, needed only if Muso is selected.
- The form checks the inputs (`platformError`): pick at least one platform, give a Muso ID if Muso is selected, and give an artist name or an ID for Apple/Spotify.

### Step 3 — Job is created
1. The frontend calls `POST /api/extract` with `{artist_name, apple_ids, spotify_ids, muso_id, platforms}`.
2. The backend creates a `job_id`, stores the job in the in-memory `JOBS` dict and starts a **background thread** (`run_job`).
3. It returns `{job_id}` straight away.

### Step 4 — Live progress over SSE
1. The frontend opens an `EventSource` on `GET /api/stream/{job_id}?token=...`.
2. Every `print()` the extractor makes on the job's thread is sent to that job's own queue by `JobStreamRouter`. This keeps one user's logs separate from another's.
3. The UI parses special log prefixes:
   - `[STAGE] ...` — a timeline step (for example "Apple — scanning 42 albums…")
   - `[X] songs found: N` — live song counters for Apple and Spotify
   - `[ETA] ...` / `[Enrich] d/total ... ETA ~Xm Ys` — progress bar and time remaining
   - `[STAGE] Waiting in queue...` — shows the "queued" notice
4. A keep-alive comment is sent every 15 s. The stream ends with a `done` or `error` event.

### Step 5 — Concurrency control (job queue)
- At most **3 extractions run at once** (`MAX_CONCURRENT_JOBS = 3`, a `BoundedSemaphore`). This avoids rate-limit errors (429) from Apple and Spotify.
- Extra jobs wait in the queue and show as "queued" in the UI.
- A **watchdog** frees a job's slot after **15 minutes** (`JOB_MAX_SECONDS`), so one stuck job cannot block everyone else.

### Step 6 — Data extraction (`song_extractor.run_extraction`)
The workbook is built sheet by sheet. A platform that was not selected is never called; its sheet only gets a note saying so.

#### 6a. "Apple Music Songs" sheet (from Apple IDs)
1. Each Apple ID is treated as an **artist ID**. The extractor pages through all of the artist's albums (up to 500), then every album's tracks, and collects song IDs.
2. It fetches song details in batches of 25 (`/songs?ids=...&include=albums,artists,composers`).
3. For each song (10 threads in parallel) it **scrapes the public Apple Music song page** for credits (Composer, Lyricist, Producer, Mixing/Recording Engineer). If the page has no credits, it uses Apple's `composerName`.
4. The Music Label column is dropped from this sheet.

#### 6b. "Spotify Songs" sheet (from Spotify IDs)
1. Each ID is identified as a track, artist or album, then expanded into track IDs.
2. Full track and album objects are fetched **one at a time**. Spotify blocks the batch endpoints for development-mode apps.
3. Credit columns (Lyricist, Composer, Producer, engineers) are dropped from this sheet, because Spotify does not provide them.

#### 6c. "Specific Songs" sheet (from artist name)
- **Apple:** search for the artist and pick the exact name match (or the top result). Then collect songs from the artist's views (albums, singles, compilations, appears-on, top songs), all album pages, and a broad song search to catch collaborations. Credits come from the scraper.
- **Spotify:** search for the artist, then collect from all album groups (album, single, appears_on, compilation), top tracks, and a broad track search. Only tracks that credit the artist are kept. Each track is then **enriched with credits by ISRC** from:
  - **MusicBrainz**: ISRC → recording → relations. Throttled to about 1 request per second, as MusicBrainz requires.
  - **Deezer**: `track/isrc:{ISRC}` → contributors with roles.
  - Both sources are combined and duplicates removed. Enrichment runs on 12 threads.
- **Merge:** Apple and Spotify rows are de-duplicated by ISRC, or by song + singer when there is no ISRC. Apple rows come first. Spotify fills any empty or "N/A" fields, and its link is appended (`apple | spotify`).

#### 6d. "Muso Credits" sheet (optional, paid)
- Runs only if Muso is selected, a Muso ID is given, **and** `MUSO_API_KEY` is set.
- Fetches every credited song of the profile, with full track and album details (4 threads, to stay under 5 requests/second).
- Adds extra columns: Artist's Role(s), Featured Artist, Mastering Engineer, Publisher, UPC, P-Line/C-Line, Popularity, BPM, Key, Spotify/Muso track IDs, and more.
- Each API call costs about **$0.02**. The log prints the number of calls and the estimated cost.

**Standard columns** (all sheets):
`Type of Object, Name of the Song / Title, Name of the Album, ISRC, Song Release Date, Main Artist (All), Singer, Lyricist, Composer, Music Label, Producer, Recording Engineer, Mixing Engineer, Genre, Duration (mm:ss), Song Link`

Missing values show as `N/A`. Credits that the platform does not expose show as `Not exposed by public API`.

### Step 7 — Final Excel build (`merge_isrc.run_merge`)
The raw workbook is rebuilt into the final, styled file `SongExtraction_<Artist>.xlsx`:

| Sheet              | Contents                                                                                       |
|--------------------|------------------------------------------------------------------------------------------------|
| Apple Music Songs  | Copied and styled (highlighted ISRC column, alternating row colours, frozen header, filters)   |
| Spotify Songs      | Same                                                                                           |
| Specific Songs     | Same                                                                                           |
| **Merged Songs**   | Apple + Spotify sheets grouped by ISRC. Every field gets a `<Field> (Duplicates)` column next to it holding any other distinct values, so no data is lost |
| Muso Credits       | Copied as-is (only if it exists)                                                               |

The number of merged songs (count of ISRC groups) is returned and shown in the UI.

### Step 8 — Save, record, deliver
1. **Google Drive upload** (`gdrive.upload_xlsx`): uploads to `GDRIVE_FOLDER_ID`. If a file with the same name already exists, it is **overwritten in place**, so there is one file per artist. It retries 4 times with exponential backoff.
2. **History record**: a document is added to MongoDB `downloads` (owner email, artist, IDs, platforms, Drive link, song count, timestamp). This happens when the job finishes, even if the user never downloads the file.
3. **Cleanup**: if the upload worked, the temp folder is deleted. If it failed, the local file is **kept** as a fallback.
4. The SSE stream sends `done` with `merged_count` and `drive_link`.
5. **Download**: `GET /api/download/{job_id}?token=...` serves the file from Drive, or from the local copy if Drive failed.

### Step 9 — History and re-runs
- The **History** page (`GET /api/history`) lists past extractions from all users, newest first, with Drive links.
- **Regenerate** fills the Extractor form with a past job's inputs and platforms, and can run it straight away.
- The **Dashboard** shows stats and recent activity built from the same history.

### Step 10 — Weekly digest email
- Every **Saturday at 09:00 IST**, APScheduler runs `email_digest.send_weekly_digest()`.
- It emails an HTML and plain-text summary of the last 7 days (extractions, artists, total songs, per-user activity) to the `RECIPIENTS` list at the top of [backend/email_digest.py](backend/email_digest.py).
- To send one by hand: `python backend/email_digest.py`.

---

## 3. Authentication and user management

| Feature          | How it works                                                                                                                                                                                                     |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Roles            | `admin` and `user`. Admins see the **Users** page.                                                                                                                                                                |
| Create/delete    | `POST /api/admin/users`, `DELETE /api/admin/users/{id}` (admin only; an admin cannot delete themselves; password must be at least 6 characters)                                                                   |
| Forgot password  | `POST /api/auth/forgot` always returns OK, so it never reveals whether an email exists. Real users get an email link `https://extractor.musicrightsmanagement.in/?reset=<token>`                                  |
| Reset token      | Random token; only its SHA-256 hash is stored. Valid for 30 minutes, single-use, and removed automatically by a MongoDB TTL index                                                                                 |
| Reset            | `POST /api/auth/reset`. The frontend opens the Reset Password screen when the URL contains `?reset=`                                                                                                              |
| Token transport  | `Authorization: Bearer` header for REST calls. `?token=` query parameter for SSE and downloads, because `EventSource` and `<a>` links cannot send headers                                                          |

---

## 4. API reference

| Method | Path                         | Auth          | Purpose                                     |
|--------|------------------------------|---------------|---------------------------------------------|
| POST   | `/api/auth/login`            | —             | Log in and get a JWT                        |
| POST   | `/api/auth/forgot`           | —             | Send a password-reset email                 |
| POST   | `/api/auth/reset`            | —             | Set a new password using the reset token    |
| GET    | `/api/auth/me`               | Bearer        | Current user                                |
| GET    | `/api/admin/users`           | Bearer, admin | List users                                  |
| POST   | `/api/admin/users`           | Bearer, admin | Create a user                               |
| DELETE | `/api/admin/users/{id}`      | Bearer, admin | Delete a user                               |
| POST   | `/api/extract`               | Bearer        | Start an extraction job → `{job_id}`        |
| GET    | `/api/stream/{job_id}`       | `?token=`     | SSE stream of logs and the final event      |
| GET    | `/api/download/{job_id}`     | `?token=`     | Download the final `.xlsx`                  |
| GET    | `/api/history`               | Bearer        | Past extractions (max 200)                  |
| GET    | `/`                          | —             | Health check                                |

---

## 5. Frontend pages ([frontend/src/App.jsx](frontend/src/App.jsx))

| Page / component | Purpose                                                                                                       |
|------------------|---------------------------------------------------------------------------------------------------------------|
| `Login`          | Sign in, plus the "forgot password" flow                                                                      |
| `ResetPassword`  | Opened from the `?reset=<token>` email link                                                                   |
| `Dashboard`      | Stats and recent extractions                                                                                  |
| `Extractor`      | Platform picker, input form, review step, live timeline, counters, ETA, queue notice, download and Drive link |
| `History`        | All past runs, Drive links, Regenerate                                                                        |
| `Users`          | Admin-only user management                                                                                    |
| `Guide`          | Built-in help explaining inputs and output sheets                                                             |

The backend URL comes from `VITE_API_URL`, which is **baked in at build time**.

---

## 6. Configuration

### Backend — `backend/.env` (template: [backend/.env.example](backend/.env.example))

| Variable                                                       | Purpose                                                                                                |
|----------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| `APPLE_DEVELOPER_TOKEN`                                        | Apple Music API JWT. **Expires after at most 6 months**, see §8                                        |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`                   | Spotify app credentials (client-credentials flow)                                                      |
| `MUSO_API_KEY`                                                 | Optional. Without it, the Muso sheet is skipped                                                        |
| `MONGO_URI`, `MONGO_DB`                                        | MongoDB Atlas connection string and database name (default `mrm_extractor`)                            |
| `JWT_SECRET`                                                   | Secret used to sign login tokens                                                                       |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`                    | Admin account created or confirmed at startup                                                          |
| `GDRIVE_FOLDER_ID`                                             | Drive folder that receives the Excel files                                                             |
| `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN` | Google OAuth credentials (scope `drive.file`)                                                      |
| `GMAIL_SENDER`, `GMAIL_APP_PASSWORD`                           | SMTP sender for the digest and reset emails                                                            |
| `ALLOWED_ORIGINS`                                              | CORS origins, comma-separated (empty = `*`)                                                            |
| `HOST`, `PORT`                                                 | Server bind address (default `0.0.0.0:8000`)                                                           |

These values are **hardcoded** in code on purpose and are not read from the environment:
- `FRONTEND_URL = https://extractor.musicrightsmanagement.in` (used in reset links)
- `MAX_CONCURRENT_JOBS = 3`
- `JOB_MAX_SECONDS = 15 min`
- Apple storefront `in`, Spotify market `IN`, `MAX_ALBUMS_PER_ARTIST = 500`
- Digest recipients: the `RECIPIENTS` list in `email_digest.py`

### Frontend — `frontend/.env`
| Variable       | Purpose                                                  |
|----------------|----------------------------------------------------------|
| `VITE_API_URL` | Public backend URL, no trailing slash. Read at build time |

---

## 7. Running the project

### Local (Docker, full stack)
```bash
docker compose --env-file backend/.env up --build
# Backend  -> http://localhost:8000
# Frontend -> http://localhost:5174
```

### Local (without Docker)
```bash
# Backend
cd backend
pip install -r requirements.txt
python backend.py              # http://127.0.0.1:8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev                    # http://localhost:5174
```
On Windows, `start_app.bat` launches both.

### Command-line utilities
| Command                                              | What it does                                                         |
|------------------------------------------------------|----------------------------------------------------------------------|
| `python backend/song_extractor.py`                   | Runs one extraction with the default variables at the top of the file |
| `python backend/merge_isrc.py`                       | Rebuilds `SongExtraction.xlsx` with the merged sheet                 |
| `python backend/gdrive.py`                           | Checks the Google Drive credentials                                  |
| `python backend/email_digest.py`                     | Sends the weekly digest now                                          |
| `python backend/generate_apple_token.py <key.p8> [--write]` | Creates a new Apple Music developer token                     |

### Production (Coolify)
- **Backend**: `backend/Dockerfile` (python:3.12-slim → `uvicorn backend:app`). Secrets are set as Coolify environment variables.
- **Frontend**: `frontend/Dockerfile` builds with Node 20 and serves through nginx. The nginx config has SPA fallback, gzip and long caching for `/assets/`. `VITE_API_URL` must be set as a **build argument**.

---

## 8. Maintenance and troubleshooting

| Symptom                                                        | Likely cause and fix                                                                                                                                                                          |
|----------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Apple sheet says "API returned no rows" / Apple returns 401    | Apple developer token expired. Run `python backend/generate_apple_token.py /path/AuthKey_XXXX.p8 --write`, then `docker compose up -d --build backend`                                        |
| Jobs stuck on "Waiting in queue"                               | 3 jobs are already running. The watchdog frees a slot after 15 min at most                                                                                                                    |
| No Drive link, but the download still works                    | Drive upload failed after retries, so the local copy was served. Check the `GDRIVE_*` credentials or the refresh token                                                                        |
| Muso sheet says "MUSO_API_KEY is not set"                      | Add the key to the backend environment                                                                                                                                                        |
| Spotify credit columns all say "Not exposed by public API"     | Expected for the Spotify ID sheet (columns are dropped). In Specific Songs, it means MusicBrainz and Deezer had no data for that ISRC                                                          |
| Reset emails not arriving                                      | Check `GMAIL_SENDER` / `GMAIL_APP_PASSWORD`. Must be a 16-character Gmail App Password, not the account password                                                                              |
| CORS errors in the browser                                     | Add the frontend origin to `ALLOWED_ORIGINS`                                                                                                                                                  |

**Built-in resilience:**
- Apple and Spotify calls retry with backoff on network errors and 5xx responses, and wait out 429s.
- MusicBrainz is throttled globally to about 1 request per second.
- Muso honours `Retry-After`.
- Credit lookups are cached per song ID or ISRC within a process.

**Known limitations:**
- Jobs live in memory (`JOBS`). Restarting the backend loses running jobs and their stream and download endpoints, but finished files are still in Drive and in History.
- History shows extractions from **all** users, not only the current user's.

---

## 9. Repository layout

```
MRM-Extractor/
├── backend/
│   ├── backend.py              # FastAPI app: routes, job runner, SSE, scheduler
│   ├── auth.py                 # Mongo connection, bcrypt, JWT, roles, reset tokens
│   ├── song_extractor.py       # Apple / Spotify / MusicBrainz / Deezer / Muso extraction
│   ├── merge_isrc.py           # Final styled workbook + ISRC "Merged Songs" sheet
│   ├── gdrive.py               # Google Drive upload/download
│   ├── email_digest.py         # Weekly digest + password-reset emails
│   ├── generate_apple_token.py # Apple Music developer-token generator
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/App.jsx             # Entire UI (all pages and components)
│   ├── src/main.jsx, index.css
│   ├── nginx.conf, Dockerfile
│   └── vite / tailwind / eslint configs
├── docker-compose.yml          # Local full-stack run
├── start_app.bat               # Windows launcher
└── PROJECT.md                  # This document
```
