import { useState } from "react";
import { Activity, MessageSquare, Settings as Cog, User as UserIcon, Users, UsersRound } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "./config/brand";
import { useApp } from "./context/AppContext";
import { Avatar, ConnectionBadge } from "./components/ui";
import Login from "./pages/Login";
import Messages from "./pages/Messages";
import Contacts from "./pages/Contacts";
import Monitor from "./pages/Monitor";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";

type View = "messages" | "groups" | "contacts" | "monitor" | "profile" | "settings";
const NAV: { id: View; label: string; Icon: typeof Users }[] = [
  { id: "messages", label: "Messages", Icon: MessageSquare }, { id: "groups", label: "Groups", Icon: UsersRound },
  { id: "contacts", label: "Contacts", Icon: Users }, { id: "monitor", label: "Monitor", Icon: Activity },
  { id: "settings", label: "Settings", Icon: Cog },
];

export default function App() {
  const a = useApp();
  const [view, setView] = useState<View>("messages");
  if (a.booting) return <p className="p-6 text-dim">Loading…</p>;
  if (!a.user) return <Login />;
  const totalUnread = Object.values(a.unread).reduce((x, y) => x + y, 0);

  return (
    <div className="h-full flex bg-canvas">
      <nav aria-label="Primary" className="hidden md:flex flex-col w-56 bg-sidebar border-r border-line p-3 shrink-0">
        <div className="flex items-center gap-2 px-2 py-3"><MessageSquare className="text-amber" />
          <div><p className="font-semibold leading-none">{APP_NAME}</p><p className="text-[11px] text-dim mt-1">{APP_TAGLINE}</p></div></div>
        <ul className="mt-4 space-y-1 flex-1">
          {NAV.map(({ id, label, Icon }) => (
            <li key={id}><button onClick={() => setView(id)} aria-current={view === id}
              className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-md text-left ${view === id ? "bg-elevated text-amber border-l-2 border-amber" : "text-dim hover:bg-elevated border-l-2 border-transparent"}`}>
              <Icon size={18} />{label}{id === "messages" && totalUnread > 0 && <span className="ml-auto text-xs bg-amber text-canvas rounded-full px-2">{totalUnread}</span>}</button></li>
          ))}
        </ul>
        <button onClick={() => setView("profile")} className="flex items-center gap-2 p-2 rounded-md bg-panel border border-line hover:bg-elevated text-left">
          <Avatar name={a.user.display_name} size={36} /><div className="min-w-0"><p className="truncate text-sm font-medium">{a.user.display_name}</p>
            <p className="text-xs text-dim">{a.conn === "connected" ? "Online" : "Offline"}</p></div></button>
      </nav>

      <main className="flex-1 min-w-0 flex flex-col p-2 md:p-3 gap-2 pb-0 md:pb-3">
        <div className="md:hidden flex items-center justify-between px-1"><span className="font-semibold">{APP_NAME}</span><ConnectionBadge state={a.conn} node={a.nodeId} /></div>
        <div className="flex-1 min-h-0 relative">
          {view === "messages" && <Messages kind="all" />}
          {view === "groups" && <Messages kind="group" />}
          {view === "contacts" && <Contacts onOpen={() => setView("messages")} />}
          {view === "monitor" && <Monitor />}
          {view === "profile" && <Profile />}
          {view === "settings" && <Settings />}
        </div>
        <nav aria-label="Mobile" className="md:hidden grid grid-cols-6 bg-sidebar border-t border-line -mx-2 pb-[env(safe-area-inset-bottom)]">
          {[...NAV.slice(0, 4), { id: "profile" as View, label: "Profile", Icon: UserIcon }, NAV[4]].map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setView(id)} aria-current={view === id}
              className={`flex flex-col items-center justify-center min-h-[52px] text-[11px] ${view === id ? "text-amber" : "text-dim"}`}><Icon size={20} />{label}</button>
          ))}
        </nav>
      </main>
    </div>
  );
}
