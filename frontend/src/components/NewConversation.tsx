import { useEffect, useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import type { Member } from "../types";

export default function NewConversation({ onClose }: { onClose: () => void }) {
  const { openDirect, createGroup } = useApp();
  const [users, setUsers] = useState<Member[]>([]); const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState(""); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.users().then(setUsers).catch(() => setErr("Could not load users")); }, []);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  async function go() {
    try {
      if (picked.length === 1 && !title) await openDirect(picked[0]);
      else if (title && picked.length) await createGroup(title, picked);
      else return setErr("Pick one user for a direct chat, or add a title and members for a group");
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="New conversation" className="fixed inset-0 bg-canvas/90 grid place-items-center p-4 z-50">
      <div className="bg-panel border border-line rounded-lg w-full max-w-md p-4 space-y-3">
        <h2 className="font-semibold">New conversation</h2>
        <input className="field" placeholder="Group title (leave empty for direct message)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={64} />
        <ul className="max-h-60 overflow-y-auto border border-line rounded-md">
          {users.length === 0 && <li className="p-3 text-sm text-muted">No other users registered yet</li>}
          {users.map((u) => (
            <li key={u.id}><label className="flex items-center gap-3 p-3 min-h-[44px] hover:bg-elevated cursor-pointer">
              <input type="checkbox" checked={picked.includes(u.id)} onChange={() => toggle(u.id)} className="accent-[#D9A51F]" />
              <span>{u.display_name} <span className="text-muted text-sm">@{u.username}</span></span></label></li>
          ))}
        </ul>
        {err && <p role="alert" className="text-sm text-bad">{err}</p>}
        <div className="flex gap-2 justify-end"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={go}>Create</button></div>
      </div>
    </div>
  );
}
