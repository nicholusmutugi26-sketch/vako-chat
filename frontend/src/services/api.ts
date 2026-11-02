import { API_BASES } from "../config/env";
import type { ChatMessage, ClusterStatus, Conversation, Member, User } from "../types";

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
  register: (username: string, display_name: string, password: string) =>
    request<{ token: string; user: User }>("/api/auth/register", { method: "POST", body: j({ username, display_name, password }) }),
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>("/api/auth/login", { method: "POST", body: j({ username, password }) }),
  me: () => request<User>("/api/me"),
  updateMe: (display_name: string, bio: string) => request<User>("/api/me", { method: "PUT", body: j({ display_name, bio }) }),
  users: (q = "") => request<Member[]>(`/api/users?q=${encodeURIComponent(q)}`),
  presence: () => request<{ available: boolean; online: string[] }>("/api/presence"),
  conversations: () => request<Conversation[]>("/api/conversations"),
  createConversation: (kind: "direct" | "group", member_ids: string[], title?: string) =>
    request<Conversation>("/api/conversations", { method: "POST", body: j({ kind, member_ids, title }) }),
  messages: (cid: string) => request<ChatMessage[]>(`/api/conversations/${cid}/messages`),
  cluster: () => request<ClusterStatus>("/api/monitoring/cluster"),
};
