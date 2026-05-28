import { useEffect, useMemo, useRef, useState } from "react";

const API = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const T = {
  // palette
  p1: "#ECFAE5",
  p2: "#DDF6D2",
  p3: "#CAE8BD",
  p4: "#B0DB9C",
  p5: "#8FC97A",
  ink: "#1f3a25",
  ink2: "#3d6b48",
  ink3: "#6b8a76",
  border: "rgba(176, 219, 156, 0.4)",
  borderSoft: "rgba(176, 219, 156, 0.25)",
  surface: "#ffffff",
  surfaceTint: "#FBFFF8",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  dangerBorder: "#fecaca",
};

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("mrm_token") || "");
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mrm_user") || "null"); } catch { return null; }
  });
  const [page, setPage] = useState("dashboard");
  const [prefill, setPrefill] = useState(null);

  const saveAuth = (tok, u) => {
    localStorage.setItem("mrm_token", tok);
    localStorage.setItem("mrm_user", JSON.stringify(u));
    setToken(tok);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem("mrm_token");
    localStorage.removeItem("mrm_user");
    setToken("");
    setUser(null);
    setPage("dashboard");
  };

  const regenerate = (row) => {
    setPrefill({
      artist: row.artist || "",
      apple: row.apple_ids || "",
      spotify: row.spotify_ids || "",
      autorun: true,
      ts: Date.now(),
    });
    setPage("extract");
  };

  const goExtract = () => { setPrefill(null); setPage("extract"); };

  if (!token || !user) return <Login onLogin={saveAuth} />;

  return (
    <div className="min-h-screen w-full">
      <Navbar user={user} page={page} setPage={setPage} onLogout={logout} />
      <main className="w-full flex justify-center px-4 md:px-8 py-8">
        <div className="w-full max-w-6xl">
          <div className="fade-in" style={{ display: page === "dashboard" ? "block" : "none" }}>
            <Dashboard token={token} user={user} active={page === "dashboard"} onNew={goExtract} onOpenHistory={() => setPage("history")} />
          </div>
          <div className="fade-in" style={{ display: page === "extract" ? "block" : "none" }}>
            <Extractor token={token} prefill={prefill} />
          </div>
          <div className="fade-in" style={{ display: page === "history" ? "block" : "none" }}>
            <History token={token} active={page === "history"} onRegenerate={regenerate} />
          </div>
          {user.role === "admin" && (
            <div className="fade-in" style={{ display: page === "users" ? "block" : "none" }}>
              <Users token={token} currentEmail={user.email} active={page === "users"} />
            </div>
          )}
          <div className="fade-in" style={{ display: page === "guide" ? "block" : "none" }}>
            <Guide onNew={goExtract} />
          </div>
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVBAR
// ─────────────────────────────────────────────────────────────────────────────
function Navbar({ user, page, setPage, onLogout }) {
  const initial = (user.email || "?")[0].toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const links = [
    { id: "dashboard", label: "Dashboard", icon: <IconHome /> },
    { id: "extract", label: "Extractor", icon: <IconBolt /> },
    { id: "history", label: "History", icon: <IconClock /> },
    ...(user.role === "admin" ? [{ id: "users", label: "Users", icon: <IconUsers /> }] : []),
    { id: "guide", label: "Guide", icon: <IconBook /> },
  ];

  return (
    <nav
      className="sticky top-0 z-30 w-full"
      style={{
        background: "rgba(247, 253, 243, 0.85)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <button onClick={() => setPage("dashboard")} className="flex items-center gap-2">
            <img src="/Original%20on%20transparent.png" alt="MRM" style={{ height: 32, width: "auto", objectFit: "contain" }} />
            <span className="text-base font-bold tracking-tight" style={{ color: T.ink }}>Extractor</span>
          </button>
          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <NavLink key={l.id} active={page === l.id} icon={l.icon} onClick={() => setPage(l.id)}>{l.label}</NavLink>
            ))}
          </div>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-full pl-1 pr-3 py-1 transition hover:bg-white"
            style={{ border: `1px solid ${T.border}`, background: T.surface }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
              style={{ background: `linear-gradient(135deg, ${T.p4}, ${T.p5})`, color: "#fff" }}
            >
              {initial}
            </div>
            <div className="hidden sm:block leading-tight pr-1">
              <div className="text-xs font-semibold" style={{ color: T.ink }}>{user.email.split("@")[0]}</div>
              <div className="text-[9px] uppercase tracking-wider font-bold" style={{ color: T.ink3 }}>{user.role}</div>
            </div>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5l3 3 3-3" stroke={T.ink2} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 mt-2 w-64 rounded-xl py-2 fade-in"
              style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 20px 40px ${T.p4}33, 0 4px 12px rgba(0,0,0,0.04)` }}
            >
              <div className="px-3 py-2 border-b" style={{ borderColor: T.borderSoft }}>
                <div className="text-sm font-semibold" style={{ color: T.ink }}>{user.email}</div>
                <div className="text-[10px] uppercase tracking-wider font-bold mt-0.5" style={{ color: T.ink3 }}>{user.role}</div>
              </div>
              <button
                onClick={() => { setMenuOpen(false); onLogout(); }}
                className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-red-50 transition flex items-center gap-2"
                style={{ color: T.danger }}
              >
                <IconLogout /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="md:hidden border-t" style={{ borderColor: T.borderSoft }}>
        <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto">
          {links.map((l) => (
            <NavLink key={l.id} active={page === l.id} icon={l.icon} onClick={() => setPage(l.id)}>{l.label}</NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

function NavLink({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition whitespace-nowrap"
      style={{
        background: active ? T.ink : "transparent",
        color: active ? "#fff" : T.ink2,
      }}
    >
      <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Login failed");
      onLogin(d.token, d.user);
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(false); }
  };

  if (showGuide) {
    return (
      <div className="min-h-screen w-full">
        <div
          className="sticky top-0 z-30 w-full"
          style={{ background: "rgba(247,253,243,0.85)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${T.border}` }}
        >
          <div className="mx-auto max-w-7xl px-4 md:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/Original%20on%20transparent.png" alt="MRM" style={{ height: 32, width: "auto", objectFit: "contain" }} />
              <span className="text-base font-bold tracking-tight" style={{ color: T.ink }}>Guide</span>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="rounded-lg px-4 py-1.5 text-sm font-semibold transition flex items-center gap-2"
              style={{ background: T.ink, color: "#fff" }}
            >
              <IconArrowLeft /> Back to sign in
            </button>
          </div>
        </div>
        <main className="w-full flex justify-center px-4 md:px-8 py-8">
          <div className="w-full max-w-6xl fade-in">
            <Guide onNew={() => setShowGuide(false)} ctaLabel="Back to sign in" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-md fade-in">
        <div className="mb-8 text-center">
          <img src="/Original%20on%20transparent.png" alt="MRM" style={{ height: 56, width: "auto", margin: "0 auto 18px", objectFit: "contain" }} />
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: T.ink }}>Welcome back</h1>
          <p className="mt-2 text-sm" style={{ color: T.ink2 }}>Sign in to continue to MRM Extractor</p>
        </div>
        <form
          onSubmit={submit}
          className="rounded-2xl p-7"
          style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 24px 48px ${T.p4}26` }}
        >
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" disabled={busy} />
          <div className="h-4" />
          <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password" disabled={busy} />
          {err && <Alert>{err}</Alert>}
          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-xl py-3 text-sm font-semibold transition disabled:opacity-60"
            style={{ background: T.ink, color: "#fff", boxShadow: `0 8px 20px ${T.ink}33` }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <button
          onClick={() => setShowGuide(true)}
          className="mt-5 w-full flex items-center justify-center gap-2 text-sm font-semibold transition hover:opacity-80"
          style={{ color: T.ink2 }}
        >
          <IconBook /> New here? Read the guide
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({ token, user, active, onNew, onOpenHistory }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/history`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (r.ok) setRows(d);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { if (active) load(); }, [active]);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const mine = rows.filter((r) => r.email === user.email);
    const todayCount = rows.filter((r) => r.at && new Date(r.at) >= today).length;
    const artists = new Set(rows.map((r) => (r.artist || "").trim().toLowerCase()).filter(Boolean));
    const songs = rows.reduce((sum, r) => sum + (r.songs || 0), 0);
    return {
      total: rows.length,
      mine: mine.length,
      today: todayCount,
      artists: artists.size,
      songs,
    };
  }, [rows, user.email]);

  const recent = rows.slice(0, 5);
  const firstName = (user.email || "there").split("@")[0].split(".")[0];
  const cap = firstName ? firstName[0].toUpperCase() + firstName.slice(1) : "there";

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.ink }}>
            Welcome back, {cap} 👋
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: T.ink2 }}>Your music rights extraction workspace</p>
        </div>
        <button
          onClick={onNew}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold transition flex items-center gap-2"
          style={{ background: T.ink, color: "#fff", boxShadow: `0 6px 16px ${T.ink}33` }}
        >
          <IconPlus /> New Extraction
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Total Extractions" value={stats.total} icon={<IconSparkle />} accent={T.p4} />
        <Stat label="Songs Found" value={stats.songs} icon={<IconMusic />} accent={T.p5} />
        <Stat label="Unique Artists" value={stats.artists} icon={<IconBolt />} accent={T.p4} />
        <Stat label="Today" value={stats.today} icon={<IconCalendar />} accent={T.p5} />
      </div>

      <Card title="Recent Activity" action={<button onClick={onOpenHistory} className="text-xs font-semibold hover:underline" style={{ color: T.ink2 }}>View all →</button>}>
        {loading ? (
          <Muted>Loading…</Muted>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<IconBolt />}
            title="No extractions yet"
            description="Start by extracting an artist catalog from Apple Music and Spotify."
            cta={<button onClick={onNew} className="rounded-lg px-4 py-2 text-sm font-semibold mt-3" style={{ background: T.ink, color: "#fff" }}>Get started</button>}
          />
        ) : (
          <div className="space-y-2">
            {recent.map((r) => {
              const d = r.at ? new Date(r.at) : null;
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-4 rounded-xl px-4 py-3 transition hover:bg-white"
                  style={{ border: `1px solid ${T.borderSoft}` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: T.p1, color: T.ink }}
                    >
                      <IconMusic />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: T.ink }}>{r.artist || "Untitled"}</div>
                      <div className="text-xs truncate" style={{ color: T.ink3 }}>{r.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums" style={{ background: T.p1, color: T.ink }}>
                      {r.songs ?? 0} <span className="font-medium" style={{ color: T.ink3 }}>songs</span>
                    </span>
                    <div className="text-right">
                      <div className="text-xs font-medium" style={{ color: T.ink2 }}>
                        {d ? d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }) : "—"}
                      </div>
                      <div className="text-[11px]" style={{ color: T.ink3 }}>
                        {d ? d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "numeric", minute: "2-digit" }) : ""}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, icon, accent }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 4px 12px ${T.p4}1a` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.ink3 }}>{label}</div>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}66)`, color: T.ink }}
        >
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold tabular-nums tracking-tight" style={{ color: T.ink }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTOR (stepper wizard)
// ─────────────────────────────────────────────────────────────────────────────
function Extractor({ token, prefill }) {
  const [step, setStep] = useState(1);
  const [artist, setArtist] = useState("");
  const [apple, setApple] = useState("");
  const [spotify, setSpotify] = useState("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [stages, setStages] = useState([]);
  const [eta, setEta] = useState("");
  const [enrichProgress, setEnrichProgress] = useState(null);
  const [counts, setCounts] = useState({ apple: 0, spotify: 0 });
  const [mergedCount, setMergedCount] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [downloadReady, setDownloadReady] = useState(false);
  const [error, setError] = useState("");
  const [driveLink, setDriveLink] = useState("");
  const esRef = useRef(null);

  const reset = () => {
    setStage(""); setStages([]); setEta(""); setEnrichProgress(null);
    setCounts({ apple: 0, spotify: 0 }); setMergedCount(null);
    setJobId(null); setDownloadReady(false); setError(""); setDriveLink("");
  };

  const newRun = () => {
    reset();
    setArtist(""); setApple(""); setSpotify("");
    setStep(1);
  };

  const startWith = async (a, ap, sp) => {
    if (!a && !ap && !sp) { setError("Provide artist name or at least one ID."); return; }
    reset();
    setRunning(true);
    setStep(3);
    try {
      const r = await fetch(`${API}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ artist_name: a, apple_ids: ap, spotify_ids: sp }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || "Failed to start");
      const { job_id } = await r.json();
      setJobId(job_id);
      openStream(job_id);
    } catch (e) {
      setError(String(e.message || e));
      setRunning(false);
    }
  };

  const start = () => startWith(artist, apple, spotify);

  useEffect(() => {
    if (!prefill || !prefill.ts) return;
    setArtist(prefill.artist || "");
    setApple(prefill.apple || "");
    setSpotify(prefill.spotify || "");
    if (prefill.autorun && !running) startWith(prefill.artist || "", prefill.apple || "", prefill.spotify || "");
  }, [prefill?.ts]);

  const openStream = (id) => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`${API}/api/stream/${id}?token=${encodeURIComponent(token)}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "stage") setStage(msg.msg);
        else if (msg.type === "log") {
          const line = msg.msg || "";
          const s = line.match(/\[STAGE\]\s+(.+)/i);
          if (s) {
            const text = s[1].trim();
            setStage(text);
            setStages((prev) => {
              const last = prev[prev.length - 1];
              const now = new Date();
              const updated = last && !last.done ? [...prev.slice(0, -1), { ...last, done: true, endAt: now }] : prev;
              return [...updated, { text, startAt: now, done: false }];
            });
          }
          const m = line.match(/\[([^\]]+)\]\s+songs found:\s+(\d+)/i);
          if (m) {
            const label = m[1].toLowerCase();
            const n = parseInt(m[2], 10);
            setCounts((c) => {
              if (label.startsWith("apple")) return { ...c, apple: Math.max(c.apple, n) };
              if (label.startsWith("spotify")) return { ...c, spotify: Math.max(c.spotify, n) };
              return c;
            });
          }
          const e = line.match(/\[ETA\]\s+(.+)/i);
          if (e) setEta(e[1]);
          const p = line.match(/\[Enrich\]\s+(\d+)\/(\d+).*?ETA\s+~?([0-9]+m\s*[0-9]+s)/i);
          if (p) {
            setEnrichProgress({ cur: parseInt(p[1], 10), tot: parseInt(p[2], 10) });
            setEta(`~${p[3]} remaining`);
          }
        } else if (msg.type === "done") {
          setStage("Done");
          if (typeof msg.merged_count === "number") setMergedCount(msg.merged_count);
          if (msg.drive_link) setDriveLink(msg.drive_link);
          setStages((prev) => {
            const now = new Date();
            const closed = prev.map((s) => (s.done ? s : { ...s, done: true, endAt: now }));
            return [...closed, { text: "All done — Excel ready", startAt: now, done: true, endAt: now, final: true }];
          });
          setDownloadReady(true);
          setRunning(false);
          es.close();
        } else if (msg.type === "error") {
          setError(msg.msg); setRunning(false); es.close();
        }
      } catch {}
    };
    es.onerror = () => { es.close(); setRunning(false); };
  };

  const download = () => {
    if (!jobId) return;
    const a = document.createElement("a");
    a.href = `${API}/api/download/${jobId}?token=${encodeURIComponent(token)}`;
    a.click();
  };

  const canNext = artist.trim() || apple.trim() || spotify.trim();

  return (
    <div>
      <Stepper step={step} />

      {step === 1 && (
        <Card title="Artist details" subtitle="Provide an artist name and IDs from Apple Music and Spotify. At least one is required.">
          <div className="space-y-5">
            <Field label="Artist Name" value={artist} onChange={setArtist} placeholder="e.g. Joshua Singh" disabled={running} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Apple Music Artist ID" value={apple} onChange={setApple} placeholder="1456574153" mono disabled={running} />
              <Field label="Spotify Artist ID" value={spotify} onChange={setSpotify} placeholder="38HBNhl3BVneu8qCuG8wW9" mono disabled={running} />
            </div>
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!canNext}
              className="rounded-xl px-6 py-2.5 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              style={{ background: T.ink, color: "#fff" }}
            >
              Next <IconArrowRight />
            </button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="Confirm extraction" subtitle="Review before running. Large catalogs (200+ tracks) can take 4–8 minutes.">
          <div className="rounded-xl p-5" style={{ background: T.surfaceTint, border: `1px solid ${T.borderSoft}` }}>
            <Row label="Artist" value={artist || "—"} />
            <Row label="Apple Music ID" value={apple || "—"} mono />
            <Row label="Spotify ID" value={spotify || "—"} mono />
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <button
              onClick={() => setStep(1)}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold transition flex items-center gap-2"
              style={{ background: T.surface, color: T.ink, border: `1px solid ${T.border}` }}
            >
              <IconArrowLeft /> Back
            </button>
            <button
              onClick={start}
              disabled={running}
              className="rounded-xl px-6 py-2.5 text-sm font-semibold transition disabled:opacity-60 flex items-center gap-2"
              style={{ background: T.ink, color: "#fff", boxShadow: `0 6px 16px ${T.ink}33` }}
            >
              <IconBolt /> Start extraction
            </button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Card title={running ? "Extracting…" : downloadReady ? "Extraction complete" : "Preparing…"} subtitle={running ? "Live progress from the pipeline" : downloadReady ? "Your Excel is ready to download" : ""}>
              {error ? (
                <Alert>{error}</Alert>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <Counter label="Apple Music" value={counts.apple} accent={T.p4} />
                    <Counter label="Spotify" value={counts.spotify} accent={T.p5} />
                    <Counter label="Merged" value={mergedCount ?? "—"} accent={T.ink} />
                  </div>

                  {(eta || enrichProgress) && (
                    <div className="rounded-xl px-4 py-3 mb-5" style={{ background: T.p1, border: `1px solid ${T.borderSoft}` }}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold" style={{ color: T.ink }}>
                          {enrichProgress ? `Enriching ${enrichProgress.cur} / ${enrichProgress.tot} tracks` : "Preparing enrichment…"}
                        </span>
                        {eta && <span className="text-xs font-medium" style={{ color: T.ink2 }}>{eta}</span>}
                      </div>
                      {enrichProgress && (
                        <div className="mt-2 h-1.5 w-full rounded-full overflow-hidden" style={{ background: "#fff" }}>
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.max(2, (enrichProgress.cur / enrichProgress.tot) * 100)}%`,
                              background: `linear-gradient(90deg, ${T.p4}, ${T.p5})`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={download}
                      disabled={!downloadReady}
                      className="flex-1 min-w-[160px] rounded-xl py-3 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{ background: downloadReady ? T.ink : T.p1, color: downloadReady ? "#fff" : T.ink3, boxShadow: downloadReady ? `0 6px 16px ${T.ink}33` : "none" }}
                    >
                      <IconDownload /> Download Excel
                    </button>
                    <button
                      onClick={newRun}
                      className="rounded-xl py-3 px-5 text-sm font-semibold transition flex items-center gap-2"
                      style={{ background: T.surface, color: T.ink, border: `1px solid ${T.border}` }}
                    >
                      <IconRefresh /> New run
                    </button>
                  </div>

                  {driveLink && (
                    <div className="mt-4 rounded-xl px-4 py-3 flex items-center justify-between gap-3" style={{ background: T.p2, border: `1px solid ${T.border}` }}>
                      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: T.ink }}>
                        <IconCheck /> Saved to Google Drive
                      </div>
                      <a href={driveLink} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline" style={{ color: T.ink }}>
                        Open in Drive →
                      </a>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card title="Pipeline">
              {stages.length === 0 ? (
                <Muted>Waiting for first event…</Muted>
              ) : (
                <Timeline stages={stages} running={running} />
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }) {
  const items = [
    { n: 1, label: "Artist" },
    { n: 2, label: "Confirm" },
    { n: 3, label: "Run" },
  ];
  return (
    <div className="mb-6 flex items-center gap-2">
      {items.map((it, i) => {
        const active = step === it.n;
        const done = step > it.n;
        return (
          <div key={it.n} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition"
                style={{
                  background: done ? T.p5 : active ? T.ink : T.surface,
                  color: done || active ? "#fff" : T.ink3,
                  border: active || done ? "none" : `1px solid ${T.border}`,
                }}
              >
                {done ? <IconCheckSmall /> : it.n}
              </div>
              <span className="text-sm font-semibold" style={{ color: active || done ? T.ink : T.ink3 }}>{it.label}</span>
            </div>
            {i < items.length - 1 && <div className="w-12 h-px" style={{ background: done ? T.p5 : T.border }} />}
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 border-b last:border-0" style={{ borderColor: T.borderSoft }}>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.ink3 }}>{label}</span>
      <span className={`text-sm font-semibold text-right ${mono ? "mono" : ""}`} style={{ color: T.ink }}>{value}</span>
    </div>
  );
}

function Counter({ label, value, accent }) {
  return (
    <div className="rounded-xl px-5 py-4 text-center" style={{ background: T.surfaceTint, border: `1px solid ${T.borderSoft}` }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.ink3 }}>{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums tracking-tight" style={{ color: T.ink }}>{value}</div>
      <div className="mt-2 h-1 w-full rounded-full" style={{ background: "rgba(0,0,0,0.04)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: value > 0 ? "100%" : "0%", background: accent, opacity: 0.8 }} />
      </div>
    </div>
  );
}

function Timeline({ stages, running }) {
  return (
    <div className="space-y-1">
      {stages.map((s, i) => {
        const isLast = i === stages.length - 1;
        const isActive = running && isLast && !s.done;
        const isDone = s.done;
        return (
          <div key={i} className="flex items-start gap-3 py-1">
            <div className="flex flex-col items-center" style={{ minWidth: 16 }}>
              <div
                className={isActive ? "animate-pulse" : ""}
                style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: s.final ? T.p5 : isDone ? T.p4 : "#fff",
                  border: `2px solid ${isActive ? T.p5 : isDone ? T.p4 : T.border}`,
                  marginTop: 5,
                }}
              />
              {!isLast && <div style={{ width: 2, flex: 1, minHeight: 16, background: T.border, marginTop: 2 }} />}
            </div>
            <div className="flex-1 pb-2">
              <div className="text-xs font-semibold" style={{ color: T.ink }}>{s.text}</div>
              <div className="text-[10px] mt-0.5" style={{ color: T.ink3 }}>
                {s.startAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "numeric", minute: "2-digit", second: "2-digit" })}
                {s.done && s.endAt && ` • ${fmtDur(s.startAt, s.endAt)}`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fmtDur(start, end) {
  const ms = (end?.getTime?.() || Date.now()) - start.getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────────────────────────────────────
function History({ token, active, onRegenerate }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/history`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Failed to load history");
      setRows(d);
    } catch (e) { setErr(String(e.message || e)); }
    setLoading(false);
  };

  useEffect(() => { if (active) load(); }, [active]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) =>
      (r.artist || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.apple_ids || "").toLowerCase().includes(q) ||
      (r.spotify_ids || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <div>
      <PageHeader title="Download History" subtitle="All extractions across all users" />
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.ink3 }}><IconSearch /></div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artist, user, ID…"
              className="w-full rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none transition"
              style={{ background: T.surfaceTint, border: `1px solid ${T.border}`, color: T.ink }}
            />
          </div>
          <div className="text-xs font-semibold" style={{ color: T.ink3 }}>
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
          </div>
        </div>

        {err && <Alert>{err}</Alert>}
        {loading ? (
          <Muted>Loading…</Muted>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<IconClock />} title="No history yet" description="Once you extract an artist, downloads appear here." />
        ) : (
          <div className="rounded-xl overflow-x-auto" style={{ border: `1px solid ${T.borderSoft}` }}>
            <table className="w-full text-sm" style={{ minWidth: 1100, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: T.p1 }}>
                  <Th>User</Th>
                  <Th>Artist</Th>
                  <Th>Songs</Th>
                  <Th>Apple ID</Th>
                  <Th>Spotify ID</Th>
                  <Th>When</Th>
                  <Th>Drive</Th>
                  <Th right>Action</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const d = r.at ? new Date(r.at) : null;
                  return (
                    <tr key={r.id} className="transition hover:bg-white" style={{ background: i % 2 ? T.surfaceTint : T.surface }}>
                      <Td>{r.email}</Td>
                      <Td bold>{r.artist || "—"}</Td>
                      <Td>
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-md text-xs font-bold tabular-nums" style={{ background: T.p2, color: T.ink }}>
                          {r.songs ?? 0}
                        </span>
                      </Td>
                      <Td mono muted>{r.apple_ids || "—"}</Td>
                      <Td mono muted>{r.spotify_ids || "—"}</Td>
                      <Td muted>
                        <div className="text-xs font-medium">{d ? d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</div>
                        <div className="text-[11px]">{d ? d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }) : ""}</div>
                      </Td>
                      <Td>
                        {r.drive_link ? (
                          <a href={r.drive_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: T.ink }}>
                            <IconExternal /> Open
                          </a>
                        ) : <span className="text-xs" style={{ color: T.ink3 }}>—</span>}
                      </Td>
                      <Td right>
                        <button
                          onClick={() => onRegenerate && onRegenerate(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
                          style={{ background: T.ink, color: "#fff" }}
                          title="Autofill extractor and run again"
                        >
                          <IconRefresh /> Regenerate
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USERS (admin)
// ─────────────────────────────────────────────────────────────────────────────
function Users({ token, currentEmail, active }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ email: "", password: "", role: "user" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Failed to load");
      setUsers(d);
    } catch (e) { setErr(String(e.message || e)); }
    setLoading(false);
  };

  useEffect(() => { if (active) load(); }, [active]);

  const create = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await fetch(`${API}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Create failed");
      setForm({ email: "", password: "", role: "user" });
      load();
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  };

  const del = async (id, email) => {
    if (!confirm(`Delete ${email}?`)) return;
    try {
      const r = await fetch(`${API}/api/admin/users/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Delete failed");
      load();
    } catch (e) { setErr(String(e.message || e)); }
  };

  return (
    <div>
      <PageHeader title="Users" subtitle="Manage who can access the extractor" />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2">
          <Card title="Add user">
            <form onSubmit={create} className="space-y-4">
              <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="user@example.com" type="email" disabled={busy} />
              <Field label="Password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="At least 6 characters" type="password" disabled={busy} />
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: T.ink2 }}>Role</span>
                <div className="grid grid-cols-2 gap-2">
                  {["user", "admin"].map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setForm({ ...form, role: r })}
                      className="rounded-xl py-2.5 text-sm font-semibold transition"
                      style={{
                        background: form.role === r ? T.ink : T.surface,
                        color: form.role === r ? "#fff" : T.ink,
                        border: `1px solid ${form.role === r ? T.ink : T.border}`,
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {err && <Alert>{err}</Alert>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl py-3 text-sm font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: T.ink, color: "#fff" }}
              >
                <IconPlus /> {busy ? "Adding…" : "Add user"}
              </button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card title={`All users (${users.length})`}>
            {loading ? (
              <Muted>Loading…</Muted>
            ) : (
              <div className="rounded-xl overflow-x-auto" style={{ border: `1px solid ${T.borderSoft}` }}>
                <table className="w-full text-sm" style={{ minWidth: 540, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: T.p1 }}>
                      <Th>Email</Th>
                      <Th>Role</Th>
                      <Th>Created</Th>
                      <Th right>Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={u.id} className="transition hover:bg-white" style={{ background: i % 2 ? T.surfaceTint : T.surface }}>
                        <Td bold>{u.email}</Td>
                        <Td>
                          <span
                            className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
                            style={{ background: u.role === "admin" ? T.ink : T.p3, color: u.role === "admin" ? "#fff" : T.ink }}
                          >
                            {u.role}
                          </span>
                        </Td>
                        <Td muted>{u.created_at ? new Date(u.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</Td>
                        <Td right>
                          {u.email === currentEmail ? (
                            <span className="text-xs" style={{ color: T.ink3 }}>(you)</span>
                          ) : (
                            <button
                              onClick={() => del(u.id, u.email)}
                              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
                              style={{ background: T.dangerBg, color: T.danger, border: `1px solid ${T.dangerBorder}` }}
                            >
                              Delete
                            </button>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GUIDE
// ─────────────────────────────────────────────────────────────────────────────
function Guide({ onNew, ctaLabel }) {
  const cta = ctaLabel || "Try it now";
  const sections = [
    { id: "overview", label: "What is this app?" },
    { id: "login", label: "Signing in" },
    { id: "ids", label: "Finding Artist IDs" },
    { id: "extract", label: "Running an extraction" },
    { id: "excel", label: "Understanding the Excel" },
    { id: "history", label: "History & re-running" },
    { id: "drive", label: "Google Drive backup" },
    { id: "faq", label: "FAQ & troubleshooting" },
  ];

  const scrollTo = (id) => {
    const el = document.getElementById(`guide-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <PageHeader title="Guide" subtitle="Everything you need to know to use MRM Extractor — from zero." />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* sticky table of contents */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <Card>
              <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: T.ink3 }}>On this page</div>
              <div className="space-y-1">
                {sections.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className="w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-white"
                    style={{ color: T.ink2 }}
                  >
                    <span className="font-bold mr-1.5" style={{ color: T.ink3 }}>{i + 1}.</span>{s.label}
                  </button>
                ))}
              </div>
              <button
                onClick={onNew}
                className="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2"
                style={{ background: T.ink, color: "#fff" }}
              >
                <IconBolt /> {cta}
              </button>
            </Card>
          </div>
        </div>

        {/* content */}
        <div className="lg:col-span-3 space-y-5">
          <GSection id="overview" n={1} title="What is this app?">
            <P>
              <b>MRM Extractor</b> pulls an artist's full song catalog from <b>Apple Music</b> and <b>Spotify</b>,
              enriches each track with credits (composer, lyricist, producer, label, ISRC and more) from public
              databases, removes duplicates, and gives you a clean, ready-to-use <b>Excel file</b>.
            </P>
            <P>In plain terms: you give it an artist, it gives you a spreadsheet of every song that artist has, with the rights metadata filled in.</P>
            <Callout tone="info" title="Who is it for?">
              Anyone on the Music Rights Management team who needs a song catalog quickly — no technical skills required.
              You only need two things per artist: their <b>Apple Music Artist ID</b> and their <b>Spotify Artist ID</b>.
            </Callout>
          </GSection>

          <GSection id="login" n={2} title="Signing in">
            <Steps items={[
              <>Open the app in your browser. You'll see the <b>Welcome back</b> screen.</>,
              <>Enter the <b>email</b> and <b>password</b> your admin gave you.</>,
              <>Click <b>Sign in</b>. You'll land on the <b>Dashboard</b>.</>,
            ]} />
            <Callout tone="warn" title="“You are not a part of this organisation”">
              If you see this message, your email isn't registered yet. Ask an <b>admin</b> to add you under the
              <b> Users</b> tab. Only admins can create accounts — there is no public sign-up.
            </Callout>
            <P><b>Two roles exist:</b></P>
            <BulletList items={[
              <><b>User</b> — can run extractions, view history, download files.</>,
              <><b>Admin</b> — everything a user can do, plus add/remove users.</>,
            ]} />
          </GSection>

          <GSection id="ids" n={3} title="Finding the Artist IDs">
            <P>This is the most important step. Each platform identifies an artist with a unique ID buried in the page URL. Here's exactly how to get them.</P>

            <SubHead>🍎 Apple Music Artist ID</SubHead>
            <Steps items={[
              <>Go to <Mono>music.apple.com</Mono> and search the artist.</>,
              <>Open the artist's page. Look at the browser address bar.</>,
              <>The URL looks like:<br/><Mono>music.apple.com/in/artist/joshua-singh/<Hi>1456574153</Hi></Mono></>,
              <>The number at the end — <Hi>1456574153</Hi> — is the Apple Music Artist ID. Copy it.</>,
            ]} />

            <SubHead>🟢 Spotify Artist ID</SubHead>
            <Steps items={[
              <>Go to <Mono>open.spotify.com</Mono> and search the artist.</>,
              <>Open the artist's page. Look at the address bar.</>,
              <>The URL looks like:<br/><Mono>open.spotify.com/artist/<Hi>38HBNhl3BVneu8qCuG8wW9</Hi></Mono></>,
              <>The code after <Mono>/artist/</Mono> — <Hi>38HBNhl3BVneu8qCuG8wW9</Hi> — is the Spotify Artist ID. Copy it.</>,
              <>Tip: in the Spotify desktop app, click <b>… → Share → Copy link to artist</b>, then take the ID from the link.</>,
            ]} />

            <Callout tone="warn" title="Always use the ARTIST page — not a song or album">
              Make sure the URL says <Mono>/artist/</Mono>. If it says <Mono>/song/</Mono>, <Mono>/track/</Mono>, or
              <Mono>/album/</Mono>, you've copied the wrong ID and the extraction will fail or be incomplete.
            </Callout>
          </GSection>

          <GSection id="extract" n={4} title="Running an extraction">
            <P>The Extractor is a simple 3-step wizard. The <b>artist name</b> is optional but recommended — it makes the output file easier to identify and improves matching.</P>
            <Steps items={[
              <>Go to the <b>Extractor</b> tab (or click <b>New Extraction</b> on the Dashboard).</>,
              <><b>Step 1 — Artist:</b> type the artist name, paste the Apple Music ID and the Spotify ID. Click <b>Next</b>.</>,
              <><b>Step 2 — Confirm:</b> review the details. If correct, click <b>Start extraction</b>. To fix something, click <b>Back</b>.</>,
              <><b>Step 3 — Run:</b> watch live progress. Two counters show songs found on Apple Music and Spotify. The right-side <b>Pipeline</b> panel lists each step as it happens.</>,
              <>When it finishes, click <b>Download Excel</b>. The file also auto-saves to Google Drive.</>,
            ]} />
            <Callout tone="info" title="How long does it take?">
              Small artists (under ~30 songs) finish in under a minute. Large catalogs (200+ songs) can take
              <b> 4–8 minutes</b> because credit data is fetched one track at a time from rate-limited public sources.
              The ETA shown on screen is your best estimate — leave the tab open while it runs.
            </Callout>
          </GSection>

          <GSection id="excel" n={5} title="Understanding the Excel file">
            <P>The downloaded workbook has <b>4 sheets</b>:</P>
            <BulletList items={[
              <><b>Apple Music Songs</b> — everything found via the Apple Music ID.</>,
              <><b>Spotify Songs</b> — everything found via the Spotify ID.</>,
              <><b>Specific Songs</b> — results matched by artist name across both platforms.</>,
              <><b>Merged Songs</b> — the final, de-duplicated master list. <b>This is the one you usually want.</b></>,
            ]} />
            <P>The <b>Merged Songs</b> sheet combines both platforms and removes duplicates using the ISRC code (a song's global fingerprint). Where the same song appears on both, the extra values are kept in the <b>“(Duplicates)”</b> columns next to each field so nothing is lost.</P>
            <Callout tone="info" title="What the “Songs” number means">
              The song count you see in History, the Dashboard, and the weekly email is the number of <b>unique songs in the Merged sheet</b> — the true catalog size after de-duplication.
            </Callout>
          </GSection>

          <GSection id="history" n={6} title="History & re-running">
            <P>The <b>History</b> tab logs every download — who ran it, which artist, the IDs used, how many songs, when (in IST), and a link to the Drive copy.</P>
            <Steps items={[
              <>Use the <b>search box</b> to filter by artist, user, or ID.</>,
              <>Click <b>Open</b> in the Drive column to view that file in Google Drive.</>,
              <>Click <b>Regenerate</b> on any row to instantly re-run that exact extraction — it auto-fills the Extractor and starts immediately. No re-typing IDs.</>,
            ]} />
          </GSection>

          <GSection id="drive" n={7} title="Google Drive backup">
            <P>Every file you download is automatically uploaded to a shared <b>Google Drive folder</b>. You don't have to do anything — when the upload succeeds you'll see a green <b>“Saved to Google Drive”</b> banner with an <b>Open in Drive</b> link.</P>
            <P>This means files are never lost even if your computer's download folder is cleared. The same Drive link appears later in the History tab.</P>
          </GSection>

          <GSection id="faq" n={8} title="FAQ & troubleshooting">
            <FAQ q="The extraction is stuck / taking very long.">
              Large artists genuinely take several minutes — credits are fetched one song at a time from rate-limited public databases. As long as the counters or pipeline are still updating, it's working. Keep the tab open.
            </FAQ>
            <FAQ q="Some songs have blank composer / lyricist.">
              Spotify does not publish those credits at all. We fill them from public databases (MusicBrainz, Deezer) via the song's ISRC, but coverage isn't 100% — especially for independent or regional artists. Blank means the data simply isn't publicly available.
            </FAQ>
            <FAQ q="I get “Resource not found” messages in the logs.">
              Harmless. While discovering collaborators the app probes IDs that may not exist in the India store. These are skipped automatically and don't affect your results.
            </FAQ>
            <FAQ q="The Spotify section returns nothing.">
              Double-check you pasted the <b>Artist</b> ID (URL contains <Mono>/artist/</Mono>), not a track or album ID. Also confirm there are no extra spaces.
            </FAQ>
            <FAQ q="How do I add a new team member?">
              Only admins can. Go to the <b>Users</b> tab → fill email, password, and role → <b>Add user</b>. Share those credentials with the new person.
            </FAQ>
            <FAQ q="What's the weekly email?">
              Every <b>Saturday at 9:00 AM IST</b>, a digest of the week's extractions (totals + a full table) is emailed automatically. No action needed.
            </FAQ>
          </GSection>

          <div className="rounded-2xl p-6 text-center" style={{ background: T.ink, color: "#fff" }}>
            <div className="text-lg font-bold">Ready to extract your first artist?</div>
            <p className="text-sm mt-1" style={{ color: "#cfe6c2" }}>Grab the Apple Music and Spotify Artist IDs and you're set.</p>
            <button
              onClick={onNew}
              className="mt-4 rounded-xl px-6 py-2.5 text-sm font-semibold inline-flex items-center gap-2"
              style={{ background: "#fff", color: T.ink }}
            >
              <IconBolt /> {cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GSection({ id, n, title, children }) {
  return (
    <div id={`guide-${id}`} style={{ scrollMarginTop: 90 }}>
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0" style={{ background: T.p2, color: T.ink }}>{n}</div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: T.ink }}>{title}</h2>
        </div>
        <div className="space-y-3">{children}</div>
      </Card>
    </div>
  );
}

function P({ children }) {
  return <p className="text-sm leading-relaxed" style={{ color: T.ink2 }}>{children}</p>;
}

function SubHead({ children }) {
  return <h3 className="text-sm font-bold mt-5 mb-1" style={{ color: T.ink }}>{children}</h3>;
}

function Steps({ items }) {
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: T.p3, color: T.ink }}>{i + 1}</span>
          <span className="text-sm leading-relaxed pt-0.5" style={{ color: T.ink2 }}>{it}</span>
        </li>
      ))}
    </ol>
  );
}

function BulletList({ items }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: T.p4 }} />
          <span className="text-sm leading-relaxed" style={{ color: T.ink2 }}>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({ tone = "info", title, children }) {
  const styles = tone === "warn"
    ? { bg: "#fffbeb", border: "#fde68a", ink: "#92400e", icon: <IconAlert /> }
    : { bg: T.p1, border: T.border, ink: T.ink, icon: <IconInfo /> };
  return (
    <div className="rounded-xl px-4 py-3 flex gap-3" style={{ background: styles.bg, border: `1px solid ${styles.border}` }}>
      <span style={{ color: styles.ink }} className="shrink-0 mt-0.5">{styles.icon}</span>
      <div>
        {title && <div className="text-sm font-bold mb-0.5" style={{ color: styles.ink }}>{title}</div>}
        <div className="text-sm leading-relaxed" style={{ color: styles.ink }}>{children}</div>
      </div>
    </div>
  );
}

function FAQ({ q, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.borderSoft}` }}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white">
        <span className="text-sm font-semibold" style={{ color: T.ink }}>{q}</span>
        <span style={{ color: T.ink3, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
      {open && <div className="px-4 pb-3 text-sm leading-relaxed" style={{ color: T.ink2 }}>{children}</div>}
    </div>
  );
}

function Mono({ children }) {
  return <span className="mono text-xs px-1.5 py-0.5 rounded" style={{ background: T.p1, color: T.ink }}>{children}</span>;
}

function Hi({ children }) {
  return <b style={{ color: T.ink, background: "#fde68a", padding: "0 3px", borderRadius: 3 }}>{children}</b>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: T.ink }}>{title}</h1>
        {subtitle && <p className="mt-1 text-sm" style={{ color: T.ink2 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Card({ title, subtitle, action, children }) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 4px 16px ${T.p4}1f` }}
    >
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-bold tracking-tight" style={{ color: T.ink }}>{title}</h2>}
            {subtitle && <p className="text-sm mt-0.5" style={{ color: T.ink2 }}>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, disabled, type = "text", mono }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (show ? "text" : "password") : type;
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: T.ink2 }}>{label}</span>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-xl outline-none px-3.5 py-2.5 text-sm transition ${mono ? "mono" : ""} ${isPassword ? "pr-11" : ""}`}
          style={{ background: T.surfaceTint, border: `1px solid ${T.border}`, color: T.ink }}
          onFocus={(e) => { e.target.style.borderColor = T.ink; e.target.style.boxShadow = `0 0 0 4px ${T.p3}66`; e.target.style.background = "#fff"; }}
          onBlur={(e) => { e.target.style.borderColor = T.border; e.target.style.boxShadow = "none"; e.target.style.background = T.surfaceTint; }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition hover:bg-black/5"
            style={{ color: T.ink3 }}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <IconEyeOff /> : <IconEye />}
          </button>
        )}
      </div>
    </label>
  );
}

function Alert({ children }) {
  return (
    <div className="mt-4 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2" style={{ background: T.dangerBg, border: `1px solid ${T.dangerBorder}`, color: T.danger }}>
      <IconAlert />
      <span>{children}</span>
    </div>
  );
}

function Muted({ children }) {
  return <div className="text-sm py-4" style={{ color: T.ink3 }}>{children}</div>;
}

function EmptyState({ icon, title, description, cta }) {
  return (
    <div className="py-12 text-center">
      <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: T.p1, color: T.ink }}>
        {icon}
      </div>
      <div className="text-base font-bold" style={{ color: T.ink }}>{title}</div>
      {description && <div className="mt-1 text-sm max-w-sm mx-auto" style={{ color: T.ink2 }}>{description}</div>}
      {cta}
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th
      className={`px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${right ? "text-right" : "text-left"}`}
      style={{ color: T.ink2 }}
    >
      {children}
    </th>
  );
}

function Td({ children, right, bold, mono, muted }) {
  return (
    <td
      className={`px-4 py-3 whitespace-nowrap ${right ? "text-right" : ""} ${mono ? "mono text-xs" : "text-sm"} ${bold ? "font-semibold" : ""}`}
      style={{ color: muted ? T.ink2 : T.ink }}
    >
      {children}
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ICONS (inline SVG, no deps)
// ─────────────────────────────────────────────────────────────────────────────
const SVG = ({ children, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">{children}</svg>
);
const IconHome = () => <SVG><path d="M2 7l6-5 6 5v6a1 1 0 0 1-1 1h-3v-4H6v4H3a1 1 0 0 1-1-1V7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></SVG>;
const IconBolt = () => <SVG><path d="M9 2L3 9h4l-1 5 6-7H8l1-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></SVG>;
const IconClock = () => <SVG><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></SVG>;
const IconUsers = () => <SVG><circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" /><path d="M2 13.5c.5-2 2-3 4-3s3.5 1 4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="11" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.4" /></SVG>;
const IconUser = () => <SVG><circle cx="8" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" /><path d="M3 13.5c.7-2.5 2.5-3.5 5-3.5s4.3 1 5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></SVG>;
const IconPlus = () => <SVG><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></SVG>;
const IconCheck = () => <SVG size={18}><path d="M3.5 9l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconCheckSmall = () => <SVG size={12}><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconRefresh = () => <SVG><path d="M3 8a5 5 0 0 1 8.5-3.5L13 6M13 8a5 5 0 0 1-8.5 3.5L3 10M13 3v3h-3M3 13v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconDownload = () => <SVG><path d="M8 2v8m0 0l-3-3m3 3l3-3M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconArrowRight = () => <SVG><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconArrowLeft = () => <SVG><path d="M13 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconSearch = () => <SVG><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></SVG>;
const IconExternal = () => <SVG><path d="M6 3H3v10h10V10M9 3h4v4M7 9l6-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconLogout = () => <SVG><path d="M10 11l3-3-3-3M6 8h7M9 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconAlert = () => <SVG><path d="M8 2l6 11H2L8 2zM8 6v3M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconSparkle = () => <SVG><path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M4 12l2-2M10 6l2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></SVG>;
const IconCalendar = () => <SVG><rect x="2.5" y="3.5" width="11" height="10" rx="1" stroke="currentColor" strokeWidth="1.4" /><path d="M2.5 6.5h11M5 2v3M11 2v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></SVG>;
const IconMusic = () => <SVG><path d="M6 12V4l7-1v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.5" /></SVG>;
const IconBook = () => <SVG><path d="M2.5 3.5A1 1 0 0 1 3.5 3H7a1.5 1.5 0 0 1 1 .5 1.5 1.5 0 0 1 1-.5h3.5a1 1 0 0 1 1 .5v8a1 1 0 0 1-1 .5H9a1.5 1.5 0 0 0-1 .5 1.5 1.5 0 0 0-1-.5H3.5a1 1 0 0 1-1-.5v-8zM8 3.5v9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconInfo = () => <SVG><circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" /><path d="M8 7.2v3.3M8 5.2v.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></SVG>;
const IconEye = () => <SVG><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" /></SVG>;
const IconEyeOff = () => <SVG><path d="M6.3 6.3A2 2 0 0 0 8 10a2 2 0 0 0 1.7-1M2.5 4.5C1.4 5.6 1 8 1 8s2.5 4.5 7 4.5c1.2 0 2.3-.3 3.2-.8M6.5 3.6A6.6 6.6 0 0 1 8 3.5C12.5 3.5 15 8 15 8a13 13 0 0 1-1.7 2.3M2 2l12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
