import { useState, type FormEvent } from "react";
import { MessageSquare } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "../config/brand";
import { useApp } from "../context/AppContext";

export default function Login() {
  const { authenticate } = useApp();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await authenticate(mode, u.trim(), p, name.trim()); }
    catch (x) { setErr(x instanceof Error ? x.message : "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <main className="min-h-full grid place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-panel border border-line rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-3">
          <MessageSquare className="text-amber" size={32} />
          <div><h1 className="text-xl font-semibold">{APP_NAME}</h1><p className="text-xs text-dim">{APP_TAGLINE}</p></div>
        </div>
        <label className="block text-sm">Username
          <input className="field mt-1" value={u} onChange={(e) => setU(e.target.value)} required minLength={3} autoComplete="username" />
        </label>
        {mode === "register" && (
          <label className="block text-sm">Display name
            <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} required maxLength={48} />
          </label>
        )}
        <label className="block text-sm">Password {mode === "register" && <span className="text-muted">(min 8 characters)</span>}
          <input className="field mt-1" type="password" value={p} onChange={(e) => setP(e.target.value)} required minLength={mode === "register" ? 8 : 1}
            autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </label>
        {err && <p role="alert" className="text-sm text-bad">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" className="text-sm text-amber underline w-full" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(null); }}>
          {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
