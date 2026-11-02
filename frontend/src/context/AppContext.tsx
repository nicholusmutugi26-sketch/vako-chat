import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, getToken, setPreferredBase, setToken } from "../services/api";
import { FailoverSocket } from "../services/socket";
import { WS_NODE_URLS } from "../config/env";
import { prepareGroupImage } from "../utils/groupImage";
import type { ChatMessage, ConnState, Conversation, MessageStatus, ServerFrame, User } from "../types";

const statusRank: Record<MessageStatus, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };

interface Ctx {
  user: User | null; booting: boolean;
  conversations: Conversation[]; messages: Record<string, ChatMessage[]>; unread: Record<string, number>;
  messageStatus: Record<string, MessageStatus>; typing: Record<string, string[]>;
  activeId: string | null; conn: ConnState; nodeId: string | null;
  online: Set<string>; presenceAvailable: boolean; notice: string | null;
  authenticate(mode: "login" | "register", u: string, p: string, name?: string, email?: string, phone?: string): Promise<void>;
  logout(): void; select(id: string | null): void; send(text: string): void; sendTo(id: string, text: string): void;
  removeMessage(id: string, conversationId: string): void; editMessage(id: string, conversationId: string, text: string): Promise<void>;
  setTyping(conversationId: string, isTyping: boolean): void;
  openDirect(userId: string): Promise<void>;
  createGroup(title: string, ids: string[], description: string, avatar?: File): Promise<void>;
  updateGroup(id: string, title: string, description: string, avatar?: File): Promise<void>;
  uploadGroupAvatar(id: string, file: File): Promise<void>;
  deleteGroupAvatar(id: string): Promise<void>;
  setUser(u: User): void;
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(!!getToken());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [messageStatus, setMessageStatus] = useState<Record<string, MessageStatus>>({});
  const [typing, setTypingUsers] = useState<Record<string, Record<string, string>>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnState>("disconnected");
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [presenceAvailable, setPA] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sock = useRef<FailoverSocket | null>(null);
  const typingTimers = useRef<Map<string, number>>(new Map());
  const seen = useRef<Set<string>>(new Set()); // duplicate suppression by message_id
  const activeRef = useRef<string | null>(null);
  const userRef = useRef<User | null>(null);
  activeRef.current = activeId; userRef.current = user;

  const updateUser = useCallback((updated: User) => {
    setUser(updated);
    setConversations((current) => current.map((conversation) => {
      const members = conversation.members.map((member) => member.id === updated.id
        ? { ...member, display_name: updated.display_name, username: updated.username, avatar_url: updated.avatar_url }
        : member);
      return {
        ...conversation,
        members,
        title: conversation.kind === "direct"
          ? members.find((member) => member.id !== updated.id)?.display_name ?? conversation.title
          : conversation.title,
      };
    }));
  }, []);

  const addMessage = useCallback((m: ChatMessage, countUnread = true) => {
    if (seen.current.has(m.id)) return;
    seen.current.add(m.id);
    const next = { ...m, status: m.status ?? (m.sender_id === userRef.current?.id ? "sent" : undefined) };
    setMessages((p) => ({ ...p, [m.conversation_id]: [...(p[m.conversation_id] ?? []), next] }));
    const shouldCountUnread = countUnread && m.conversation_id !== activeRef.current && m.sender_id !== userRef.current?.id;
    setConversations((p) => p.map((c) => (c.id === m.conversation_id ? {
      ...c,
      last_text: m.text,
      last_at: m.created_at,
      last_message_id: m.id,
      last_message_sender_id: m.sender_id,
      last_message_status: m.sender_id === userRef.current?.id ? next.status ?? "sent" : null,
      unread_count: c.unread_count + (shouldCountUnread ? 1 : 0),
    } : c)));
    if (shouldCountUnread)
      setUnread((p) => ({ ...p, [m.conversation_id]: (p[m.conversation_id] ?? 0) + 1 }));
  }, []);

  const loadHistory = useCallback(async (cid: string) => {
    try {
      const history = await api.messages(cid);
      history.forEach((message) => addMessage(message, false));
      if (history.some((m) => m.sender_id !== userRef.current?.id))
        sock.current?.send({ type: activeRef.current === cid ? "conversation.read" : "conversation.delivered", conversation_id: cid });
    } catch { /* shown via connection state */ }
  }, [addMessage]);

  const refreshConversationList = useCallback(async () => {
      const cs = await api.conversations();
      const activeId = activeRef.current;
      const current = cs.map((conversation) => activeId === conversation.id
        ? { ...conversation, unread_count: 0 }
        : conversation);
      setConversations(current);
      setUnread(Object.fromEntries(current.map((conversation) => [conversation.id, conversation.unread_count])));
      return cs;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const cs = await refreshConversationList();
      await Promise.all(cs.map((c) => loadHistory(c.id))); // also restores history after reconnect
    } catch { setNotice("Could not load conversations"); }
  }, [loadHistory, refreshConversationList]);

  const setTyping = useCallback((conversationId: string, isTyping: boolean) => {
    if (!conversationId.trim() || conversationId.length > 64) return;
    sock.current?.send({
      type: isTyping ? "typing.start" : "typing.stop",
      conversation_id: conversationId,
      is_typing: isTyping,
    });
  }, []);

  const sendTo = useCallback((conversationId: string, text: string) => {
    const requestId = crypto.randomUUID();
    const ok = sock.current?.send({ type: "message.send", request_id: requestId, conversation_id: conversationId, text });
    if (!ok) {
      setNotice("Not connected — message was NOT sent");
    }
  }, []);

  const removeMessage = useCallback((id: string, conversationId: string) => {
    void api.deleteMessage(id).then((result) => {
      setMessages((p) => ({ ...p, [conversationId]: (p[conversationId] ?? []).filter((m) => m.id !== id) }));
      setMessageStatus((p) => { const next = { ...p }; delete next[id]; return next; });
      if (result.relay_status === "local_only") setNotice("Deleted locally; other nodes may show the message until they reconnect");
    }).catch(() => setNotice("Message could not be deleted"));
  }, []);

  const editMessage = useCallback(async (id: string, conversationId: string, text: string) => {
    const updated = await api.editMessage(id, text);
    setMessages((p) => ({ ...p, [conversationId]: (p[conversationId] ?? []).map((m) =>
      m.id === id ? { ...m, text: updated.text, edited_at: updated.edited_at } : m) }));
    if (updated.relay_status === "local_only") setNotice("Edited locally; other nodes may show the previous text until they reconnect");
  }, []);

  const onFrame = useCallback((f: ServerFrame) => {
    if (f.type === "auth.ok") {
      setNodeId(f.node_id);
      void refresh();
      if (activeRef.current) sock.current?.send({ type: "conversation.read", conversation_id: activeRef.current });
    }
    else if (f.type === "message.created") {
      const incomingMessage: ChatMessage = { id: f.message_id, conversation_id: f.conversation_id, sender_id: f.sender.id,
        sender_name: f.sender.display_name, text: f.text, created_at: f.created_at, origin_node: f.origin_node,
        status: f.sender.id === userRef.current?.id ? "sent" : undefined };
      addMessage(incomingMessage);
      if (f.sender.id !== userRef.current?.id) {
        sock.current?.send({ type: activeRef.current === f.conversation_id ? "conversation.read" : "message.delivered",
          conversation_id: f.conversation_id, message_id: f.message_id });
      }
    }
    else if (f.type === "message.status") {
      setConversations((p) => p.map((conversation) =>
        conversation.id === f.conversation_id && conversation.last_message_id === f.message_id
          ? { ...conversation, last_message_status: statusRank[conversation.last_message_status ?? "sent"] > statusRank[f.status]
            ? conversation.last_message_status : f.status }
          : conversation));
      setMessages((p) => ({
        ...p, [f.conversation_id]: (p[f.conversation_id] ?? []).map((m) => m.id === f.message_id
          ? { ...m, status: statusRank[m.status ?? "sent"] > statusRank[f.status] ? m.status : f.status,
            delivered_nodes: f.delivered_nodes ?? m.delivered_nodes } : m),
      }));
      setMessageStatus((p) => ({ ...p, [f.message_id]: statusRank[p[f.message_id] ?? "sent"] > statusRank[f.status] ? p[f.message_id] : f.status }));
    }
    else if (f.type === "message.deleted") {
      setMessages((p) => ({ ...p, [f.conversation_id]: (p[f.conversation_id] ?? []).filter((m) => m.id !== f.message_id) }));
      setMessageStatus((p) => { const next = { ...p }; delete next[f.message_id]; return next; });
    }
    else if (f.type === "message.edited") {
      setMessages((p) => ({ ...p, [f.conversation_id]: (p[f.conversation_id] ?? []).map((m) =>
        m.id === f.message_id ? { ...m, text: f.text, edited_at: f.edited_at } : m) }));
    }
    else if (f.type === "typing") {
      const key = `${f.conversation_id}:${f.sender.id}`;
      const previousTimer = typingTimers.current.get(key);
      if (previousTimer) window.clearTimeout(previousTimer);
      if (f.is_typing) {
        setTypingUsers((p) => ({
          ...p,
          [f.conversation_id]: { ...p[f.conversation_id], [f.sender.id]: f.sender.display_name },
        }));
        typingTimers.current.set(key, window.setTimeout(() => {
          setTypingUsers((p) => {
            const users = { ...p[f.conversation_id] };
            delete users[f.sender.id];
            return { ...p, [f.conversation_id]: users };
          });
          typingTimers.current.delete(key);
        }, 4000));
      } else {
        typingTimers.current.delete(key);
        setTypingUsers((p) => {
          const users = { ...p[f.conversation_id] };
          delete users[f.sender.id];
          return { ...p, [f.conversation_id]: users };
        });
      }
    }
    else if (f.type === "message.ack" && f.status === "accepted_local_only")
      setNotice("Sent on this node only; other nodes may not receive it");
    else if (f.type === "error" && f.operation === "typing")
      setNotice(`Typing indicator unavailable (${f.code === "invalid_typing_frame" ? "client/server typing mismatch" : f.code})`);
    else if (f.type === "error" && f.operation === "frame")
      setNotice("The server received an unreadable chat frame. Refresh the app and confirm every backend node is on the same version.");
    else if (f.type === "error" && f.operation !== "receipt")
      setNotice(f.code === "invalid_payload"
        ? f.operation === "message"
          ? "Server rejected a message frame. Check that all backend nodes are running the same version."
          : "Server rejected an unclassified chat frame. Check that all backend nodes are running the same version."
        : `Could not complete the request (${f.code})`);
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

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const refresh = () => {
      if (!document.hidden) {
        void refreshConversationList().catch(() => {
          if (alive) setNotice("Could not refresh conversations");
        });
      }
    };
    const interval = window.setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user?.id, refreshConversationList]);

  // restore session
  useEffect(() => {
    if (!getToken()) return;
    api.me().then(setUser).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);

  const logout = useCallback(() => {
    typingTimers.current.forEach((timer) => window.clearTimeout(timer));
    typingTimers.current.clear();
    setToken(null); setUser(null); setConversations([]); setMessages({}); setUnread({});
    setMessageStatus({}); setTypingUsers({}); setActiveId(null); seen.current.clear(); setConn("disconnected");
  }, []);

  const value = useMemo<Ctx>(() => ({
    user, booting, conversations, messages, unread, messageStatus,
    typing: Object.fromEntries(Object.entries(typing).map(([cid, users]) => [cid, Object.values(users)])),
    activeId, conn, nodeId, online, presenceAvailable, notice, setUser: updateUser,
    async authenticate(mode, u, p, name, email, phone) {
      const r = mode === "login" ? await api.login(u, p) : await api.register(u, name || u, p, email, phone);
      setToken(r.token); updateUser(r.user);
    },
    logout,
    select(id) {
      setActiveId(id);
      if (id) {
        setUnread((p) => ({ ...p, [id]: 0 }));
        setConversations((p) => p.map((conversation) =>
          conversation.id === id ? { ...conversation, unread_count: 0 } : conversation));
        sock.current?.send({ type: "conversation.read", conversation_id: id });
      }
    },
    send(text) {
      if (activeRef.current) sendTo(activeRef.current, text);
    },
    sendTo, removeMessage, editMessage,
    setTyping,
    async openDirect(userId) {
      const c = await api.createConversation("direct", [userId]);
      setConversations((p) => (p.some((x) => x.id === c.id) ? p : [...p, c]));
      setActiveId(c.id);
    },
    async createGroup(title, ids, description, avatar) {
      const preparedAvatar = avatar ? await prepareGroupImage(avatar) : undefined;
      let c = await api.createConversation("group", ids, title, description);
      setConversations((p) => [c, ...p.filter((conversation) => conversation.id !== c.id)]);
      setActiveId(c.id);
      if (preparedAvatar) {
        try {
          c = await api.uploadGroupAvatar(c.id, preparedAvatar);
          setConversations((p) => p.map((conversation) => conversation.id === c.id ? c : conversation));
        } catch (error) {
          setNotice(`Group created, but its picture could not be uploaded: ${error instanceof Error ? error.message : "upload failed"}`);
        }
      }
    },
    async updateGroup(id, title, description, avatar) {
      let updated = await api.updateConversation(id, title, description);
      setConversations((current) => current.map((conversation) => conversation.id === id ? updated : conversation));
      if (avatar) {
        try {
          updated = await api.uploadGroupAvatar(id, avatar);
          setConversations((current) => current.map((conversation) => conversation.id === id ? updated : conversation));
        } catch (error) {
          setNotice(`Group details were saved, but its picture could not be uploaded: ${error instanceof Error ? error.message : "upload failed"}`);
        }
      }
    },
    async uploadGroupAvatar(id, file) {
      const prepared = await prepareGroupImage(file);
      const updated = await api.uploadGroupAvatar(id, prepared);
      setConversations((current) => current.map((conversation) => conversation.id === id ? updated : conversation));
    },
    async deleteGroupAvatar(id) {
      const updated = await api.deleteGroupAvatar(id);
      setConversations((current) => current.map((conversation) => conversation.id === id ? updated : conversation));
    },
  }), [user, booting, conversations, messages, unread, messageStatus, typing, activeId, conn, nodeId, online, presenceAvailable, notice, logout, setTyping, sendTo, removeMessage, editMessage, updateUser]);

  void WS_NODE_URLS;
  return <C.Provider value={value}>{children}</C.Provider>;
}
