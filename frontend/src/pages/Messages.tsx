import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Plus, Search, Send, Users } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Avatar, ConnectionBadge, EmptyState, Panel, Presence } from "../components/ui";
import NewConversation from "../components/NewConversation";

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

export default function Messages({ kind }: { kind: "all" | "group" }) {
  const a = useApp();
  const [q, setQ] = useState(""); const [text, setText] = useState("");
  const [showNew, setShowNew] = useState(false); const [showMembers, setShowMembers] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const list = a.conversations.filter((c) => (kind === "all" || c.kind === "group") && c.title.toLowerCase().includes(q.toLowerCase()));
  const active = a.conversations.find((c) => c.id === a.activeId) ?? null;
  const msgs = (active && a.messages[active.id]) || [];
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length, active?.id]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim(); if (!t) return;
    a.send(t); setText("");
  }
  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* conversation column: hidden on mobile when a chat is open */}
      <Panel className={`${active ? "hidden md:flex" : "flex"} flex-col w-full md:w-72 shrink-0 min-h-0`}>
        <div className="p-3 flex items-center justify-between">
          <h2 className="font-semibold">{kind === "group" ? "Groups" : "Conversations"}</h2>
          <button className="btn btn-ghost !px-2" aria-label="New conversation" onClick={() => setShowNew(true)}><Plus size={18} /></button>
        </div>
        <div className="px-3 pb-2 relative">
          <Search size={16} className="absolute left-6 top-3 text-muted" />
          <input className="field pl-9" placeholder="Search conversations…" aria-label="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ul className="flex-1 overflow-y-auto">
          {list.length === 0 && <EmptyState text="No conversations" />}
          {list.map((c) => (
            <li key={c.id}>
              <button onClick={() => a.select(c.id)} aria-current={c.id === a.activeId}
                className={`w-full text-left flex gap-3 items-center p-3 min-h-[56px] ${c.id === a.activeId ? "bg-elevated border-l-2 border-amber" : "hover:bg-elevated border-l-2 border-transparent"}`}>
                <Avatar name={c.title} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2"><span className="truncate font-medium">{c.title}</span><span className="text-xs text-muted">{hhmm(c.last_at)}</span></div>
                  <div className="flex justify-between gap-2"><span className="truncate text-sm text-dim">{c.last_text ?? "No messages yet"}</span>
                    {!!a.unread[c.id] && <span className="bg-amber text-canvas text-xs font-semibold rounded-full px-2">{a.unread[c.id]}</span>}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className={`${active ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0 min-h-0`}>
        {!active ? <EmptyState text="Select a conversation" /> : (<>
          <header className="p-3 border-b border-line flex items-center gap-3">
            <button className="md:hidden btn btn-ghost !px-2" aria-label="Back" onClick={() => a.select(null)}><ArrowLeft size={18} /></button>
            <Avatar name={active.title} />
            <div className="min-w-0 flex-1"><h2 className="font-semibold truncate">{active.title}</h2>
              <p className="text-xs text-dim">{active.kind === "group" ? `${active.members.length} members · Group` : "Direct message"}</p></div>
            <ConnectionBadge state={a.conn} node={a.nodeId} />
            {active.kind === "group" && <button className="btn btn-ghost !px-2" aria-label="Members" onClick={() => setShowMembers((s) => !s)}><Users size={18} /></button>}
          </header>
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
                {msgs.length === 0 && <EmptyState text="No messages yet. Say hello." />}
                {msgs.map((m) => {
                  const mine = m.sender_id === a.user?.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 border ${mine ? "bg-amber-soft/30 border-amber-soft" : "bg-elevated border-line"}`}>
                        <p className="text-xs text-dim mb-0.5">{mine ? "You" : m.sender_name} · {hhmm(m.created_at)}{m.origin_node ? ` · via ${m.origin_node}` : ""}</p>
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={end} />
              </div>
              {a.notice && <p className="px-4 pb-1 text-xs text-dim" role="status">{a.notice}</p>}
              <form onSubmit={submit} className="p-3 border-t border-line flex gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <input className="field flex-1" placeholder="Type a message…" aria-label="Message" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} />
                <button className="btn btn-primary" aria-label="Send" disabled={!text.trim() || a.conn !== "connected"}><Send size={18} /></button>
              </form>
            </div>
            {showMembers && active.kind === "group" && (
              <aside className="w-56 border-l border-line overflow-y-auto absolute md:static right-0 bg-panel h-full md:h-auto z-10 md:z-auto" aria-label="Group members">
                <h3 className="p-3 font-semibold text-sm">Members ({active.members.length})</h3>
                {active.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2"><Avatar name={m.display_name} size={32} />
                    <div className="min-w-0"><p className="truncate text-sm">{m.display_name}</p><Presence online={a.online.has(m.id)} available={a.presenceAvailable} /></div></div>
                ))}
              </aside>
            )}
          </div>
        </>)}
      </Panel>
      {showNew && <NewConversation onClose={() => setShowNew(false)} />}
    </div>
  );
}
