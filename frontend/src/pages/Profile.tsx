import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Avatar, Panel } from "../components/ui";

export default function Profile() {
  const { user, setUser, conn } = useApp();
  const [name, setName] = useState(user?.display_name ?? ""); const [bio, setBio] = useState(user?.bio ?? "");
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { setUser(await api.updateMe(name, bio)); setMsg("Profile saved"); } catch (x) { setMsg(x instanceof Error ? x.message : "Failed"); }
    finally { setBusy(false); }
  }
  if (!user) return null;
  return (
    <Panel className="p-4 max-w-xl">
      <div className="flex items-center gap-4 mb-4"><Avatar name={user.display_name} size={64} />
        <div><h2 className="font-semibold">{user.display_name}</h2><p className="text-sm text-dim">@{user.username} · {conn === "connected" ? "Online" : "Offline"}</p></div></div>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm">Display name<input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} required maxLength={48} /></label>
        <label className="block text-sm">Bio<input className="field mt-1" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} /></label>
        {msg && <p role="status" className="text-sm text-dim">{msg}</p>}
        <button className="btn btn-primary" disabled={busy}><Save size={16} />Update profile</button>
      </form>
    </Panel>
  );
}
