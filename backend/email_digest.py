"""Weekly digest email -> SMTP via Gmail App Password.

Run directly: `python email_digest.py` -> sends digest of last 7 days immediately.
"""
import os
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

SENDER = os.getenv("GMAIL_SENDER", "").strip()
APP_PW = os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "")

# ─────────────────────────────────────────────────────────────────────────────
# WEEKLY EMAIL RECIPIENTS — edit this list to add / remove people.
# One email per line. Saved here (not .env) so it's easy to change anytime.
# ─────────────────────────────────────────────────────────────────────────────
RECIPIENTS = [
    "rahul.musicrightsmanagement@gmail.com",
    "durgasingh.jr@gmail.com",
    "sherley@musicrightsmanagementindia.com",
    "devi@musicrightsmanagementindia.com",
]
MONGO_URI = os.getenv("MONGO_URI", "")
MONGO_DB = os.getenv("MONGO_DB", "mrm_extractor")

IST = timezone(timedelta(hours=5, minutes=30))


def _db():
    return MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)[MONGO_DB]


def _fetch_window(start_utc, end_utc):
    coll = _db()["downloads"]
    return list(coll.find({"at": {"$gte": start_utc, "$lt": end_utc}}).sort("at", -1))


def _fmt_ist(dt):
    if dt is None:
        return "—"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(IST)
    return local.strftime("%a, %d %b %Y · %I:%M %p")


def _build_html(rows, window_start_ist, window_end_ist):
    n = len(rows)
    artists = sorted({(r.get("artist") or "—").strip() for r in rows if r.get("artist")})
    total_songs = sum(int(r.get("songs") or 0) for r in rows)
    users = {}
    for r in rows:
        u = r.get("email") or "—"
        users[u] = users.get(u, 0) + 1
    top_user = max(users.items(), key=lambda x: x[1])[0] if users else "—"

    table_rows = ""
    for r in rows:
        at = r.get("at")
        if at is not None and at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        if at is not None:
            local = at.astimezone(IST)
            when_date = local.strftime("%d %b %Y")
            when_time = local.strftime("%I:%M %p")
        else:
            when_date, when_time = "—", ""
        drive = r.get("drive_link") or ""
        drive_cell = (
            f'<a href="{escape(drive)}" style="color:#1f3a25;font-weight:600;text-decoration:underline;">Open</a>'
            if drive else '<span style="color:#6b8a76;">—</span>'
        )
        songs = int(r.get("songs") or 0)
        table_rows += f"""
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e6f0de;font-size:13px;color:#1f3a25;">{escape(r.get("email") or "—")}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e6f0de;font-size:13px;font-weight:600;color:#1f3a25;">{escape(r.get("artist") or "—")}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e6f0de;font-size:13px;font-weight:700;color:#1f3a25;"><span style="display:inline-block;min-width:28px;text-align:center;padding:2px 8px;border-radius:6px;background:#DDF6D2;">{songs}</span></td>
          <td style="padding:10px 12px;border-bottom:1px solid #e6f0de;font-size:12px;font-family:Menlo,monospace;color:#3d6b48;white-space:nowrap;">{escape(r.get("apple_ids") or "—")}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e6f0de;font-size:12px;font-family:Menlo,monospace;color:#3d6b48;white-space:nowrap;">{escape(r.get("spotify_ids") or "—")}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e6f0de;font-size:12px;color:#3d6b48;white-space:nowrap;">{when_date}<br><span style="color:#6b8a76;font-size:11px;">{when_time}</span></td>
          <td style="padding:10px 12px;border-bottom:1px solid #e6f0de;font-size:12px;white-space:nowrap;">{drive_cell}</td>
        </tr>"""

    if not rows:
        table_html = '<div style="padding:24px;text-align:center;color:#6b8a76;font-size:14px;">No downloads this week.</div>'
    else:
        table_html = f"""
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #DDF6D2;border-radius:12px;overflow:hidden;">
          <thead>
            <tr style="background:#ECFAE5;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#3d6b48;">User</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#3d6b48;">Artist</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#3d6b48;">Songs</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#3d6b48;">Apple ID</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#3d6b48;">Spotify ID</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#3d6b48;white-space:nowrap;">Date (IST)</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#3d6b48;">Drive</th>
            </tr>
          </thead>
          <tbody>{table_rows}</tbody>
        </table>"""

    start_label = window_start_ist.strftime("%d %b %Y")
    end_label = window_end_ist.strftime("%d %b %Y")

    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#F7FDF3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:840px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;padding:6px 14px;border-radius:999px;background:#DDF6D2;color:#1f3a25;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Weekly Digest</div>
      <h1 style="font-size:28px;font-weight:800;color:#1f3a25;margin:14px 0 4px;">MRM Extractor</h1>
      <p style="font-size:14px;color:#3d6b48;margin:0;">{escape(start_label)} → {escape(end_label)}</p>
    </div>

    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:20px;">
      <tr>
        <td style="width:25%;padding:0 4px 0 0;">
          <div style="background:#fff;border:1px solid #B0DB9C66;border-radius:14px;padding:16px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b8a76;">Downloads</div>
            <div style="font-size:26px;font-weight:800;color:#1f3a25;margin-top:4px;">{n}</div>
          </div>
        </td>
        <td style="width:25%;padding:0 4px;">
          <div style="background:#fff;border:1px solid #B0DB9C66;border-radius:14px;padding:16px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b8a76;">Total Songs</div>
            <div style="font-size:26px;font-weight:800;color:#1f3a25;margin-top:4px;">{total_songs}</div>
          </div>
        </td>
        <td style="width:25%;padding:0 4px;">
          <div style="background:#fff;border:1px solid #B0DB9C66;border-radius:14px;padding:16px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b8a76;">Unique Artists</div>
            <div style="font-size:26px;font-weight:800;color:#1f3a25;margin-top:4px;">{len(artists)}</div>
          </div>
        </td>
        <td style="width:25%;padding:0 0 0 4px;">
          <div style="background:#fff;border:1px solid #B0DB9C66;border-radius:14px;padding:16px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b8a76;">Top User</div>
            <div style="font-size:13px;font-weight:700;color:#1f3a25;margin-top:6px;word-break:break-all;">{escape(top_user.split('@')[0])}</div>
          </div>
        </td>
      </tr>
    </table>

    <div style="background:#fff;border:1px solid #B0DB9C66;border-radius:14px;padding:18px;margin-bottom:16px;">
      <h2 style="font-size:15px;font-weight:700;color:#1f3a25;margin:0 0 12px;">All downloads this week</h2>
      {table_html}
    </div>

    <p style="font-size:11px;color:#6b8a76;text-align:center;margin-top:24px;">
      Automated weekly digest from MRM Extractor · Sent every Saturday 9:00 AM IST
    </p>
  </div>
</body></html>"""


def _build_plain(rows, window_start_ist, window_end_ist):
    n = len(rows)
    artists = sorted({(r.get("artist") or "").strip() for r in rows if r.get("artist")})
    total_songs = sum(int(r.get("songs") or 0) for r in rows)
    lines = [
        "MRM Extractor — Weekly Digest",
        f"{window_start_ist.strftime('%d %b %Y')} -> {window_end_ist.strftime('%d %b %Y')}",
        "",
        f"Downloads: {n}",
        f"Total songs: {total_songs}",
        f"Unique artists: {len(artists)}",
        "",
        "Entries:",
    ]
    for r in rows:
        at = r.get("at")
        if at is not None and at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        lines.append(
            f"- {_fmt_ist(at)} | {r.get('email','—')} | {r.get('artist','—')} | "
            f"songs={int(r.get('songs') or 0)} | apple={r.get('apple_ids','—')} spotify={r.get('spotify_ids','—')}"
        )
    return "\n".join(lines)


def send_weekly_digest(window_days: int = 7):
    if not (SENDER and APP_PW):
        raise RuntimeError("GMAIL_SENDER / GMAIL_APP_PASSWORD must be set in .env")
    if not RECIPIENTS:
        raise RuntimeError("No recipients — add emails to the RECIPIENTS list in email_digest.py")

    now_ist = datetime.now(IST)
    start_ist = now_ist - timedelta(days=window_days)
    start_utc = start_ist.astimezone(timezone.utc)
    end_utc = now_ist.astimezone(timezone.utc)

    rows = _fetch_window(start_utc, end_utc)
    print(f"[Email] window {start_ist:%Y-%m-%d} -> {now_ist:%Y-%m-%d} : {len(rows)} rows")

    msg = EmailMessage()
    subj_range = f"{start_ist.strftime('%d %b')} – {now_ist.strftime('%d %b %Y')}"
    msg["Subject"] = f"MRM Extractor — Weekly Digest ({subj_range})"
    msg["From"] = formataddr(("MRM Extractor", SENDER))
    msg["To"] = ", ".join(RECIPIENTS)
    msg.set_content(_build_plain(rows, start_ist, now_ist))
    msg.add_alternative(_build_html(rows, start_ist, now_ist), subtype="html")

    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx) as s:
        s.login(SENDER, APP_PW)
        s.send_message(msg)
    print(f"[Email] sent to {len(RECIPIENTS)} recipients: {', '.join(RECIPIENTS)}")
    return {"sent_to": RECIPIENTS, "rows": len(rows), "range": subj_range}


if __name__ == "__main__":
    send_weekly_digest()
