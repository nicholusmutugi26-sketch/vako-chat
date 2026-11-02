import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, getToken, setPreferredBase, setToken } from "../services/api";
import { FailoverSocket } from "../services/socket";
import { WS_NODE_URLS } from "../config/env";
import type { ChatMessage, ConnState, Conversation, ServerFrame, User } from "../types";

interface Ctx {
  user: User | null; booting: boolean;
  conversations: Conversation[]; messages: Record<string, ChatMessage[]>; unread: Record<string, number>;
  activeId: string | null; conn: ConnState; nodeId: string | null;
  online: Set<string>; presenceAvailable: boolean; notice: string | null;
  authenticate(mode: "login" | "register", u: string, p: string, name?: string): Promise<void>;
  logout(): void; select(id: string | null): void; send(text: string): void;
  openDirect(userId: string): Promise<void>; createGroup(title: string, ids: string[]): Promise<void>;
  setUser(u: User): void;
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(!!getToken());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnState>("disconnected");
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [presenceAvailable, setPA] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sock = useRef<FailoverSocket | null>(null);
  const seen = useRef<Set<string>>(new Set()); // duplicate suppression by message_id
  const activeRef = useRef<string | null>(null);
  const userRef = useRef<User | null>(null);
  activeRef.current = activeId; userRef.current = user;

  const addMessage = useCallback((m: ChatMessage) => {
    if (seen.current.has(m.id)) return;
    seen.current.add(m.id);
    setMessages((p) => ({ ...p, [m.conversation_id]: [...(p[m.conversation_id] ?? []), m] }));
    setConversations((p) => p.map((c) => (c.id === m.conversation_id ? { ...c, last_text: m.text, last_at: m.created_at } : c)));
    if (m.conversation_id !== activeRef.current && m.sender_id !== userRef.current?.id)
      setUnread((p) => ({ ...p, [m.conversation_id]: (p[m.conversation_id] ?? 0) + 1 }));
  }, []);

  const loadHistory = useCallback(async (cid: string) => {
    try { (await api.messages(cid)).forEach(addMessage); } catch { /* shown via connection state */ }
  }, [addMessage]);

  const refresh = useCallback(async () => {
    try {
      const cs = await api.conversations();
      setConversations(cs);
      await Promise.all(cs.map((c) => loadHistory(c.id))); // also restores history after reconnect
    } catch { setNotice("Could not load conversations"); }
  }, [loadHistory]);

  const onFrame = useCallback((f: ServerFrame) => {
    if (f.type === "auth.ok") { setNodeId(f.node_id); void refresh(); }
    else if (f.type === "message.created")
      addMessage({ id: f.message_id, conversation_id: f.conversation_id, sender_id: f.sender.id,
        sender_name: f.sender.display_name, text: f.text, created_at: f.created_at, origin_node: f.origin_node });
    else if (f.type === "message.ack")
      setNotice(f.status === "accepted" ? `Accepted by ${f.message_id.slice(0, 6)}… (relayed via Redis)` : "Accepted locally only — Redis relay failed; other nodes may not receive it");
    else if (f.type === "error") setNotice(`Server error: ${f.code}`);
  }, [addMessage, refresh]);

  // socket lifecycle tied to the signed-in user
  useEffect(() => {
    const tok = getToken();
    if (!user || !tok) return;
    const s = new FailoverSocket(tok, {
      onState: (st, idx) => {
        setConn(st);
        if (st !== "connected") setNodeId(null);
        if (idx !== null) setPreferredBase(idx);
      },
      onFrame, onAuthFailed: () => logout(),
    });
    sock.current = s; s.start();
    return () => { s.stop(); sock.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // presence polling (real data from Redis presence keys; "unavailable" if Redis is down)
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const tick = async () => {
      try { const p = await api.presence(); if (alive) { setOnline(new Set(p.online)); setPA(p.available); } }
      catch { if (alive) setPA(false); }
    };
    void tick(); const t = setInterval(tick, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [user?.id]);

  // restore session
  useEffect(() => {
    if (!getToken()) return;
    api.me().then(setUser).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);

  const logout = useCallback(() => {
    setToken(null); setUser(null); setConversations([]); setMessages({}); setUnread({});
    setActiveId(null); seen.current.clear(); setConn("disconnected");
  }, []);

  const value = useMemo<Ctx>(() => ({
    user, booting, conversations, messages, unread, activeId, conn, nodeId, online, presenceAvailable, notice, setUser,
    async authenticate(mode, u, p, name) {
      const r = mode === "login" ? await api.login(u, p) : await api.register(u, name || u, p);
      setToken(r.token); setUser(r.user);
    },
    logout,
    select(id) { setActiveId(id); if (id) setUnread((p) => ({ ...p, [id]: 0 })); },
    send(text) {
      if (!activeRef.current) return;
      const ok = sock.current?.send({ type: "message.send", request_id: crypto.randomUUID(), conversation_id: activeRef.current, text });
      if (!ok) setNotice("Not connected — message was NOT sent");
    },
    async openDirect(userId) {
      const c = await api.createConversation("direct", [userId]);
      setConversations((p) => (p.some((x) => x.id === c.id) ? p : [...p, c]));
      setActiveId(c.id);
    },
    async createGroup(title, ids) {
      const c = await api.createConversation("group", ids, title);
      setConversations((p) => [...p, c]); setActiveId(c.id);
    },
  }), [user, booting, conversations, messages, unread, activeId, conn, nodeId, online, presenceAvailable, notice, logout]);

  void WS_NODE_URLS;
  return <C.Provider value={value}>{children}</C.Provider>;
}
