import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Avatar, EmptyState, Panel, Presence } from "../components/ui";
import type { Member } from "../types";

export default function Contacts({ onOpen }: { onOpen: () => void }) {
  const a = useApp();
  const [q, setQ] = useState(""); const [users, setUsers] = useState<Member[] | null>(null); const [err, setErr] = useState(false);
  useEffect(() => { api.users(q).then((u) => { setUsers(u); setErr(false); }).catch(() => setErr(true)); }, [q]);
  return (
    <Panel className="h-full flex flex-col min-h-0">
      <div className="p-3"><h2 className="font-semibold mb-2">Contacts</h2>
        <input className="field" placeholder="Search users…" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!a.presenceAvailable && <p className="px-3 pb-2 text-xs text-warn">Presence unavailable (Redis not reachable)</p>}
      <ul className="flex-1 overflow-y-auto">
        {err && <EmptyState text="Could not load users" />}
        {users?.length === 0 && <EmptyState text="No users found" />}
        {users?.map((u) => (
          <li key={u.id} className="flex items-center gap-3 p-3 hover:bg-elevated">
            <Avatar name={u.display_name} />
            <div className="flex-1 min-w-0"><p className="truncate">{u.display_name} <span className="text-muted text-sm">@{u.username}</span></p>
              <Presence online={a.online.has(u.id)} available={a.presenceAvailable} /></div>
            <button className="btn btn-ghost" onClick={async () => { await a.openDirect(u.id); onOpen(); }}><MessageSquare size={16} />Message</button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
