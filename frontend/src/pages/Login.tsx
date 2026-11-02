import { useState, type FormEvent } from "react";
import { useApp } from "../context/AppContext";
import { BrandWordmark } from "../components/ui";

export default function Login() {
  const { authenticate } = useApp();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [name, setName] = useState("");
  const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await authenticate(mode, u.trim(), p, name.trim(), email.trim(), phone.trim()); }
    catch (x) { setErr(x instanceof Error ? x.message : "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <main className="login-page relative grid min-h-full place-items-center overflow-y-auto p-4">
      <form onSubmit={submit} className="login-card relative z-10 w-full max-w-sm space-y-4 rounded-lg p-6">
        <h1 className="text-center text-xl"><BrandWordmark /></h1>
        <label className="block text-sm">{mode === "login" ? "Username, email, or phone" : "Username"}
          <input className="field mt-1" value={u} onChange={(e) => setU(e.target.value)}
            required minLength={mode === "login" ? 1 : 3}
            autoComplete="username" />
        </label>
        {mode === "register" && (
          <>
            <label className="block text-sm">Display name
              <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} required maxLength={48} />
            </label>
            <label className="block text-sm">Email <span className="text-muted">(optional)</span>
              <input className="field mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="block text-sm">Phone number <span className="text-muted">(optional)</span>
              <span className="login-phone mt-1 flex min-h-[44px] overflow-hidden rounded-md">
                <span className="grid place-items-center border-r px-3 text-dim" aria-hidden="true">+254</span>
                <input className="min-w-0 flex-1 bg-transparent px-3 text-ink outline-none placeholder:text-muted"
                  type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  autoComplete="tel-national" inputMode="numeric" placeholder="712345678" maxLength={9}
                  pattern="[0-9]{9}" aria-label="Phone number after +254" />
              </span>
            </label>
          </>
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
