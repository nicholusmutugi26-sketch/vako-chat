import { API_BASES } from "../config/env";
import type { AdminAuditEvent, AdminOverview, AdminUser, ChatMessage, ClusterStatus, Conversation, Member, User } from "../types";

// sessionStorage: cleared on tab close. Trade-off vs HttpOnly cookie noted in README.
let token: string | null = sessionStorage.getItem("vk_token");
let preferred = 0;
export const setToken = (t: string | null) => {
  token = t;
  if (t) sessionStorage.setItem("vk_token", t); else sessionStorage.removeItem("vk_token");
};
export const getToken = () => token;
export const setPreferredBase = (i: number) => { preferred = i; };

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/** Tries the preferred node first, then the others, only on network failure (not on HTTP errors). */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const order = API_BASES.map((_, i) => (preferred + i) % API_BASES.length);
  for (const i of order) {
    try {
      const res = await fetch(API_BASES[i] + path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
      });
      preferred = i;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(res.status, typeof body.detail === "string" ? body.detail : `HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof ApiError) throw e;
    }
  }
  throw new Error("All nodes unreachable");
}
const j = (b: unknown) => JSON.stringify(b);

export const api = {
  register: (username: string, display_name: string, password: string, email?: string, phone?: string) =>
    request<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: j({ username, display_name, password, ...(email ? { email } : {}), ...(phone ? { phone } : {}) }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>("/api/auth/login", { method: "POST", body: j({ username, password }) }),
  me: () => request<User>("/api/me"),
  updateMe: (display_name: string, bio: string, email: string, phone: string | null) =>
    request<User>("/api/me", { method: "PUT", body: j({ display_name, bio, email: email || null, phone }) }),
  uploadAvatar: (file: File) => request<User>("/api/me/avatar", {
    method: "PUT", headers: { "Content-Type": file.type }, body: file,
  }),
  deleteAvatar: () => request<User>("/api/me/avatar", { method: "DELETE" }),
  users: (q = "") => request<Member[]>(`/api/users?q=${encodeURIComponent(q)}`),
  matchContacts: (emails: string[], phones: string[]) =>
    request<Member[]>("/api/contacts/match", { method: "POST", body: j({ emails, phones }) }),
  presence: () => request<{ available: boolean; online: string[] }>("/api/presence"),
  conversations: () => request<Conversation[]>("/api/conversations"),
  createConversation: (kind: "direct" | "group", member_ids: string[], title?: string, description = "") =>
    request<Conversation>("/api/conversations", { method: "POST", body: j({ kind, member_ids, title, description }) }),
  updateConversation: (conversationId: string, title: string, description: string) =>
    request<Conversation>(`/api/conversations/${encodeURIComponent(conversationId)}`, {
      method: "PUT", body: j({ title, description }),
    }),
  uploadGroupAvatar: (conversationId: string, file: File) =>
    request<Conversation>(`/api/conversations/${encodeURIComponent(conversationId)}/avatar`, {
      method: "PUT", headers: { "Content-Type": file.type }, body: file,
    }),
  deleteGroupAvatar: (conversationId: string) =>
    request<Conversation>(`/api/conversations/${encodeURIComponent(conversationId)}/avatar`, { method: "DELETE" }),
  messages: (cid: string) => request<ChatMessage[]>(`/api/conversations/${cid}/messages`),
  deleteMessage: (id: string) => request<{ message_id: string; conversation_id: string; relay_status: "relayed" | "local_only" }>(`/api/messages/${encodeURIComponent(id)}`, { method: "DELETE" }),
  editMessage: (id: string, text: string) => request<{ message_id: string; conversation_id: string; text: string; edited_at: string; relay_status: "relayed" | "local_only" }>(
    `/api/messages/${encodeURIComponent(id)}`, { method: "PUT", body: j({ text }) }),
  cluster: () => request<ClusterStatus>("/api/monitoring/cluster"),
  adminOverview: () => request<AdminOverview>("/api/admin/overview"),
  adminUsers: (q = "") => request<AdminUser[]>(`/api/admin/users?q=${encodeURIComponent(q)}`),
  setUserAdmin: (userId: string, enabled: boolean) =>
    request<{ user_id: string; is_admin: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}/admin?enabled=${enabled}`, { method: "PUT" }),
  setUserSuspended: (userId: string, enabled: boolean) =>
    request<{ user_id: string; is_suspended: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}/suspended?enabled=${enabled}`, { method: "PUT" }),
  adminAudit: () => request<AdminAuditEvent[]>("/api/admin/audit"),
  setNodeEnabled: (nodeId: string, enabled: boolean) =>
    request<{ node_id: string; enabled: boolean }>(`/api/admin/nodes/${encodeURIComponent(nodeId)}/enabled?enabled=${enabled}`, { method: "PUT" }),
};
