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

  // Password-reset deep link: ?reset=<token> -> show the reset screen.
  const [resetToken, setResetToken] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("reset") || ""; }
    catch { return ""; }
  });
  const clearReset = () => {
    setResetToken("");
    try { window.history.replaceState({}, "", window.location.pathname); } catch {}
  };
  if (resetToken) return <ResetPassword token={resetToken} onDone={clearReset} />;

  if (!token || !user) return <Login onLogin={saveAuth} />;

  return (
    <div className="min-h-screen w-full">
      <Navbar user={user} page={page} setPage={setPage} onLogout={logout} />
      <main className="w-full px-4 md:px-6 py-6">
        <div className="w-full">
          <div className="fade-in" style={{ display: page === "dashboard" ? "block" : "none" }}>
            <Dashboard token={token} user={user} active={page === "dashboard"} onNew={goExtract} onOpenHistory={() => setPage("history")} />
          </div>
          <div className="fade-in" style={{ display: page === "extract" ? "block" : "none" }}>
            <Extractor token={token} prefill={prefill} />
          </div>
          <div className="fade-in" style={{ display: page === "merge" ? "block" : "none" }}>
            <MergeTool token={token} user={user} active={page === "merge"} />
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
// CREDIT — fixed bottom-right badge, shown on every screen (login included).
// pointer-events-none so it can never intercept clicks on content beneath it.
// ─────────────────────────────────────────────────────────────────────────────
export function Credit() {
  return (
    <div
      className="fixed bottom-3 right-3 z-50 pointer-events-none select-none rounded-full px-3 py-1.5 text-xs font-medium"
      style={{
        color: T.ink3,
        background: "rgba(255, 255, 255, 0.7)",
        backdropFilter: "blur(16px)",
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      Developed by RDJ V.3.0.0
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
    { id: "merge", label: "Song Merge", icon: <IconMerge /> },
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
      <div className="w-full px-4 md:px-6 h-16 flex items-center justify-between">
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
  const [mode, setMode] = useState("signin"); // "signin" | "forgot"
  const [sent, setSent] = useState(false);

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

  const submitForgot = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await fetch(`${API}/api/auth/forgot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Could not send reset email");
      setSent(true);
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(false); }
  };

  const backToSignin = () => { setMode("signin"); setErr(""); setSent(false); };

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
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: T.ink }}>
            {mode === "forgot" ? "Forgot password" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm" style={{ color: T.ink2 }}>
            {mode === "forgot"
              ? "Enter your email and we'll send you a reset link"
              : "Sign in to continue to MRM Extractor"}
          </p>
        </div>

        {mode === "signin" ? (
          <form
            onSubmit={submit}
            className="rounded-2xl p-7"
            style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 24px 48px ${T.p4}26` }}
          >
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" disabled={busy} />
            <div className="h-4" />
            <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password" disabled={busy} />
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={() => { setMode("forgot"); setErr(""); }}
                className="text-xs font-semibold transition hover:opacity-80"
                style={{ color: T.ink2 }}
              >
                Forgot password?
              </button>
            </div>
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
        ) : (
          <form
            onSubmit={submitForgot}
            className="rounded-2xl p-7"
            style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 24px 48px ${T.p4}26` }}
          >
            {sent ? (
              <div className="text-center py-4">
                <div
                  className="mx-auto mb-4 flex items-center justify-center rounded-full"
                  style={{ width: 48, height: 48, background: T.p2, color: T.ink }}
                >
                  <IconMail />
                </div>
                <p className="text-sm font-medium" style={{ color: T.ink }}>
                  If an account exists for <b>{email}</b>, a reset link is on its way.
                </p>
                <p className="mt-2 text-xs" style={{ color: T.ink3 }}>
                  Check your inbox (and spam). The link expires in 30 minutes.
                </p>
              </div>
            ) : (
              <>
                <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" disabled={busy} />
                {err && <Alert>{err}</Alert>}
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-6 w-full rounded-xl py-3 text-sm font-semibold transition disabled:opacity-60"
                  style={{ background: T.ink, color: "#fff", boxShadow: `0 8px 20px ${T.ink}33` }}
                >
                  {busy ? "Sending…" : "Send reset link"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={backToSignin}
              className="mt-4 w-full flex items-center justify-center gap-2 text-sm font-semibold transition hover:opacity-80"
              style={{ color: T.ink2 }}
            >
              <IconArrowLeft /> Back to sign in
            </button>
          </form>
        )}

        {mode === "signin" && (
          <button
            onClick={() => setShowGuide(true)}
            className="mt-5 w-full flex items-center justify-center gap-2 text-sm font-semibold transition hover:opacity-80"
            style={{ color: T.ink2 }}
          >
            <IconBook /> New here? Read the guide
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESET PASSWORD (deep link ?reset=<token>)
// ─────────────────────────────────────────────────────────────────────────────
function ResetPassword({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    if (password !== confirm) { setErr("Passwords do not match"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/auth/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Could not reset password");
      setDone(true);
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-md fade-in">
        <div className="mb-8 text-center">
          <img src="/Original%20on%20transparent.png" alt="MRM" style={{ height: 56, width: "auto", margin: "0 auto 18px", objectFit: "contain" }} />
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: T.ink }}>
            {done ? "Password updated" : "Set a new password"}
          </h1>
          <p className="mt-2 text-sm" style={{ color: T.ink2 }}>
            {done ? "You can now sign in with your new password" : "Choose a strong password for your account"}
          </p>
        </div>
        <div
          className="rounded-2xl p-7"
          style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 24px 48px ${T.p4}26` }}
        >
          {done ? (
            <div className="text-center py-4">
              <div
                className="mx-auto mb-4 flex items-center justify-center rounded-full"
                style={{ width: 48, height: 48, background: T.p2, color: T.ink }}
              >
                <IconCheck />
              </div>
              <button
                onClick={onDone}
                className="mt-2 w-full rounded-xl py-3 text-sm font-semibold transition"
                style={{ background: T.ink, color: "#fff", boxShadow: `0 8px 20px ${T.ink}33` }}
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <Field label="New password" value={password} onChange={setPassword} placeholder="At least 6 characters" type="password" disabled={busy} />
              <div className="h-4" />
              <Field label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" type="password" disabled={busy} />
              {err && <Alert>{err}</Alert>}
              <button
                type="submit"
                disabled={busy}
                className="mt-6 w-full rounded-xl py-3 text-sm font-semibold transition disabled:opacity-60"
                style={{ background: T.ink, color: "#fff", boxShadow: `0 8px 20px ${T.ink}33` }}
              >
                {busy ? "Updating…" : "Update password"}
              </button>
              <button
                type="button"
                onClick={onDone}
                className="mt-4 w-full flex items-center justify-center gap-2 text-sm font-semibold transition hover:opacity-80"
                style={{ color: T.ink2 }}
              >
                <IconArrowLeft /> Back to sign in
              </button>
            </form>
          )}
        </div>
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
  const [queued, setQueued] = useState(false);
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
    setQueued(false);
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
            // The backend emits this when the job is waiting for a free slot.
            if (/waiting in queue/i.test(text)) {
              setQueued(true);
            } else {
              // Any other stage means the job has started running -> leave queue.
              setQueued(false);
              setStages((prev) => {
                const last = prev[prev.length - 1];
                const now = new Date();
                const updated = last && !last.done ? [...prev.slice(0, -1), { ...last, done: true, endAt: now }] : prev;
                return [...updated, { text, startAt: now, done: false }];
              });
            }
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
            <Card
              title={queued ? "Waiting in queue…" : running ? "Extracting…" : downloadReady ? "Extraction complete" : "Preparing…"}
              subtitle={queued ? "The server is busy with other extractions" : running ? "Live progress from the pipeline" : downloadReady ? "Your Excel is ready to download" : ""}
            >
              {error ? (
                <Alert>{error}</Alert>
              ) : (
                <>
                  {queued && (
                    <div
                      className="rounded-xl px-4 py-3.5 mb-5 flex items-center gap-3"
                      style={{ background: T.p1, border: `1px solid ${T.border}` }}
                    >
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${T.ink} transparent ${T.ink} ${T.ink}` }} />
                      <div className="text-sm">
                        <div className="font-semibold" style={{ color: T.ink }}>You're in the queue — please wait</div>
                        <div className="text-xs mt-0.5" style={{ color: T.ink2 }}>
                          Your extraction will start automatically as soon as a slot is free. Keep this tab open.
                        </div>
                      </div>
                    </div>
                  )}

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
            <div className="lg:sticky lg:top-24">
              <Card title="Pipeline">
                {stages.length === 0 ? (
                  <Muted>{queued ? "Queued — waiting for a free slot…" : "Waiting for first event…"}</Muted>
                ) : (
                  <Timeline stages={stages} running={running} />
                )}
              </Card>
            </div>
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
    <div className="space-y-1 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 16rem)" }}>
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
// SONG MERGE — upload an Excel, merge by ISRC, review song-level suggestions
// ─────────────────────────────────────────────────────────────────────────────
const AMBER = { bg: "#FEF3C7", ink: "#92400E", border: "#FDE68A" };
const RED = { bg: "#FEE2E2", ink: "#991B1B", border: "#FECACA", row: "#FFF5F5" };

function RecordFlags({ r }) {
  return (
    <>
      {r.client_credited === false && <span className="ml-2 align-middle"><Pill bg={RED.bg} fg={RED.ink} small>Client not credited</Pill></span>}
      {r.isrc_split && <span className="ml-2 align-middle"><Pill bg={AMBER.bg} fg={AMBER.ink} small>Same ISRC, different writers</Pill></span>}
    </>
  );
}

function ClientNames({ names, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  if (!editing) {
    return (
      <button
        onClick={() => { setVal(names.join(", ")); setEditing(true); }}
        className="inline-flex items-center gap-1 hover:underline"
        title="Names that count as the client being credited"
      >
        client credited as <b style={{ color: T.ink }}>{names.join(", ") || "—"}</b> <span className="text-xs">✎</span>
      </button>
    );
  }
  return (
    <form
      className="inline-flex items-center gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave(val.split(",").map((x) => x.trim()).filter(Boolean));
        setSaving(false);
        setEditing(false);
      }}
    >
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Names, comma separated"
        className="rounded-lg px-2 py-1 text-sm outline-none w-72"
        style={{ background: T.surface, color: T.ink, border: `1px solid ${T.ink2}` }}
      />
      <button type="submit" disabled={saving} className="rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50" style={{ background: T.ink, color: "#fff" }}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs font-semibold hover:underline" style={{ color: T.ink2 }}>Cancel</button>
    </form>
  );
}

const TYPE_COLORS = {
  "Original / Re-release": [T.p2, T.ink],
  Remix: ["#E0E7FF", "#3730A3"],
  Lofi: ["#EDE9FE", "#5B21B6"],
  Jhankar: ["#FCE7F3", "#9D174D"],
  Live: ["#FFEDD5", "#9A3412"],
  Instrumental: ["#E0F2FE", "#075985"],
};

const fmtN = (n) => Number(n || 0).toLocaleString("en-IN");

const LAST_MERGE_KEY = "mrm_merge_project";

// decisions as stored on the server ({status, records}) <-> UI state ({status, excluded})
function decisionsFromServer(saved, suggestions) {
  const out = {};
  suggestions.forEach((s) => {
    const d = saved?.[s.id];
    if (!d) return;
    const keep = new Set(d.records || []);
    out[s.id] = {
      status: d.status,
      excluded: d.status === "accepted" ? s.records.map((r) => r.id).filter((id) => !keep.has(id)) : [],
    };
  });
  return out;
}

function decisionsToServer(dec, suggestions) {
  const out = {};
  suggestions.forEach((s) => {
    const d = dec[s.id];
    if (!d || d.status === "pending") return;
    out[s.id] = { status: d.status, records: s.records.map((r) => r.id).filter((id) => !d.excluded.includes(id)) };
  });
  return out;
}

function MergeTool({ token, user, active }) {
  const [client, setClient] = useState("");
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);
  const [project, setProject] = useState(null);
  const [dec, setDec] = useState({}); // suggestion id -> { status, excluded: [record ids] }
  const [tab, setTab] = useState("suggestions");
  const [downloading, setDownloading] = useState(false);
  const [saveState, setSaveState] = useState("saved"); // saved | saving | error
  const [isrcFilter, setIsrcFilter] = useState("all");
  const [projects, setProjects] = useState(null);
  const inputRef = useRef(null);
  const loadedRef = useRef(false); // skip autosave right after loading a project
  const autoOpened = useRef(false);

  const auth = { Authorization: `Bearer ${token}` };

  const loadProjects = async () => {
    try {
      const r = await fetch(`${API}/api/merge/projects`, { headers: auth });
      const d = await r.json().catch(() => []);
      if (!r.ok) throw new Error(d.detail || "Could not load saved merges");
      setProjects(d);
    } catch (e) { setErr(String(e.message || e)); setProjects([]); }
  };

  const show = (d) => {
    loadedRef.current = true;
    setData(d);
    setProject(d.project);
    setDec(decisionsFromServer(d.decisions, [...d.suggestions, ...(d.conflicts || [])]));
    setTab(d.suggestions.length ? "suggestions" : "isrc");
    setSaveState("saved");
    try { localStorage.setItem(LAST_MERGE_KEY, d.project.id); } catch { /* storage unavailable */ }
  };

  const openProject = async (id, sheet = "") => {
    setBusy(true); setErr("");
    try {
      const qs = sheet ? `?sheet=${encodeURIComponent(sheet)}` : "";
      const r = await fetch(`${API}/api/merge/projects/${id}${qs}`, { headers: auth });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Could not open this merge");
      show(d);
    } catch (e) {
      setErr(String(e.message || e));
      try { localStorage.removeItem(LAST_MERGE_KEY); } catch { /* storage unavailable */ }
    }
    setBusy(false);
  };

  const analyze = async (f) => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("client_name", client.trim());
      const r = await fetch(`${API}/api/merge/analyze`, { method: "POST", headers: auth, body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Could not analyze the file");
      show(d);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  };

  const pick = (f) => {
    if (!f) return;
    if (!client.trim()) { setErr("Enter the client name first."); return; }
    if (!/\.xlsx$/i.test(f.name)) { setErr("Please upload an Excel .xlsx file."); return; }
    setFile(f);
    analyze(f);
  };

  const closeProject = () => {
    try { localStorage.removeItem(LAST_MERGE_KEY); } catch { /* storage unavailable */ }
    setData(null); setProject(null); setDec({}); setErr(""); setFile(null); setClient("");
    loadProjects();
  };

  const removeProject = async (p) => {
    if (!window.confirm(`Delete the merge for "${p.client}" (${p.file_name})? Its files move to the Drive trash.`)) return;
    setProjects((list) => (list || []).filter((x) => x.id !== p.id));
    try {
      const r = await fetch(`${API}/api/merge/projects/${p.id}`, { method: "DELETE", headers: auth });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Delete failed");
    } catch (e) {
      setErr(String(e.message || e));
      loadProjects();
    }
  };

  // First visit: reopen the merge that was open before a refresh, and list saved merges
  useEffect(() => {
    if (!active || autoOpened.current) return;
    autoOpened.current = true;
    let last = "";
    try { last = localStorage.getItem(LAST_MERGE_KEY) || ""; } catch { /* storage unavailable */ }
    if (last) openProject(last);
    loadProjects();
  });

  // Autosave decisions to Drive (debounced)
  useEffect(() => {
    if (!data || !project) return undefined;
    if (loadedRef.current) { loadedRef.current = false; return undefined; }
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        const r = await fetch(`${API}/api/merge/projects/${project.id}/decisions`, {
          method: "PUT",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ decisions: decisionsToServer(dec, [...data.suggestions, ...(data.conflicts || [])]) }),
        });
        setSaveState(r.ok ? "saved" : "error");
      } catch { setSaveState("error"); }
    }, 800);
    return () => clearTimeout(t);
  }, [dec]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = (ids, status) => setDec((p) => {
    const n = { ...p };
    ids.forEach((id) => { n[id] = { excluded: [], ...n[id], status }; });
    return n;
  });

  const setExcluded = (sid, excluded) => setDec((p) => ({
    ...p, [sid]: { status: "pending", ...p[sid], excluded },
  }));

  const counts = useMemo(() => tallyDecisions(data?.suggestions || [], dec), [data, dec]);
  const cCounts = useMemo(() => tallyDecisions(data?.conflicts || [], dec), [data, dec]);

  // Final song count: accepted suggestions and conflicts join recordings (transitively)
  const finalSongs = useMemo(() => {
    if (!data) return 0;
    const parent = data.records.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    let songs = data.records.length;
    [...data.suggestions, ...(data.conflicts || [])].forEach((g) => {
      const d = dec[g.id];
      if (d?.status !== "accepted") return;
      const kept = g.records.map((r) => r.id).filter((id) => !d.excluded.includes(id));
      if (kept.length < 2) return;
      kept.slice(1).forEach((id) => {
        const a = find(kept[0]); const b = find(id);
        if (a !== b) { parent[b] = a; songs -= 1; }
      });
    });
    return songs;
  }, [data, dec]);

  const saveNames = async (names) => {
    setErr("");
    try {
      const r = await fetch(`${API}/api/merge/projects/${project.id}/client-names`, {
        method: "PUT",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(res.detail || "Could not save client names");
      const miss = new Set(res.missing);
      const flag = (rec) => ({ ...rec, client_credited: res.has_client ? !miss.has(rec.id) : null });
      setData((d) => ({
        ...d,
        match_names: res.match_names,
        stats: { ...d.stats, client_missing: res.missing.length },
        records: d.records.map(flag),
        suggestions: d.suggestions.map((g) => ({ ...g, records: g.records.map(flag) })),
      }));
    } catch (e) { setErr(String(e.message || e)); }
  };

  const showIsrc = (filter) => { setIsrcFilter(filter); setTab("isrc"); };

  const download = async () => {
    setDownloading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/merge/projects/${project.id}/download`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: decisionsToServer(dec, [...data.suggestions, ...(data.conflicts || [])]) }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Download failed");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.client.replace(/[^A-Za-z0-9]+/g, "_")}_${data.file_name.replace(/\.xlsx$/i, "").replace(/[^A-Za-z0-9]+/g, "_")}_merged.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(String(e.message || e)); }
    setDownloading(false);
  };

  if (!data) {
    return (
      <div>
        <PageHeader title="Song Merge" subtitle="Upload a client's Excel. Recordings are merged by ISRC, then you review which versions belong to the same song. Everything is saved in Google Drive." />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <Card title="New merge" subtitle="Any .xlsx with a song title and ISRC column — Muso, Apple Music or Spotify exports work as-is.">
              <div className="mb-4">
                <Field label="Client name" value={client} onChange={setClient} placeholder="e.g. Laxmikant-Pyarelal" disabled={busy} />
              </div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
                onClick={() => {
                  if (busy) return;
                  if (!client.trim()) { setErr("Enter the client name first."); return; }
                  inputRef.current?.click();
                }}
                className="rounded-2xl px-6 py-14 text-center transition"
                style={{
                  background: drag ? T.p1 : T.surfaceTint,
                  border: `2px dashed ${drag ? T.ink2 : T.p4}`,
                  cursor: client.trim() ? "pointer" : "not-allowed",
                  opacity: client.trim() || busy ? 1 : 0.6,
                }}
              >
                <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: T.p2, color: T.ink }}>
                  {busy ? <Spinner /> : <IconUpload />}
                </div>
                <div className="text-base font-bold" style={{ color: T.ink }}>
                  {busy ? `Working on ${file?.name || "the merge"}…` : client.trim() ? "Drop the Excel here, or click to choose" : "Enter the client name above first"}
                </div>
                <div className="mt-1 text-sm" style={{ color: T.ink2 }}>
                  {busy ? "Merging by ISRC, finding versions of the same song and saving to Drive" : ".xlsx, up to 25 MB · saved to Drive → Song Merge → client folder"}
                </div>
              </div>
              {err && <Alert>{err}</Alert>}
            </Card>
          </div>
          <Card title="How merging works">
            <ol className="space-y-4 text-sm" style={{ color: T.ink2 }}>
              <MergeRule n="1" title="Same ISRC → merged automatically">
                An ISRC identifies one recording, so rows that share one are the same track.
              </MergeRule>
              <MergeRule n="2" title="Same song → suggested">
                Titles that match after removing Remix, Lofi, “From …” and spelling differences are suggested —
                only when <b>lyricist, author and composer are exactly the same</b>. Singers may differ.
              </MergeRule>
              <MergeRule n="3" title="Any writer change → no suggestion">
                A remixer added as composer or a different lyricist can make it a new work, so it stays separate.
              </MergeRule>
              <MergeRule n="4" title="You decide, it's saved">
                Every decision is saved to Drive as you go. Come back any time from Saved merges.
              </MergeRule>
            </ol>
          </Card>
        </div>

        <div className="mt-5">
          <Card
            title="Saved merges"
            subtitle="Stored in Google Drive → Song Merge, one folder per client"
            action={
              <button onClick={loadProjects} className="rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5" style={{ background: T.p1, color: T.ink }}>
                <IconRefresh /> Refresh
              </button>
            }
          >
            {projects === null ? (
              <Muted>Loading saved merges…</Muted>
            ) : projects.length === 0 ? (
              <EmptyState icon={<IconMerge />} title="No saved merges yet" description="Enter a client name and upload an Excel to start one." />
            ) : (
              <div className="rounded-xl overflow-x-auto" style={{ border: `1px solid ${T.borderSoft}` }}>
                <table className="w-full text-sm" style={{ minWidth: 980, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: T.p1 }}>
                      <Th>Client</Th>
                      <Th>File</Th>
                      <Th>Songs</Th>
                      <Th>Review progress</Th>
                      <Th>Last saved</Th>
                      <Th>By</Th>
                      <Th right>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p, i) => {
                      const done = p.accepted + p.rejected;
                      const pctDone = p.total ? Math.round((done / p.total) * 100) : 100;
                      const d = p.updated_at ? new Date(p.updated_at) : null;
                      const canDelete = user.role === "admin" || p.owner === user.email;
                      return (
                        <tr key={p.id} className="transition hover:bg-white" style={{ background: i % 2 ? T.surfaceTint : T.surface }}>
                          <Td bold>{p.client}</Td>
                          <Td muted>{p.file_name}</Td>
                          <Td muted>{fmtN(p.songs)} <span className="text-xs" style={{ color: T.ink3 }}>from {fmtN(p.rows)} rows</span></Td>
                          <Td>
                            <div className="flex items-center gap-2">
                              <div className="w-28 h-2 rounded-full overflow-hidden flex" style={{ background: T.p1 }}>
                                <div style={{ width: `${p.total ? (p.accepted / p.total) * 100 : 0}%`, background: T.p5 }} />
                                <div style={{ width: `${p.total ? (p.rejected / p.total) * 100 : 0}%`, background: "#CBD5E1" }} />
                              </div>
                              <span className="text-xs font-semibold tabular-nums" style={{ color: T.ink2 }}>{done}/{p.total} · {pctDone}%</span>
                            </div>
                          </Td>
                          <Td muted>
                            <div className="text-xs font-medium">{d ? d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</div>
                            <div className="text-[11px]">{d ? d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }) : ""}</div>
                          </Td>
                          <Td muted>{p.owner}</Td>
                          <Td right>
                            <div className="inline-flex items-center gap-2">
                              {p.folder_link && (
                                <a href={p.folder_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: T.ink }}>
                                  <IconExternal /> Drive
                                </a>
                              )}
                              {canDelete && (
                                <button onClick={() => removeProject(p)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition hover:bg-red-50" style={{ color: T.danger }}>
                                  Delete
                                </button>
                              )}
                              <button
                                onClick={() => openProject(p.id)}
                                disabled={busy}
                                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-90 disabled:opacity-50"
                                style={{ background: T.ink, color: "#fff" }}
                              >
                                Open
                              </button>
                            </div>
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
      </div>
    );
  }

  const st = data.stats;
  const totalItems = st.suggestions + (st.isrc_conflicts || 0);
  const all = { accepted: counts.accepted + cCounts.accepted, rejected: counts.rejected + cCounts.rejected, pending: counts.pending + cCounts.pending };
  const reviewed = all.accepted + all.rejected;
  const pct = (n) => (totalItems ? (n / totalItems) * 100 : 0);
  const quick = (st.conflict_kinds?.missing || 0) + (st.conflict_kinds?.extra || 0);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button onClick={closeProject} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: T.ink2 }}>
            <IconArrowLeft /> All merges
          </button>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: T.ink }}>{project.client}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ color: T.ink2 }}>
            <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: T.ink }}><IconMusic /> {data.file_name}</span>
            <span>·</span>
            {data.sheets.length > 1 ? (
              <select
                value={data.sheet}
                disabled={busy}
                onChange={(e) => {
                  if (window.confirm("Switching the sheet clears the review decisions for this merge. Continue?")) openProject(project.id, e.target.value);
                }}
                className="rounded-lg px-2 py-0.5 text-sm font-semibold outline-none"
                style={{ background: T.surface, color: T.ink, border: `1px solid ${T.border}` }}
              >
                {data.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : <span>sheet “{data.sheet}”</span>}
            <span>·</span>
            <span>compares {data.writer_cols.join(" + ") || "no writer columns"}</span>
            <span>·</span>
            <ClientNames names={data.match_names || []} onSave={saveNames} />
            <span>·</span>
            <SaveBadge state={saveState} />
            {project.folder_link && (
              <a href={project.folder_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline" style={{ color: T.ink }}>
                <IconExternal /> Drive folder
              </a>
            )}
          </div>
        </div>
        <button
          onClick={download}
          disabled={downloading}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60 flex items-center gap-2 hover:opacity-90"
          style={{ background: T.ink, color: "#fff", boxShadow: `0 6px 16px ${T.ink}33` }}
        >
          {downloading ? <Spinner light /> : <IconDownload />} Download Excel
        </button>
      </div>

      {err && <div className="mb-4"><Alert>{err}</Alert></div>}

      <div
        className="mb-4 rounded-2xl px-5 py-4 grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-x-8 gap-y-4 items-center"
        style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 4px 16px ${T.p4}1f` }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <FlowStat label="Uploaded rows" value={fmtN(st.rows)} />
          <FlowArrow />
          <FlowStat label="After ISRC merge" value={fmtN(st.records)} />
          <FlowArrow />
          <FlowStat label="Final songs" value={fmtN(finalSongs)} strong />
        </div>
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2 text-sm">
            <span className="font-semibold" style={{ color: T.ink }}>
              Reviewed {fmtN(reviewed)} of {fmtN(totalItems)}
              <span className="font-normal" style={{ color: T.ink3 }}> · {fmtN(st.suggestions)} suggestions + {fmtN(st.isrc_conflicts || 0)} ISRC conflicts</span>
            </span>
            <span className="flex items-center gap-3 text-xs font-semibold" style={{ color: T.ink2 }}>
              <Legend color={T.p5}>{all.accepted} merged</Legend>
              <Legend color="#CBD5E1">{all.rejected} kept separate</Legend>
              <Legend color={T.p1} ring>{all.pending} left</Legend>
            </span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: T.p1 }}>
            <div style={{ width: `${pct(all.accepted)}%`, background: T.p5 }} className="transition-all" />
            <div style={{ width: `${pct(all.rejected)}%`, background: "#CBD5E1" }} className="transition-all" />
          </div>
        </div>
      </div>

      {(st.client_missing > 0 || st.isrc_conflicts > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {st.client_missing > 0 && (
            <button
              onClick={() => showIsrc("client")}
              className="rounded-xl px-3.5 py-2 text-sm font-semibold flex items-center gap-2 transition hover:opacity-90"
              style={{ background: RED.bg, color: RED.ink, border: `1px solid ${RED.border}` }}
            >
              <IconAlert /> {fmtN(st.client_missing)} {st.client_missing === 1 ? "song doesn't" : "songs don't"} credit the client <IconArrowRight />
            </button>
          )}
          {st.isrc_conflicts > 0 && cCounts.pending > 0 && (
            <button
              onClick={() => setTab("conflicts")}
              className="rounded-xl px-3.5 py-2 text-sm font-semibold flex items-center gap-2 transition hover:opacity-90"
              style={{ background: AMBER.bg, color: AMBER.ink, border: `1px solid ${AMBER.border}` }}
            >
              <IconAlert /> {fmtN(cCounts.pending)} ISRC conflicts to review
              {quick > 0 && <span className="font-normal">— {fmtN(quick)} only differ by missing or extra credits</span>}
              <IconArrowRight />
            </button>
          )}
        </div>
      )}

      <div className="mb-4 inline-flex rounded-xl p-1" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        {[
          ["suggestions", "Review suggestions", st.suggestions],
          ["conflicts", "ISRC conflicts", st.isrc_conflicts || 0],
          ["isrc", "ISRC merged list", st.records],
        ].map(([id, label, n]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2"
            style={{ background: tab === id ? T.ink : "transparent", color: tab === id ? "#fff" : T.ink2 }}
          >
            {label}
            <span className="rounded-md px-1.5 text-xs tabular-nums" style={{ background: tab === id ? "rgba(255,255,255,0.18)" : T.p1 }}>{fmtN(n)}</span>
          </button>
        ))}
      </div>

      {tab === "suggestions" && (
        <SuggestionsPanel active={active} suggestions={data.suggestions} writerCols={data.writer_cols} dec={dec} counts={counts} setStatus={setStatus} setExcluded={setExcluded} />
      )}
      {tab === "conflicts" && (
        <ConflictsPanel
          active={active}
          conflicts={data.conflicts || []}
          dec={dec}
          counts={cCounts}
          setStatus={setStatus}
          setExcluded={setExcluded}
          projectId={project.id}
          token={token}
        />
      )}
      {tab === "isrc" && <IsrcPanel records={data.records} filter={isrcFilter} setFilter={setIsrcFilter} />}
    </div>
  );
}

function SaveBadge({ state }) {
  const map = {
    saved: [T.ink2, "Saved to Drive"],
    saving: [T.ink3, "Saving…"],
    error: [T.danger, "Not saved — check connection"],
  };
  const [color, label] = map[state] || map.saved;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
      {state === "saving" ? <span className="inline-block h-3 w-3 rounded-full border-2 animate-spin" style={{ borderColor: `${color} transparent ${color} ${color}` }} /> : <IconCheckSmall />}
      {label}
    </span>
  );
}

function FlowStat({ label, value, strong }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: T.ink3 }}>{label}</div>
      <div className={`tabular-nums tracking-tight font-bold ${strong ? "text-2xl" : "text-xl"}`} style={{ color: T.ink }}>{value}</div>
    </div>
  );
}

function FlowArrow() {
  return <span className="mt-3" style={{ color: T.p5 }}><IconArrowRight /></span>;
}

function Legend({ color, ring, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, border: ring ? `1px solid ${T.p4}` : "none" }} />
      {children}
    </span>
  );
}

function MergeRule({ n, title, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex-none w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: T.p2, color: T.ink }}>{n}</span>
      <div>
        <div className="font-semibold" style={{ color: T.ink }}>{title}</div>
        <div className="mt-0.5 leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

// A = merge, R = keep separate, U = undo, ↑/↓ (or K/J) = move — while not typing
function useReviewKeys(active, decide, go) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "a") decide("accepted");
      else if (k === "r") decide("rejected");
      else if (k === "u") decide("pending");
      else if (k === "arrowdown" || k === "j") go(1);
      else if (k === "arrowup" || k === "k") go(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}

function SuggestionsPanel({ active, suggestions, writerCols, dec, counts, setStatus, setExcluded }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("pending");
  const [selectedId, setSelectedId] = useState(null);
  const itemRefs = useRef({});

  const statusOf = (id) => dec[id]?.status || "pending";

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return suggestions.filter((g) => {
      const status = dec[g.id]?.status || "pending";
      if (filter !== "all" && status !== filter && g.id !== selectedId) return false;
      if (!s) return true;
      return g.base_title.toLowerCase().includes(s)
        || Object.values(g.writers).some((w) => w.toLowerCase().includes(s))
        || g.records.some((r) => r.title.toLowerCase().includes(s) || r.singer.toLowerCase().includes(s) || r.isrcs.some((i) => i.toLowerCase().includes(s)));
    });
  }, [suggestions, dec, q, filter, selectedId]);

  const sel = shown.find((g) => g.id === selectedId) || shown[0] || null;
  const selIndex = sel ? shown.indexOf(sel) : -1;

  const go = (delta) => {
    const next = shown[selIndex + delta];
    if (next) setSelectedId(next.id);
  };

  const decide = (status) => {
    if (!sel) return;
    setStatus([sel.id], status);
    if (status === "pending") return;
    // jump to the next suggestion still waiting for a decision
    const after = shown.slice(selIndex + 1).concat(shown.slice(0, selIndex));
    const next = after.find((g) => g.id !== sel.id && statusOf(g.id) === "pending");
    if (next) setSelectedId(next.id);
  };

  useReviewKeys(active, decide, go);

  useEffect(() => {
    if (sel) itemRefs.current[sel.id]?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!suggestions.length) {
    return (
      <Card>
        <EmptyState
          icon={<IconSparkle />}
          title="No merge suggestions"
          description="No two recordings share a similar title with exactly the same lyricist, author and composer. The ISRC merged list is your final list."
        />
      </Card>
    );
  }

  const ids = shown.map((g) => g.id);
  const filters = [["pending", "To review", counts.pending], ["accepted", "Merged", counts.accepted], ["rejected", "Kept separate", counts.rejected], ["all", "All", suggestions.length]];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[420px_1fr] gap-4 items-start">
      {/* list */}
      <div
        className="rounded-2xl overflow-hidden flex flex-col lg:sticky lg:top-20"
        style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 4px 16px ${T.p4}1f`, maxHeight: "calc(100vh - 6rem)" }}
      >
        <div className="p-3 space-y-2.5" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.ink3 }}><IconSearch /></div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search song, singer, writer, ISRC…"
              className="w-full rounded-xl pl-10 pr-3 py-2 text-sm outline-none"
              style={{ background: T.surfaceTint, border: `1px solid ${T.border}`, color: T.ink }}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {filters.map(([id, label, n]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition"
                style={{ background: filter === id ? T.ink : "transparent", color: filter === id ? "#fff" : T.ink2, border: `1px solid ${filter === id ? T.ink : T.border}` }}
              >
                {label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold" style={{ color: T.ink3 }}>{shown.length} shown</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setStatus(ids, "accepted")}
                disabled={!ids.length}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40"
                style={{ background: T.p2, color: T.ink }}
              >
                Merge all shown
              </button>
              <button
                onClick={() => setStatus(ids, "rejected")}
                disabled={!ids.length}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40"
                style={{ background: T.surfaceTint, color: T.ink2, border: `1px solid ${T.border}` }}
              >
                Keep all separate
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {shown.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm" style={{ color: T.ink3 }}>
              {filter === "pending" && !q ? "All suggestions reviewed — download your Excel." : "Nothing matches."}
            </div>
          ) : shown.map((g) => {
            const on = sel && g.id === sel.id;
            const status = statusOf(g.id);
            return (
              <button
                key={g.id}
                ref={(el) => { itemRefs.current[g.id] = el; }}
                onClick={() => setSelectedId(g.id)}
                className="w-full text-left pl-3 pr-3 py-2.5 flex items-center gap-3 transition hover:bg-black/[0.02]"
                style={{
                  background: on ? T.p1 : "transparent",
                  borderLeft: `3px solid ${on ? T.ink : "transparent"}`,
                  borderBottom: `1px solid ${T.borderSoft}`,
                }}
              >
                <StatusIcon status={status} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate" style={{ color: T.ink }}>{g.base_title}</div>
                  <div className="text-[11px] truncate" style={{ color: T.ink3 }}>
                    {g.records.length} versions · {g.writers.Lyricist || g.writers.Author || g.writers.Composer}
                  </div>
                </div>
                {g.singers_differ && (
                  <span className="flex-none text-[10px] font-bold rounded px-1.5 py-0.5" style={{ background: AMBER.bg, color: AMBER.ink }} title="Singers differ">
                    Singers
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* detail */}
      {sel ? (
        <SuggestionDetail
          key={sel.id}
          g={sel}
          pos={selIndex + 1}
          total={shown.length}
          writerCols={writerCols}
          d={dec[sel.id] || { status: "pending", excluded: [] }}
          onDecide={decide}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onExcluded={(ex) => setExcluded(sel.id, ex)}
        />
      ) : (
        <Card><Muted>Select a suggestion on the left.</Muted></Card>
      )}
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === "accepted") {
    return <span className="flex-none w-5 h-5 rounded-full flex items-center justify-center" style={{ background: T.p5, color: "#fff" }}><IconCheckSmall /></span>;
  }
  if (status === "rejected") {
    return <span className="flex-none w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: "#E2E8F0", color: "#64748B" }}>✕</span>;
  }
  return <span className="flex-none w-5 h-5 rounded-full" style={{ border: `2px solid ${T.p4}` }} />;
}

function SuggestionDetail({ g, pos, total, writerCols, d, onDecide, onPrev, onNext, onExcluded }) {
  const selected = g.records.filter((r) => !d.excluded.includes(r.id)).length;
  const accepted = d.status === "accepted";
  const rejected = d.status === "rejected";
  const allOn = d.excluded.length === 0;
  const toggle = (rid) => onExcluded(d.excluded.includes(rid) ? d.excluded.filter((x) => x !== rid) : [...d.excluded, rid]);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 4px 16px ${T.p4}1f` }}>
      <div className="px-5 pt-4 pb-4" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: T.ink3 }}>
            <span className="mono">{g.id}</span>
            <span>·</span>
            <span>{pos} of {total}</span>
          </div>
          <div className="flex items-center gap-1">
            <NavBtn onClick={onPrev} disabled={pos <= 1} label="Previous (↑)"><IconArrowLeft /></NavBtn>
            <NavBtn onClick={onNext} disabled={pos >= total} label="Next (↓)"><IconArrowRight /></NavBtn>
          </div>
        </div>
        <h2 className="text-xl font-bold tracking-tight" style={{ color: T.ink }}>{g.base_title}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill bg={T.p2} fg={T.ink}>{g.records.length} versions</Pill>
          {g.singers_differ && <Pill bg={AMBER.bg} fg={AMBER.ink}>Singers differ</Pill>}
          {Object.entries(g.types).map(([t, n]) => {
            const [bg, fg] = TYPE_COLORS[t] || ["#F1F5F9", "#334155"];
            return <Pill key={t} bg={bg} fg={fg}>{t} ×{n}</Pill>;
          })}
        </div>

        <div className="mt-4 rounded-xl px-4 py-3 space-y-1.5" style={{ background: T.surfaceTint, border: `1px solid ${T.borderSoft}` }}>
          {writerCols.filter((c) => g.writers[c]).map((c) => (
            <div key={c} className="text-sm flex gap-3">
              <span className="flex-none text-[11px] font-bold uppercase tracking-wider w-20 pt-0.5" style={{ color: T.ink3 }}>{c}</span>
              <span style={{ color: T.ink }}>{g.writers[c]}</span>
            </div>
          ))}
          <div className="text-xs flex items-center gap-1.5 pt-0.5" style={{ color: T.ink2 }}>
            <IconCheckSmall /> Same writers on every version below
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {d.status === "pending" ? (
            <>
              <button
                onClick={() => onDecide("accepted")}
                disabled={selected < 2}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-40 flex items-center gap-2"
                style={{ background: T.ink, color: "#fff", boxShadow: `0 6px 16px ${T.ink}33` }}
              >
                <IconMerge /> Merge {selected} versions <Kbd dark>A</Kbd>
              </button>
              <button
                onClick={() => onDecide("rejected")}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:bg-red-50 flex items-center gap-2"
                style={{ background: T.surface, color: T.ink, border: `1px solid ${T.border}` }}
              >
                Keep separate <Kbd>R</Kbd>
              </button>
            </>
          ) : (
            <>
              <div
                className="rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2"
                style={{ background: accepted ? T.p2 : "#F1F5F9", color: accepted ? T.ink : "#475569" }}
              >
                <StatusIcon status={d.status} />
                {accepted ? (selected >= 2 ? `Merging ${selected} versions into one song` : "Select at least 2 versions to merge") : "Kept as separate songs"}
              </div>
              <button onClick={() => onDecide("pending")} className="rounded-xl px-3 py-2.5 text-sm font-semibold hover:underline flex items-center gap-2" style={{ color: T.ink2 }}>
                Undo <Kbd>U</Kbd>
              </button>
            </>
          )}
          <span className="ml-auto hidden md:inline text-xs" style={{ color: T.ink3 }}>
            Keys: <Kbd>A</Kbd> merge · <Kbd>R</Kbd> keep separate · <Kbd>↑</Kbd><Kbd>↓</Kbd> move
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 760, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: T.p1 }}>
              <th className="pl-5 pr-2 py-2.5 w-8 text-left">
                <input
                  type="checkbox"
                  checked={allOn}
                  disabled={rejected}
                  onChange={() => onExcluded(allOn ? g.records.map((r) => r.id) : [])}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: T.ink }}
                  aria-label="Select all versions"
                />
              </th>
              <Th>Title</Th>
              <Th>Album</Th>
              <Th>Singer</Th>
              <Th>ISRC</Th>
              <Th>Released</Th>
              <Th>Type</Th>
            </tr>
          </thead>
          <tbody>
            {g.records.map((r, i) => {
              const on = !d.excluded.includes(r.id);
              const [bg, fg] = TYPE_COLORS[r.type] || ["#F1F5F9", "#334155"];
              return (
                <tr
                  key={r.id}
                  onClick={() => !rejected && toggle(r.id)}
                  className={rejected ? "" : "cursor-pointer"}
                  style={{ background: i % 2 ? T.surfaceTint : T.surface, opacity: on ? 1 : 0.45, borderTop: `1px solid ${T.borderSoft}` }}
                >
                  <td className="pl-5 pr-2 py-2.5">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={rejected}
                      onChange={() => toggle(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 cursor-pointer"
                      style={{ accentColor: T.ink }}
                      aria-label={`Include ${r.title}`}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-sm font-semibold" style={{ color: T.ink }}>
                    {r.title}
                    {i === 0 && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5" style={{ background: T.p2, color: T.ink2 }}>original</span>}
                    <RecordFlags r={r} />
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: T.ink2 }}>{r.album || "—"}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: T.ink }}>{r.singer || "—"}</td>
                  <td className="px-4 py-2.5 mono text-xs whitespace-nowrap" style={{ color: T.ink2 }}>{r.isrcs.length ? r.isrcs.map((x) => <div key={x}>{x}</div>) : "—"}</td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap tabular-nums" style={{ color: T.ink2 }}>{r.release ? r.release.slice(0, 10) : "—"}</td>
                  <td className="px-4 py-2.5"><Pill bg={bg} fg={fg} small>{r.type}</Pill></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NavBtn({ onClick, disabled, label, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition disabled:opacity-30 hover:bg-black/5"
      style={{ color: T.ink, border: `1px solid ${T.border}` }}
    >
      {children}
    </button>
  );
}

function Kbd({ dark, children }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded text-[10px] font-bold mono"
      style={dark ? { background: "rgba(255,255,255,0.18)", color: "#fff" } : { background: T.p1, color: T.ink2, border: `1px solid ${T.border}` }}
    >
      {children}
    </kbd>
  );
}

const CONFLICT_KINDS = {
  missing: {
    label: "Only missing credits",
    bg: "#DCFCE7", fg: "#166534",
    help: "One copy leaves a writer blank. Every name that is filled in matches — usually safe to merge.",
  },
  extra: {
    label: "Extra writers on one copy",
    bg: "#E0F2FE", fg: "#075985",
    help: "One copy lists more writers than the other, nothing contradicts — usually the same recording with fuller credits.",
  },
  overlap: {
    label: "Writers partly overlap",
    bg: AMBER.bg, fg: AMBER.ink,
    help: "The copies share some writers but each also lists names the other doesn't. Check before merging.",
  },
  different: {
    label: "Different writers",
    bg: RED.bg, fg: RED.ink,
    help: "The copies credit completely different people. Likely a data error or a different work — check carefully.",
  },
};

function tallyDecisions(list, dec) {
  const c = { pending: 0, accepted: 0, rejected: 0 };
  list.forEach((s) => { c[dec[s.id]?.status || "pending"] += 1; });
  return c;
}

function ConflictsPanel({ active, conflicts, dec, counts, setStatus, setExcluded, projectId, token }) {
  const [q, setQ] = useState("");
  const [status, setStatusFilter] = useState("pending");
  const [kind, setKind] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const itemRefs = useRef({});
  const cache = useRef({}); // conflict id -> comparison data

  const statusOf = (id) => dec[id]?.status || "pending";

  const kindCounts = useMemo(() => {
    const c = { all: 0, missing: 0, extra: 0, overlap: 0, different: 0 };
    conflicts.forEach((g) => {
      if (status !== "all" && (dec[g.id]?.status || "pending") !== status) return;
      c.all += 1;
      c[g.kind] += 1;
    });
    return c;
  }, [conflicts, dec, status]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return conflicts.filter((g) => {
      if (g.id !== selectedId) {
        if (status !== "all" && (dec[g.id]?.status || "pending") !== status) return false;
        if (kind !== "all" && g.kind !== kind) return false;
      }
      if (!s) return true;
      return g.title.toLowerCase().includes(s) || g.isrcs.some((i) => i.toLowerCase().includes(s))
        || g.records.some((r) => r.title.toLowerCase().includes(s) || r.lyricist.toLowerCase().includes(s) || r.composer.toLowerCase().includes(s));
    });
  }, [conflicts, dec, q, status, kind, selectedId]);

  const sel = shown.find((g) => g.id === selectedId) || shown[0] || null;
  const selIndex = sel ? shown.indexOf(sel) : -1;

  const go = (delta) => {
    const next = shown[selIndex + delta];
    if (next) setSelectedId(next.id);
  };

  const decide = (st) => {
    if (!sel) return;
    setStatus([sel.id], st);
    if (st === "pending") return;
    const after = shown.slice(selIndex + 1).concat(shown.slice(0, selIndex));
    const next = after.find((g) => g.id !== sel.id && statusOf(g.id) === "pending");
    if (next) setSelectedId(next.id);
  };

  useReviewKeys(active, decide, go);

  useEffect(() => {
    if (sel) itemRefs.current[sel.id]?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!conflicts.length) {
    return (
      <Card>
        <EmptyState icon={<IconCheck />} title="No ISRC conflicts" description="Every ISRC in this file has one consistent set of writers." />
      </Card>
    );
  }

  const ids = shown.map((g) => g.id);
  const pendingOf = (k) => conflicts.filter((g) => g.kind === k && statusOf(g.id) === "pending").map((g) => g.id);
  const quickMissing = pendingOf("missing");
  const quickExtra = pendingOf("extra");

  return (
    <div>
      {(quickMissing.length > 0 || quickExtra.length > 0) && (
        <div
          className="mb-4 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3"
          style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 4px 16px ${T.p4}1f` }}
        >
          <div className="text-sm" style={{ color: T.ink2 }}>
            <div className="font-bold" style={{ color: T.ink }}>Quick start</div>
            Conflicts where nothing contradicts — a blank credit or extra names on one copy — are almost always the same recording.
          </div>
          <div className="flex flex-wrap gap-2">
            {quickMissing.length > 0 && (
              <button
                onClick={() => setStatus(quickMissing, "accepted")}
                className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-90"
                style={{ background: CONFLICT_KINDS.missing.bg, color: CONFLICT_KINDS.missing.fg }}
              >
                Merge all “only missing credits” ({quickMissing.length})
              </button>
            )}
            {quickExtra.length > 0 && (
              <button
                onClick={() => setStatus(quickExtra, "accepted")}
                className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-90"
                style={{ background: CONFLICT_KINDS.extra.bg, color: CONFLICT_KINDS.extra.fg }}
              >
                Merge all “extra writers” ({quickExtra.length})
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[420px_1fr] gap-4 items-start">
        <div
          className="rounded-2xl overflow-hidden flex flex-col lg:sticky lg:top-20"
          style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 4px 16px ${T.p4}1f`, maxHeight: "calc(100vh - 6rem)" }}
        >
          <div className="p-3 space-y-2.5" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.ink3 }}><IconSearch /></div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search song, ISRC, writer…"
                className="w-full rounded-xl pl-10 pr-3 py-2 text-sm outline-none"
                style={{ background: T.surfaceTint, border: `1px solid ${T.border}`, color: T.ink }}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {[["pending", "To review", counts.pending], ["accepted", "Merged", counts.accepted], ["rejected", "Kept separate", counts.rejected], ["all", "All", conflicts.length]].map(([id, label, n]) => (
                <button
                  key={id}
                  onClick={() => setStatusFilter(id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition"
                  style={{ background: status === id ? T.ink : "transparent", color: status === id ? "#fff" : T.ink2, border: `1px solid ${status === id ? T.ink : T.border}` }}
                >
                  {label} <span className="tabular-nums opacity-70">{n}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {[["all", "Any type"], ...Object.entries(CONFLICT_KINDS).map(([k, v]) => [k, v.label])].map(([id, label]) => {
                const on = kind === id;
                const meta = CONFLICT_KINDS[id];
                return (
                  <button
                    key={id}
                    onClick={() => setKind(id)}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold transition"
                    style={{
                      background: on ? (meta ? meta.fg : T.ink) : meta ? meta.bg : "transparent",
                      color: on ? "#fff" : meta ? meta.fg : T.ink2,
                      border: `1px solid ${on ? (meta ? meta.fg : T.ink) : "transparent"}`,
                    }}
                  >
                    {label} <span className="tabular-nums opacity-70">{kindCounts[id]}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold" style={{ color: T.ink3 }}>{shown.length} shown</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setStatus(ids, "accepted")}
                  disabled={!ids.length}
                  className="rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40"
                  style={{ background: T.p2, color: T.ink }}
                >
                  Merge all shown
                </button>
                <button
                  onClick={() => setStatus(ids, "rejected")}
                  disabled={!ids.length}
                  className="rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40"
                  style={{ background: T.surfaceTint, color: T.ink2, border: `1px solid ${T.border}` }}
                >
                  Keep all separate
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {shown.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm" style={{ color: T.ink3 }}>
                {status === "pending" && !q ? "All ISRC conflicts in this view are reviewed." : "Nothing matches."}
              </div>
            ) : shown.map((g) => {
              const on = sel && g.id === sel.id;
              const meta = CONFLICT_KINDS[g.kind];
              return (
                <button
                  key={g.id}
                  ref={(el) => { itemRefs.current[g.id] = el; }}
                  onClick={() => setSelectedId(g.id)}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-3 transition hover:bg-black/[0.02]"
                  style={{ background: on ? T.p1 : "transparent", borderLeft: `3px solid ${on ? T.ink : "transparent"}`, borderBottom: `1px solid ${T.borderSoft}` }}
                >
                  <StatusIcon status={statusOf(g.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate" style={{ color: T.ink }}>{g.title}</div>
                    <div className="text-[11px] truncate mono" style={{ color: T.ink3 }}>{g.isrcs.join(", ")} · {g.records.length} copies</div>
                  </div>
                  <span className="flex-none w-2.5 h-2.5 rounded-full" title={meta.label} style={{ background: meta.fg }} />
                </button>
              );
            })}
          </div>
        </div>

        {sel ? (
          <CompareDetail
            key={sel.id}
            g={sel}
            pos={selIndex + 1}
            total={shown.length}
            d={dec[sel.id] || { status: "pending", excluded: [] }}
            onDecide={decide}
            onPrev={() => go(-1)}
            onNext={() => go(1)}
            onExcluded={(ex) => setExcluded(sel.id, ex)}
            projectId={projectId}
            token={token}
            getCached={(id) => cache.current[id]}
            putCached={(id, v) => { cache.current[id] = v; }}
          />
        ) : (
          <Card><Muted>Select a conflict on the left.</Muted></Card>
        )}
      </div>
    </div>
  );
}

function CompareDetail({ g, pos, total, d, onDecide, onPrev, onNext, onExcluded, projectId, token, getCached, putCached }) {
  const [result, setResult] = useState(() => (getCached(g.id) ? { id: g.id, data: getCached(g.id) } : null));
  const [onlyDiff, setOnlyDiff] = useState(false);
  const meta = CONFLICT_KINDS[g.kind];
  const accepted = d.status === "accepted";
  const rejected = d.status === "rejected";
  const selected = g.records.filter((r) => !d.excluded.includes(r.id)).length;
  const toggle = (rid) => onExcluded(d.excluded.includes(rid) ? d.excluded.filter((x) => x !== rid) : [...d.excluded, rid]);

  useEffect(() => {
    if (getCached(g.id)) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const ids = g.records.map((r) => r.id).join(",");
        const r = await fetch(`${API}/api/merge/projects/${projectId}/compare?records=${ids}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || "Could not load the comparison");
        putCached(g.id, data);
        if (!cancelled) setResult({ id: g.id, data });
      } catch (e) {
        if (!cancelled) setResult({ id: g.id, error: String(e.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [g, projectId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = result?.id === g.id ? result.data : null;
  const rows = useMemo(() => {
    if (!data) return [];
    return data.columns.map((c) => {
      const vals = data.records.map((r) => r.values[c.key] || "");
      const differs = new Set(vals.map((v) => v.trim().toLowerCase())).size > 1;
      return { ...c, vals, differs };
    });
  }, [data]);
  const diffCount = rows.filter((r) => r.differs).length;
  const visible = onlyDiff ? rows.filter((r) => r.differs || r.key === "ISRC") : rows;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: `0 4px 16px ${T.p4}1f` }}>
      <div className="px-5 pt-4 pb-4" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: T.ink3 }}>
            <span className="mono">{g.id}</span><span>·</span><span>{pos} of {total}</span>
          </div>
          <div className="flex items-center gap-1">
            <NavBtn onClick={onPrev} disabled={pos <= 1} label="Previous (↑)"><IconArrowLeft /></NavBtn>
            <NavBtn onClick={onNext} disabled={pos >= total} label="Next (↓)"><IconArrowRight /></NavBtn>
          </div>
        </div>
        <h2 className="text-xl font-bold tracking-tight" style={{ color: T.ink }}>{g.title}</h2>
        <div className="mt-1 text-sm" style={{ color: T.ink2 }}>
          Same ISRC <span className="mono font-semibold" style={{ color: T.ink }}>{g.isrcs.join(", ")}</span> on {g.records.length} copies
        </div>
        <div className="mt-3 rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: meta.bg, color: meta.fg }}>
          <IconInfo />
          <div className="text-sm">
            <b>{meta.label}.</b> {meta.help}
            {g.diff_cols.length > 0 && <div className="mt-1 text-xs font-semibold">Differs in: {g.diff_cols.join(", ")}</div>}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {d.status === "pending" ? (
            <>
              <button
                onClick={() => onDecide("accepted")}
                disabled={selected < 2}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-40 flex items-center gap-2"
                style={{ background: T.ink, color: "#fff", boxShadow: `0 6px 16px ${T.ink}33` }}
              >
                <IconMerge /> Merge into one song <Kbd dark>A</Kbd>
              </button>
              <button
                onClick={() => onDecide("rejected")}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:bg-red-50 flex items-center gap-2"
                style={{ background: T.surface, color: T.ink, border: `1px solid ${T.border}` }}
              >
                Keep separate <Kbd>R</Kbd>
              </button>
            </>
          ) : (
            <>
              <div className="rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2" style={{ background: accepted ? T.p2 : "#F1F5F9", color: accepted ? T.ink : "#475569" }}>
                <StatusIcon status={d.status} />
                {accepted ? (selected >= 2 ? `Merging ${selected} copies into one song` : "Select at least 2 copies to merge") : "Kept as separate songs"}
              </div>
              <button onClick={() => onDecide("pending")} className="rounded-xl px-3 py-2.5 text-sm font-semibold hover:underline flex items-center gap-2" style={{ color: T.ink2 }}>
                Undo <Kbd>U</Kbd>
              </button>
            </>
          )}
          <label className="ml-auto flex items-center gap-2 text-sm font-semibold cursor-pointer" style={{ color: T.ink2 }}>
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="w-4 h-4" style={{ accentColor: T.ink }} />
            Only differences {data && <span className="tabular-nums" style={{ color: T.ink3 }}>({diffCount})</span>}
          </label>
        </div>
      </div>

      {result?.error ? (
        <div className="p-5"><Alert>{result.error}</Alert></div>
      ) : !data ? (
        <div className="p-8 flex items-center justify-center gap-3 text-sm" style={{ color: T.ink2 }}><Spinner /> Loading every column…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 300 + 280 * data.records.length, borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 200 }} />
              {data.records.map((r) => <col key={r.id} />)}
            </colgroup>
            <thead>
              <tr style={{ background: T.p1 }}>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider sticky left-0 z-10" style={{ color: T.ink2, background: T.p1 }}>Field</th>
                {data.records.map((r, i) => {
                  const on = !d.excluded.includes(r.id);
                  const rec = g.records.find((x) => x.id === r.id) || {};
                  return (
                    <th key={r.id} className="px-4 py-3 text-left align-top" style={{ opacity: on ? 1 : 0.5 }}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={rejected}
                          onChange={() => toggle(r.id)}
                          className="w-4 h-4 mt-0.5 cursor-pointer"
                          style={{ accentColor: T.ink }}
                        />
                        <span>
                          <span className="block text-xs font-bold uppercase tracking-wider" style={{ color: T.ink2 }}>Copy {i + 1}{r.rows > 1 ? ` · ${r.rows} rows` : ""}</span>
                          <span className="block text-sm font-semibold normal-case" style={{ color: T.ink }}>{rec.album || rec.title}</span>
                          {rec.client_credited === false && <Pill bg={RED.bg} fg={RED.ink} small>Client not credited</Pill>}
                        </span>
                      </label>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.key} style={{ borderTop: `1px solid ${T.borderSoft}`, background: row.differs ? (row.writer ? "#FFF7ED" : "#FFFBEB") : T.surface }}>
                  <td
                    className="px-4 py-2 text-xs font-bold align-top sticky left-0"
                    style={{ color: row.differs ? AMBER.ink : T.ink3, background: row.differs ? (row.writer ? "#FFF7ED" : "#FFFBEB") : T.surface, boxShadow: row.differs ? `inset 3px 0 0 ${row.writer ? RED.ink : AMBER.border}` : "none" }}
                  >
                    {row.label}
                    {row.writer && <span className="ml-1.5 rounded px-1 py-0.5 text-[9px] uppercase tracking-wider" style={{ background: T.p2, color: T.ink }}>writer</span>}
                  </td>
                  {row.vals.map((v, i) => (
                    <td
                      key={i}
                      className={`px-4 py-2 align-top break-words ${row.key === "ISRC" ? "mono text-xs" : "text-sm"} ${row.differs ? "font-semibold" : ""}`}
                      style={{ color: v ? T.ink : T.ink3 }}
                    >
                      {v || <span className="italic text-xs">blank</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ISRC_FILTERS = [
  ["all", "All", () => true],
  ["merged", "Merged by ISRC", (r) => r.rows > 1],
  ["split", "Same ISRC, different writers", (r) => r.isrc_split],
  ["client", "Client not credited", (r) => r.client_credited === false],
];

function IsrcPanel({ records, filter, setFilter }) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const counts = useMemo(
    () => Object.fromEntries(ISRC_FILTERS.map(([id, , fn]) => [id, records.filter(fn).length])),
    [records],
  );

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const fn = (ISRC_FILTERS.find(([id]) => id === filter) || ISRC_FILTERS[0])[2];
    const list = records.filter((r) => {
      if (!fn(r)) return false;
      if (!s) return true;
      return r.title.toLowerCase().includes(s) || r.album.toLowerCase().includes(s) || r.singer.toLowerCase().includes(s)
        || r.lyricist.toLowerCase().includes(s) || r.composer.toLowerCase().includes(s) || r.isrcs.some((i) => i.toLowerCase().includes(s));
    });
    // keep recordings that share an ISRC next to each other
    if (filter === "split") list.sort((a, b) => (a.isrcs[0] || "").localeCompare(b.isrcs[0] || ""));
    return list;
  }, [records, q, filter]);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.ink3 }}><IconSearch /></div>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setLimit(50); }}
            placeholder="Search song, album, singer, writer, ISRC…"
            className="w-full rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none"
            style={{ background: T.surfaceTint, border: `1px solid ${T.border}`, color: T.ink }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ISRC_FILTERS.map(([id, label]) => {
            const on = filter === id;
            const tone = id === "client" ? RED : id === "split" ? AMBER : null;
            return (
              <button
                key={id}
                onClick={() => { setFilter(id); setLimit(50); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                style={{
                  background: on ? (tone ? tone.ink : T.ink) : tone ? tone.bg : T.surface,
                  color: on ? "#fff" : tone ? tone.ink : T.ink2,
                  border: `1px solid ${on ? (tone ? tone.ink : T.ink) : tone ? tone.border : T.border}`,
                }}
              >
                {label} <span className="tabular-nums opacity-70">{fmtN(counts[id])}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto text-xs font-semibold" style={{ color: T.ink3 }}>{fmtN(shown.length)} recordings</div>
      </div>
      {filter === "split" && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: AMBER.bg, color: AMBER.ink }}>
          These recordings share an ISRC but list different lyricist / author / composer credits, so they were not merged. Sorted by ISRC so each pair sits together.
        </div>
      )}
      <div className="rounded-xl overflow-x-auto" style={{ border: `1px solid ${T.borderSoft}` }}>
        <table className="w-full text-sm" style={{ minWidth: 1200, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: T.p1 }}>
              <Th>Title</Th>
              <Th>Album</Th>
              <Th>ISRC</Th>
              <Th>Singer</Th>
              <Th>Lyricist</Th>
              <Th>Composer</Th>
              <Th right>Rows</Th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((r, i) => (
              <tr
                key={r.id}
                style={{
                  background: r.client_credited === false ? RED.row : i % 2 ? T.surfaceTint : T.surface,
                  boxShadow: r.client_credited === false ? `inset 3px 0 0 ${RED.ink}` : "none",
                }}
              >
                <td className="px-4 py-2.5 text-sm font-semibold" style={{ color: T.ink }}>
                  {r.title || "—"}
                  <RecordFlags r={r} />
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: T.ink2 }}>{r.album || "—"}</td>
                <td className="px-4 py-2.5 mono text-xs whitespace-nowrap" style={{ color: T.ink2 }}>{r.isrcs.length ? r.isrcs.map((i) => <div key={i}>{i}</div>) : "—"}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: T.ink }}>{r.singer || "—"}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: T.ink }}>{r.lyricist || r.author || "—"}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: T.ink }}>{r.composer || "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <span
                    className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-md text-xs font-bold tabular-nums"
                    style={{ background: r.rows > 1 ? T.p3 : T.p1, color: T.ink }}
                  >
                    {r.rows}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <Muted>No recordings match.</Muted>}
      {shown.length > limit && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setLimit((l) => l + 100)}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold transition"
            style={{ background: T.surface, color: T.ink, border: `1px solid ${T.border}` }}
          >
            Show more ({fmtN(shown.length - limit)} left)
          </button>
        </div>
      )}
    </Card>
  );
}

function Pill({ bg, fg, small, children }) {
  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold whitespace-nowrap ${small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"}`}
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

function Spinner({ light }) {
  const c = light ? "#fff" : T.ink;
  return <span className="inline-block h-4 w-4 rounded-full border-2 animate-spin" style={{ borderColor: `${c} transparent ${c} ${c}` }} />;
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
const IconMerge = () => <SVG><path d="M4 2v3a3 3 0 0 0 3 3h2a3 3 0 0 1 3 3v3M12 2v3a3 3 0 0 1-3 3M4 14v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconUpload = () => <SVG><path d="M8 11V3m0 0L5 6m3-3l3 3M3 12v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconBook = () => <SVG><path d="M2.5 3.5A1 1 0 0 1 3.5 3H7a1.5 1.5 0 0 1 1 .5 1.5 1.5 0 0 1 1-.5h3.5a1 1 0 0 1 1 .5v8a1 1 0 0 1-1 .5H9a1.5 1.5 0 0 0-1 .5 1.5 1.5 0 0 0-1-.5H3.5a1 1 0 0 1-1-.5v-8zM8 3.5v9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconInfo = () => <SVG><circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" /><path d="M8 7.2v3.3M8 5.2v.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></SVG>;
const IconMail = () => <SVG size={20}><rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M2.5 4.5L8 8.5l5.5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
const IconEye = () => <SVG><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" /></SVG>;
const IconEyeOff = () => <SVG><path d="M6.3 6.3A2 2 0 0 0 8 10a2 2 0 0 0 1.7-1M2.5 4.5C1.4 5.6 1 8 1 8s2.5 4.5 7 4.5c1.2 0 2.3-.3 3.2-.8M6.5 3.6A6.6 6.6 0 0 1 8 3.5C12.5 3.5 15 8 15 8a13 13 0 0 1-1.7 2.3M2 2l12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></SVG>;
