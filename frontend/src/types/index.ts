export interface User {
  id: string; username: string; display_name: string; bio: string; is_admin: boolean;
  email: string | null; phone: string | null; avatar_url: string | null;
}
export interface Member { id: string; display_name: string; username: string; avatar_url?: string | null }
export interface Conversation {
  id: string; kind: "direct" | "group"; title: string; members: Member[];
  description: string; avatar_url: string | null;
  last_text: string | null; last_at: string | null;
  last_message_id: string | null; last_message_sender_id: string | null;
  last_message_status: MessageStatus | null; unread_count: number;
}
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export interface ChatMessage {
  id: string; conversation_id: string; sender_id: string; sender_name: string;
  text: string; created_at: string; edited_at?: string | null; origin_node: string | null; delivered_nodes?: string | null; status?: MessageStatus;
}
export type ConnState = "connected" | "reconnecting" | "disconnected";
export type ServerFrame =
  | { type: "auth.ok"; node_id: string }
  | { type: "message.created"; event_id: string; message_id: string; conversation_id: string;
      sender: { id: string; display_name: string }; text: string; created_at: string; origin_node: string }
  | { type: "message.ack"; request_id: string; message_id: string; status: "accepted" | "accepted_local_only" }
  | { type: "typing"; event_id: string; conversation_id: string;
      sender: { id: string; display_name: string }; is_typing: boolean }
  | { type: "message.status"; message_id: string; conversation_id: string; status: "delivered" | "read"; delivered_nodes: string | null }
  | { type: "message.deleted"; message_id: string; conversation_id: string }
  | { type: "message.edited"; message_id: string; conversation_id: string; text: string; edited_at: string }
  | { type: "error"; code: string; request_id?: string; operation?: string; message?: string }
  | { type: "pong"; ts: number };
export interface NodeStatus {
  node_id: string; status: "online" | "offline" | "disabled"; enabled: boolean; port: number | null; connections: number | null;
  uptime_s: number | null; last_heartbeat: number | null;
}
export interface ClusterStatus {
  redis: "connected" | "disconnected"; nodes: NodeStatus[]; checked_at: number; answered_by?: string;
  traffic: null | { window: string; series: { minute: number; sent: number; delivered: number }[] };
}
export interface AdminOverview {
  users: number; admins: number; groups: number; messages: number; suspended: number;
}
export interface AdminUser {
  id: string; username: string; display_name: string; email: string | null; created_at: number;
  is_admin: boolean; managed_by_config: boolean; is_suspended: boolean;
}
export interface AdminAuditEvent {
  id: number; action: string; details: string; created_at: number;
  actor_id: string | null; actor_username: string | null; actor_name: string | null;
  target_id: string | null; target_username: string | null; target_name: string | null;
}
