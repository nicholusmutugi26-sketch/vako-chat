import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Avatar, EmptyState, Panel, Presence } from "../components/ui";
import type { Member } from "../types";

type DeviceContact = { email?: string[]; tel?: string[] };
type ContactPickerNavigator = Navigator & {
  contacts?: {
    select(properties: string[], options?: { multiple?: boolean }): Promise<DeviceContact[]>;
  };
};

export default function Contacts({ onOpen }: { onOpen: () => void }) {
  const a = useApp();
  const [q, setQ] = useState(""); const [users, setUsers] = useState<Member[] | null>(null); const [err, setErr] = useState(false);
  const [deviceMatches, setDeviceMatches] = useState<Member[]>([]);
  const [contactMessage, setContactMessage] = useState<string | null>(null);
  const [contactsBusy, setContactsBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const loadUsers = () => {
      void api.users(q).then((result) => {
        if (alive) { setUsers(result); setErr(false); }
      }).catch(() => { if (alive) setErr(true); });
    };
    loadUsers();
    const interval = window.setInterval(loadUsers, 15000);
    window.addEventListener("focus", loadUsers);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", loadUsers);
    };
  }, [q]);

  async function findPhoneContacts() {
    const picker = (navigator as ContactPickerNavigator).contacts;
    if (!window.isSecureContext || !picker?.select) {
      setContactMessage("Phone contact access is not supported in this browser. Try a supported mobile browser over HTTPS.");
      return;
    }
    setContactsBusy(true);
    setContactMessage(null);
    try {
      const selected = await picker.select(["email", "tel"], { multiple: true });
      const emails = selected.flatMap((contact) => contact.email ?? []);
      const phones = selected.flatMap((contact) => contact.tel ?? []);
      if (emails.length === 0 && phones.length === 0) {
        setDeviceMatches([]);
        setContactMessage("No phone numbers or email addresses were shared.");
        return;
      }
      const matches = await api.matchContacts(emails, phones);
      setDeviceMatches(matches);
      setContactMessage(matches.length ? `${matches.length} Vakochat contact${matches.length === 1 ? "" : "s"} found.` : "No Vakochat accounts matched the selected contacts.");
    } catch (error) {
      setContactMessage(error instanceof Error ? error.message : "Phone contacts could not be accessed.");
    } finally {
      setContactsBusy(false);
    }
  }

  async function messageUser(user: Member) {
    await a.openDirect(user.id);
    onOpen();
  }

  const deviceMatchIds = new Set(deviceMatches.map((user) => user.id));
  const visibleUsers = users?.filter((user) => !deviceMatchIds.has(user.id));

  return (
    <Panel className="h-full flex flex-col min-h-0">
      <div className="p-3"><h2 className="font-semibold mb-2">Contacts</h2>
        <input className="field" placeholder="Search users…" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-ghost mt-3 w-full sm:w-auto" disabled={contactsBusy} onClick={() => void findPhoneContacts()}>
          {contactsBusy ? "Checking contacts…" : "Find phone contacts"}
        </button>
        <p className="mt-2 text-xs text-dim">Your browser will ask you to select which phone contacts to check. Contact details are used only to find matching accounts.</p>
        {contactMessage && <p className="mt-2 text-sm text-dim" role="status">{contactMessage}</p>}
      </div>
      {!a.presenceAvailable && <p className="px-3 pb-2 text-xs text-warn">Presence unavailable (Redis not reachable)</p>}
      <ul className="flex-1 overflow-y-auto">
        {err && <EmptyState text="Could not load users" />}
        {deviceMatches.length > 0 && <li className="px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-dim">Found in your phone contacts</li>}
        {deviceMatches.map((u) => (
          <li key={`phone-${u.id}`} className="flex items-center gap-3 p-3 hover:bg-elevated">
            <Avatar name={u.display_name} imageUrl={u.avatar_url} />
            <div className="flex-1 min-w-0"><p className="truncate">{u.display_name} <span className="text-muted text-sm">@{u.username}</span></p>
              <Presence online={a.online.has(u.id)} available={a.presenceAvailable} /></div>
            <button className="btn btn-ghost" onClick={() => void messageUser(u)}><MessageSquare size={16} />Message</button>
          </li>
        ))}
        {visibleUsers?.length ? <li className="px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-dim">Vakochat users</li> : null}
        {visibleUsers?.map((u) => (
          <li key={u.id} className="flex items-center gap-3 p-3 hover:bg-elevated">
            <Avatar name={u.display_name} imageUrl={u.avatar_url} />
            <div className="flex-1 min-w-0"><p className="truncate">{u.display_name} <span className="text-muted text-sm">@{u.username}</span></p>
              <Presence online={a.online.has(u.id)} available={a.presenceAvailable} /></div>
            <button className="btn btn-ghost" onClick={() => void messageUser(u)}><MessageSquare size={16} />Message</button>
          </li>
        ))}
        {visibleUsers?.length === 0 && deviceMatches.length === 0 && !err && <EmptyState text="No users found" />}
      </ul>
    </Panel>
  );
}
