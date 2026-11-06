import { API_BASES } from "../config/env";
import type { AdminAuditEvent, AdminOverview, AdminUser, ChatMessage, ClusterStatus, Conversation, GroupInvite, Member, PublicProfile, StoryGroup, StoryViews, User, VerificationApplication, VerificationStatus } from "../types";

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
async function requestBlob(path: string): Promise<Blob> {
  const order = API_BASES.map((_, i) => (preferred + i) % API_BASES.length);
  for (const i of order) {
    try {
      const res = await fetch(API_BASES[i] + path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      preferred = i;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(res.status, typeof body.detail === "string" ? body.detail : `HTTP ${res.status}`);
      }
      return await res.blob();
    } catch (error) {
      if (error instanceof ApiError) throw error;
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
  userProfile: (userId: string) => request<PublicProfile>(`/api/users/${encodeURIComponent(userId)}`),
  followCounts: () => request<{ followers: number; following: number }>("/api/me/follows"),
  verificationStatus: () => request<VerificationStatus>("/api/me/verification"),
  applyForVerification: (reason: string) => request<VerificationStatus>("/api/me/verification", {
    method: "POST", body: j({ reason }),
  }),
  followers: (userId: string) => request<Member[]>(`/api/users/${encodeURIComponent(userId)}/followers`),
  following: (userId: string) => request<Member[]>(`/api/users/${encodeURIComponent(userId)}/following`),
  followUser: (userId: string) => request<{ user_id: string; is_following: boolean; followers: number; following: number }>(
    `/api/users/${encodeURIComponent(userId)}/follow`, { method: "POST" }),
  unfollowUser: (userId: string) => request<{ user_id: string; is_following: boolean; followers: number; following: number }>(
    `/api/users/${encodeURIComponent(userId)}/follow`, { method: "DELETE" }),
  matchContacts: (emails: string[], phones: string[]) =>
    request<Member[]>("/api/contacts/match", { method: "POST", body: j({ emails, phones }) }),
  presence: () => request<{ available: boolean; online: string[] }>("/api/presence"),
  conversations: () => request<Conversation[]>("/api/conversations"),
  deleteConversation: (conversationId: string) =>
    request<{ conversation_id: string; hidden: boolean }>(
      `/api/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" }),
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
  groupMembers: (conversationId: string) => request<Member[]>(
    `/api/conversations/${encodeURIComponent(conversationId)}/members`),
  inviteToGroup: (conversationId: string, userId: string) => request<{ invite_id: string; status: string }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/invites`, { method: "POST", body: j({ user_id: userId }) }),
  groupInvites: () => request<GroupInvite[]>("/api/group-invites"),
  acceptGroupInvite: (inviteId: string) => request<Conversation>(
    `/api/group-invites/${encodeURIComponent(inviteId)}/accept`, { method: "POST" }),
  declineGroupInvite: (inviteId: string) => request<{ invite_id: string; status: string }>(
    `/api/group-invites/${encodeURIComponent(inviteId)}`, { method: "DELETE" }),
  setGroupAdmin: (conversationId: string, userId: string, enabled: boolean) => request<{ user_id: string; is_admin: boolean }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/admins/${encodeURIComponent(userId)}?enabled=${enabled}`, { method: "PUT" }),
  removeGroupMember: (conversationId: string, userId: string) => request<{ user_id: string; removed: boolean }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  leaveGroup: (conversationId: string) => request<{ conversation_id: string; left: boolean }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/leave`, { method: "DELETE" }),
  stories: () => request<StoryGroup[]>("/api/stories"),
  createStory: (text: string, imageData?: string, imageContentType?: string, audience: "all" | "messages" | "followers" | "both" = "all") =>
    request<{ story_id: string }>("/api/stories", {
      method: "POST",
      body: j({ text, audience, ...(imageData && imageContentType ? { image_data: imageData, image_content_type: imageContentType } : {}) }),
    }),
  storyImage: (storyId: string) => requestBlob(`/api/stories/${encodeURIComponent(storyId)}/image`),
  viewStory: (storyId: string) => request<{ story_id: string; viewed: boolean }>(
    `/api/stories/${encodeURIComponent(storyId)}/view`, { method: "POST" }),
  reactToStory: (storyId: string, reaction: string) => request<{ story_id: string; reaction: string | null; count: number }>(
    `/api/stories/${encodeURIComponent(storyId)}/reaction`, { method: "PUT", body: j({ reaction }) }),
  storyViews: (storyId: string) => request<StoryViews>(`/api/stories/${encodeURIComponent(storyId)}/views`),
  deleteStory: (storyId: string) => request<{ story_id: string; deleted: boolean }>(
    `/api/stories/${encodeURIComponent(storyId)}`, { method: "DELETE" }),
  messages: (cid: string) => request<ChatMessage[]>(`/api/conversations/${cid}/messages`),
  deleteMessage: (id: string) => request<{ message_id: string; conversation_id: string; relay_status: "relayed" | "local_only" }>(`/api/messages/${encodeURIComponent(id)}`, { method: "DELETE" }),
  deleteMessages: (messageIds: string[]) =>
    request<{ deleted: { message_id: string; conversation_id: string; relay_status: "relayed" | "local_only" }[] }>(
      "/api/messages/bulk-delete", { method: "POST", body: j({ message_ids: messageIds }) }),
  editMessage: (id: string, text: string) => request<{ message_id: string; conversation_id: string; text: string; edited_at: string; relay_status: "relayed" | "local_only" }>(
    `/api/messages/${encodeURIComponent(id)}`, { method: "PUT", body: j({ text }) }),
  cluster: () => request<ClusterStatus>("/api/monitoring/cluster"),
  adminOverview: () => request<AdminOverview>("/api/admin/overview"),
  adminUsers: (q = "") => request<AdminUser[]>(`/api/admin/users?q=${encodeURIComponent(q)}`),
  verificationApplications: () => request<VerificationApplication[]>("/api/admin/verification-applications"),
  reviewVerificationApplication: (userId: string, approved: boolean) =>
    request<{ user_id: string; is_verified: boolean; status: "approved" | "denied" }>(
      `/api/admin/verification-applications/${encodeURIComponent(userId)}`, { method: "PUT", body: j({ approved }) }),
  setUserAdmin: (userId: string, enabled: boolean) =>
    request<{ user_id: string; is_admin: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}/admin?enabled=${enabled}`, { method: "PUT" }),
  setUserSuspended: (userId: string, enabled: boolean) =>
    request<{ user_id: string; is_suspended: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}/suspended?enabled=${enabled}`, { method: "PUT" }),
  adminAudit: () => request<AdminAuditEvent[]>("/api/admin/audit"),
  setNodeEnabled: (nodeId: string, enabled: boolean) =>
    request<{ node_id: string; enabled: boolean }>(`/api/admin/nodes/${encodeURIComponent(nodeId)}/enabled?enabled=${enabled}`, { method: "PUT" }),
};
